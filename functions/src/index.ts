import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { createHash } from "node:crypto";
import Stripe from "stripe";

initializeApp();

const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const openObserveUsername = defineSecret("OPENOBSERVE_USERNAME");
const openObservePassword = defineSecret("OPENOBSERVE_PASSWORD");

const HEALTH_SERVICES = new Set(["auth", "firestore", "storage", "functions", "recordingQueue"]);
const HEALTH_STATUSES = new Set(["ok", "degraded", "down", "unknown"]);
const CLOUD_MODES = new Set(["local", "cloud"]);
const CLIENT_PLATFORMS = new Set(["electron", "web"]);

type StripeSubscriptionWithUid = Stripe.Subscription & {
  metadata: {
    firebaseUid?: string;
  };
};

export const stripeWebhook = onRequest(
  {
    secrets: [stripeWebhookSecret, stripeSecretKey],
    cors: false
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).send("Method not allowed");
      return;
    }

    const signature = request.header("stripe-signature");
    if (!signature) {
      response.status(400).send("Missing Stripe signature");
      return;
    }

    const stripe = new Stripe(stripeSecretKey.value());
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(request.rawBody, signature, stripeWebhookSecret.value());
    } catch (caught) {
      logger.warn("Rejected Stripe webhook", caught);
      response.status(400).send("Invalid Stripe signature");
      return;
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as StripeSubscriptionWithUid;
      const uid = subscription.metadata.firebaseUid;
      if (!uid) {
        logger.warn("Stripe subscription missing firebaseUid metadata", { subscriptionId: subscription.id });
        response.status(200).send("Ignored subscription without firebaseUid");
        return;
      }

      const active = ["active", "trialing"].includes(subscription.status);
      const currentPeriodEnd = subscription.items.data[0]?.current_period_end ?? null;
      await getFirestore().doc(`users/${uid}/entitlements/cloudSync`).set(
        {
          active,
          source: "stripe",
          stripeSubscriptionId: subscription.id,
          updatedAt: new Date().toISOString(),
          expiresAt: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null
        },
        { merge: true }
      );
    }

    response.status(200).send("ok");
  }
);

export const cleanupReplacedRecording = onDocumentUpdated("users/{uid}/words/{wordId}", async (event) => {
  const beforePath = event.data?.before.data()?.recording?.storagePath as string | undefined;
  const afterPath = event.data?.after.data()?.recording?.storagePath as string | undefined;
  if (!beforePath || beforePath === afterPath) {
    return;
  }
  try {
    await getStorage().bucket().file(beforePath).delete({ ignoreNotFound: true });
  } catch (caught) {
    logger.warn("Failed to delete replaced recording", { beforePath, error: caught });
  }
});

export const monitorHealth = onRequest(
  {
    cors: true
  },
  (request, response) => {
    if (request.method !== "GET") {
      response.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }
    response.status(200).json({
      ok: true,
      checkedAt: new Date().toISOString(),
      version: process.env.K_REVISION ?? "local"
    });
  }
);

export const monitorIngest = onRequest(
  {
    cors: true,
    secrets: [openObserveUsername, openObservePassword]
  },
  async (request, response) => {
    if (request.method !== "POST") {
      response.status(405).json({ accepted: false, error: "Method not allowed" });
      return;
    }

    const authorization = request.header("authorization") ?? "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      response.status(401).json({ accepted: false, error: "Missing Firebase bearer token" });
      return;
    }

    let uid: string;
    try {
      uid = (await getAuth().verifyIdToken(token)).uid;
    } catch (caught) {
      logger.warn("Rejected monitor ingest request with invalid token", { error: caught });
      response.status(401).json({ accepted: false, error: "Invalid Firebase bearer token" });
      return;
    }

    const config = openObserveConfig();
    if (!config) {
      logger.warn("OpenObserve monitor ingest is not configured");
      response.status(503).json({ accepted: false, error: "OpenObserve is not configured" });
      return;
    }

    const payloadSize = Buffer.byteLength(JSON.stringify(request.body ?? {}), "utf8");
    if (payloadSize > 50_000) {
      response.status(413).json({ accepted: false, error: "Payload too large" });
      return;
    }

    const event = sanitizeMonitorSnapshot(request.body, uid);
    try {
      const ingestResponse = await fetch(`${config.endpoint}/api/${config.org}/${config.stream}/_json`, {
        method: "POST",
        headers: {
          "authorization": `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
          "content-type": "application/json"
        },
        body: JSON.stringify([event])
      });
      if (!ingestResponse.ok) {
        const body = await ingestResponse.text().catch(() => "");
        logger.warn("OpenObserve monitor ingest failed", {
          status: ingestResponse.status,
          body: truncate(body, 500)
        });
        response.status(502).json({ accepted: false, error: `OpenObserve returned HTTP ${ingestResponse.status}` });
        return;
      }
    } catch (caught) {
      logger.warn("OpenObserve monitor ingest request failed", { error: caught });
      response.status(502).json({ accepted: false, error: "OpenObserve request failed" });
      return;
    }

    response.status(200).json({ accepted: true });
  }
);

function openObserveConfig(): {
  endpoint: string;
  org: string;
  stream: string;
  username: string;
  password: string;
} | null {
  const endpoint = normalizeEndpoint(process.env.OPENOBSERVE_ENDPOINT);
  const org = safePathSegment(process.env.OPENOBSERVE_ORG ?? "default");
  const stream = safePathSegment(process.env.OPENOBSERVE_STREAM ?? "pronunciation_vault_health");
  const username = openObserveUsername.value();
  const password = openObservePassword.value();

  if (!endpoint || !org || !stream || !username || !password) {
    return null;
  }
  return { endpoint, org, stream, username, password };
}

function sanitizeMonitorSnapshot(raw: unknown, uid: string): Record<string, unknown> {
  const input = isRecord(raw) ? raw : {};
  const now = new Date().toISOString();
  const checks = Array.isArray(input.checks) ? input.checks.slice(0, 10).map(sanitizeHealthCheck) : [];
  const overallStatus = summarizeStatus(checks.map((check) => String(check.status)));

  return {
    schemaVersion: 1,
    receivedAt: now,
    checkedAt: isoString(input.checkedAt) ?? now,
    appVersion: safeText(input.appVersion, 40, "unknown"),
    platform: enumString(input.platform, CLIENT_PLATFORMS, "web"),
    mode: enumString(input.mode, CLOUD_MODES, "local"),
    uidHash: uidHash(uid),
    isOnline: Boolean(input.isOnline),
    pendingRecordingUploads: safeInteger(input.pendingRecordingUploads, 0, 10_000),
    failedRecordingUploads: safeInteger(input.failedRecordingUploads, 0, 10_000),
    overallStatus,
    checks
  };
}

function sanitizeHealthCheck(raw: unknown): Record<string, unknown> {
  const input = isRecord(raw) ? raw : {};
  return {
    service: enumString(input.service, HEALTH_SERVICES, "functions"),
    status: enumString(input.status, HEALTH_STATUSES, "unknown"),
    latencyMs: input.latencyMs === null ? null : safeInteger(input.latencyMs, 0, 60_000),
    checkedAt: isoString(input.checkedAt) ?? new Date().toISOString(),
    message: safeText(input.message, 160, ""),
    errorCode: input.errorCode === null ? null : safeText(input.errorCode, 80, null)
  };
}

function summarizeStatus(statuses: string[]): string {
  if (statuses.includes("down")) {
    return "down";
  }
  if (statuses.includes("degraded")) {
    return "degraded";
  }
  if (statuses.includes("unknown")) {
    return "unknown";
  }
  return "ok";
}

function normalizeEndpoint(value: string | undefined): string | null {
  const endpoint = value?.trim().replace(/\/+$/, "");
  if (!endpoint || !/^https?:\/\//.test(endpoint)) {
    return null;
  }
  return endpoint;
}

function safePathSegment(value: string): string | null {
  const segment = value.trim();
  return /^[a-zA-Z0-9_-]+$/.test(segment) ? segment : null;
}

function enumString(value: unknown, allowed: Set<string>, fallback: string): string {
  return typeof value === "string" && allowed.has(value) ? value : fallback;
}

function safeText(value: unknown, maxLength: number, fallback: string | null): string | null {
  if (typeof value !== "string") {
    return fallback;
  }
  return truncate(value.replace(/[\r\n\t]+/g, " ").trim(), maxLength) || fallback;
}

function safeInteger(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function isoString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function uidHash(uid: string): string {
  return createHash("sha256").update(uid).digest("hex").slice(0, 32);
}

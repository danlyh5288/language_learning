import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";

initializeApp();

const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");

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

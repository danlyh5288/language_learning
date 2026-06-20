import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadString } from "firebase/storage";

let testEnv: RulesTestEnvironment;

describe("Firebase security rules", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "language-vault-5a846",
      firestore: {
        rules: fs.readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8")
      },
      storage: {
        rules: fs.readFileSync(path.join(process.cwd(), "storage.rules"), "utf8")
      }
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users/user-1/entitlements/cloudSync"), {
        active: true,
        source: "manual",
        updatedAt: "2026-06-18T10:00:00.000Z"
      });
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it("allows entitled users to write their own cloud vocabulary", async () => {
    const db = testEnv.authenticatedContext("user-1", { email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, "users/user-1"), {
      libraryInitialized: true,
      updatedAt: "2026-06-18T10:00:00.000Z"
    }));
    await assertSucceeds(setDoc(doc(db, "users/user-1/words/word-1"), {
      text: "侬好",
      tagId: null,
      toneNote: "开口轻一点",
      recording: null,
      createdAt: "2026-06-18T10:00:00.000Z",
      updatedAt: "2026-06-18T10:00:00.000Z",
      deletedAt: null
    }));
  });

  it("rejects unverified users even when they are entitled", async () => {
    const db = testEnv.authenticatedContext("user-1", { email_verified: false }).firestore();

    await assertFails(setDoc(doc(db, "users/user-1/words/word-1"), {
      text: "侬好",
      tagId: null,
      toneNote: "开口轻一点",
      recording: null,
      createdAt: "2026-06-18T10:00:00.000Z",
      updatedAt: "2026-06-18T10:00:00.000Z",
      deletedAt: null
    }));
    await assertSucceeds(getDoc(doc(db, "users/user-1/entitlements/cloudSync")));
  });

  it("rejects cross-user and unsubscribed writes", async () => {
    const userOneDb = testEnv.authenticatedContext("user-1", { email_verified: true }).firestore();
    const userTwoDb = testEnv.authenticatedContext("user-2", { email_verified: true }).firestore();

    await assertFails(setDoc(doc(userOneDb, "users/user-2/words/word-1"), {
      text: "越权",
      tagId: null,
      toneNote: "",
      recording: null,
      createdAt: "2026-06-18T10:00:00.000Z",
      updatedAt: "2026-06-18T10:00:00.000Z",
      deletedAt: null
    }));
    await assertFails(setDoc(doc(userTwoDb, "users/user-2/words/word-1"), {
      text: "未订阅",
      tagId: null,
      toneNote: "",
      recording: null,
      createdAt: "2026-06-18T10:00:00.000Z",
      updatedAt: "2026-06-18T10:00:00.000Z",
      deletedAt: null
    }));
  });

  it("protects recording storage by owner and entitlement", async () => {
    const userOneStorage = testEnv.authenticatedContext("user-1", { email_verified: true }).storage();
    const unverifiedUserOneStorage = testEnv.authenticatedContext("user-1", { email_verified: false }).storage();
    const userTwoStorage = testEnv.authenticatedContext("user-2", { email_verified: true }).storage();

    await assertSucceeds(uploadString(
      ref(userOneStorage, "recordings/user-1/word-1/recording-1.m4a"),
      "audio"
    ));
    await assertFails(uploadString(
      ref(unverifiedUserOneStorage, "recordings/user-1/word-1/recording-2.m4a"),
      "audio"
    ));
    await assertFails(uploadString(
      ref(userOneStorage, "recordings/user-2/word-1/recording-1.m4a"),
      "audio"
    ));
    await assertFails(uploadString(
      ref(userTwoStorage, "recordings/user-2/word-1/recording-1.m4a"),
      "audio"
    ));
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VocabApi } from "../shared/types";

const firebaseMocks = vi.hoisted(() => {
  const auth = {
    currentUser: {
      uid: "user-1",
      email: "learner@example.com",
      emailVerified: false,
      reload: vi.fn(async () => undefined)
    }
  };

  return {
    auth,
    getDoc: vi.fn()
  };
});

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({}))
}));

vi.mock("firebase/auth", () => ({
  browserLocalPersistence: {},
  createUserWithEmailAndPassword: vi.fn(),
  getAuth: vi.fn(() => firebaseMocks.auth),
  sendEmailVerification: vi.fn(),
  setPersistence: vi.fn(async () => undefined),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(async () => undefined)
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(),
  getDoc: firebaseMocks.getDoc,
  getDocs: vi.fn(),
  initializeFirestore: vi.fn(() => ({})),
  persistentLocalCache: vi.fn(() => ({})),
  persistentSingleTabManager: vi.fn(() => ({})),
  query: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn()
}));

vi.mock("firebase/storage", () => ({
  getDownloadURL: vi.fn(),
  getStorage: vi.fn(() => ({})),
  ref: vi.fn(),
  uploadBytes: vi.fn()
}));

vi.mock("./firebaseConfig", () => ({
  getFirebaseWebConfig: vi.fn(() => ({
    apiKey: "test-api-key",
    authDomain: "test.firebaseapp.com",
    projectId: "test-project",
    storageBucket: "test.appspot.com",
    messagingSenderId: "123",
    appId: "test-app"
  }))
}));

describe("Firebase cloud API", () => {
  beforeEach(() => {
    vi.resetModules();
    firebaseMocks.auth.currentUser = {
      uid: "user-1",
      email: "learner@example.com",
      emailVerified: false,
      reload: vi.fn(async () => undefined)
    };
    firebaseMocks.getDoc.mockClear();
  });

  it("does not read entitlement status before email verification", async () => {
    const { createFirebaseAwareApi } = await import("./firebaseCloudApi");
    const api = createFirebaseAwareApi(createLocalApi());

    await expect(api.cloudSync?.getStatus()).resolves.toMatchObject({
      mode: "local",
      user: {
        uid: "user-1",
        email: "learner@example.com",
        emailVerified: false
      },
      isEntitled: false,
      pendingRecordingUploads: 0,
      lastSyncError: null
    });
    expect(firebaseMocks.getDoc).not.toHaveBeenCalled();
  });
});

function createLocalApi(): VocabApi {
  return {
    words: {
      list: vi.fn(async () => []),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    tags: {
      list: vi.fn(async () => []),
      create: vi.fn()
    },
    recordings: {
      saveForWord: vi.fn(),
      getPlaybackUrl: vi.fn(async () => null)
    }
  };
}

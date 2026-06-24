import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VocabApi } from "../shared/types";

const firebaseMocks = vi.hoisted(() => {
  const auth = {
    currentUser: {
      uid: "user-1",
      email: "learner@example.com",
      emailVerified: false,
      metadata: {
        lastSignInTime: new Date().toISOString()
      },
      reload: vi.fn(async () => undefined)
    }
  };

  return {
    auth,
    createUserWithEmailAndPassword: vi.fn(),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    onSnapshot: vi.fn(),
    sendEmailVerification: vi.fn(async () => undefined),
    setDoc: vi.fn(async () => undefined),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(async () => undefined)
  };
});

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => ({}))
}));

vi.mock("firebase/auth", () => ({
  browserLocalPersistence: {},
  createUserWithEmailAndPassword: firebaseMocks.createUserWithEmailAndPassword,
  getAuth: vi.fn(() => firebaseMocks.auth),
  sendEmailVerification: firebaseMocks.sendEmailVerification,
  setPersistence: vi.fn(async () => undefined),
  signInWithEmailAndPassword: firebaseMocks.signInWithEmailAndPassword,
  signOut: firebaseMocks.signOut
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, path: string) => ({ path })),
  doc: vi.fn((_db, ...segments: string[]) => ({ path: segments.join("/") })),
  getDoc: firebaseMocks.getDoc,
  getDocs: firebaseMocks.getDocs,
  initializeFirestore: vi.fn(() => ({})),
  onSnapshot: firebaseMocks.onSnapshot,
  persistentLocalCache: vi.fn(() => ({})),
  persistentSingleTabManager: vi.fn(() => ({})),
  query: vi.fn((collectionRef, ...constraints) => ({ collectionRef, constraints })),
  setDoc: firebaseMocks.setDoc,
  updateDoc: vi.fn(),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value }))
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
      metadata: {
        lastSignInTime: new Date().toISOString()
      },
      reload: vi.fn(async () => undefined)
    };
    firebaseMocks.getDoc.mockClear();
    firebaseMocks.getDocs.mockClear();
    firebaseMocks.getDocs.mockResolvedValue({ docs: [] });
    firebaseMocks.getDoc.mockResolvedValue({ data: () => undefined });
    firebaseMocks.createUserWithEmailAndPassword.mockReset();
    firebaseMocks.createUserWithEmailAndPassword.mockResolvedValue({ user: firebaseMocks.auth.currentUser });
    firebaseMocks.onSnapshot.mockReset();
    firebaseMocks.onSnapshot.mockImplementation((_query, next) => {
      next();
      return vi.fn();
    });
    firebaseMocks.sendEmailVerification.mockClear();
    firebaseMocks.setDoc.mockClear();
    firebaseMocks.signInWithEmailAndPassword.mockReset();
    firebaseMocks.signInWithEmailAndPassword.mockResolvedValue({ user: firebaseMocks.auth.currentUser });
    firebaseMocks.signOut.mockClear();
  });

  it("treats a signed-in unverified user as cloud-capable", async () => {
    const { createFirebaseAwareApi } = await import("./firebaseCloudApi");
    const api = createFirebaseAwareApi(createLocalApi());

    await expect(api.cloudSync?.getStatus()).resolves.toMatchObject({
      mode: "local",
      user: {
        uid: "user-1",
        email: "learner@example.com",
        emailVerified: false
      },
      isEntitled: true,
      pendingRecordingUploads: 0,
      lastSyncError: null
    });
    expect(firebaseMocks.getDoc).not.toHaveBeenCalled();
  });

  it("uses cloud vocabulary data when cloud mode belongs to an unverified user", async () => {
    localStorage.setItem("pronunciation-vault-cloud-mode", "cloud");
    const { createFirebaseAwareApi } = await import("./firebaseCloudApi");
    const localApi = createLocalApi();
    const api = createFirebaseAwareApi(localApi);

    await expect(api.words.list()).resolves.toEqual([]);

    expect(localApi.words.list).not.toHaveBeenCalled();
    expect(firebaseMocks.getDocs).toHaveBeenCalled();
    expect(localStorage.getItem("pronunciation-vault-cloud-mode")).toBe("cloud");
  });

  it("signs in without blocking on cloud activation", async () => {
    const { createFirebaseAwareApi } = await import("./firebaseCloudApi");
    const localApi = createLocalApi();
    const api = createFirebaseAwareApi(localApi);

    await expect(api.auth?.signIn({ email: "learner@example.com", password: "123456" })).resolves.toEqual({
      user: {
        uid: "user-1",
        email: "learner@example.com",
        emailVerified: false
      }
    });

    expect(firebaseMocks.signInWithEmailAndPassword).toHaveBeenCalledWith(
      firebaseMocks.auth,
      "learner@example.com",
      "123456"
    );
    expect(firebaseMocks.getDoc).not.toHaveBeenCalled();
    expect(firebaseMocks.setDoc).not.toHaveBeenCalled();
    expect(localStorage.getItem("pronunciation-vault-cloud-mode")).toBe("local");
  });

  it("enables cloud mode without entitlement when requested after auth", async () => {
    const { createFirebaseAwareApi } = await import("./firebaseCloudApi");
    const localApi = createLocalApi();
    const api = createFirebaseAwareApi(localApi);

    await expect(api.cloudSync?.enable()).resolves.toMatchObject({
      mode: "cloud",
      user: {
        uid: "user-1",
        email: "learner@example.com",
        emailVerified: false
      },
      isEnabled: true
    });

    expect(firebaseMocks.getDoc).toHaveBeenCalled();
    expect(firebaseMocks.setDoc).toHaveBeenCalled();
    expect(localStorage.getItem("pronunciation-vault-cloud-mode")).toBe("cloud");
  });

  it("subscribes to cloud tag and word snapshots", async () => {
    localStorage.setItem("pronunciation-vault-cloud-mode", "cloud");
    const { createFirebaseAwareApi } = await import("./firebaseCloudApi");
    const listener = vi.fn();
    const api = createFirebaseAwareApi(createLocalApi());

    const unsubscribe = await api.cloudSync?.subscribe?.(listener);
    unsubscribe?.();

    expect(firebaseMocks.onSnapshot).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps a persisted auth user whose last sign-in is within 30 days", async () => {
    firebaseMocks.auth.currentUser.metadata.lastSignInTime = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
    const { createFirebaseAwareApi } = await import("./firebaseCloudApi");
    const api = createFirebaseAwareApi(createLocalApi());

    await expect(api.auth?.getState()).resolves.toEqual({
      user: {
        uid: "user-1",
        email: "learner@example.com",
        emailVerified: false
      }
    });
    expect(firebaseMocks.signOut).not.toHaveBeenCalled();
  });

  it("signs out a persisted auth user whose last sign-in is older than 30 days", async () => {
    localStorage.setItem("pronunciation-vault-cloud-mode", "cloud");
    firebaseMocks.auth.currentUser.metadata.lastSignInTime = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const { createFirebaseAwareApi } = await import("./firebaseCloudApi");
    const api = createFirebaseAwareApi(createLocalApi());

    await expect(api.auth?.getState()).resolves.toEqual({ user: null });

    expect(firebaseMocks.signOut).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("pronunciation-vault-cloud-mode")).toBe("local");
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

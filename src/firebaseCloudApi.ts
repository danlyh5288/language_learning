import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type Auth,
  type User
} from "firebase/auth";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore
} from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";
import {
  cloudSyncEntitlementPath,
  cloudTagToRecord,
  cloudWordToRecord,
  extensionForMimeType,
  recordingStoragePath,
  TAG_COLORS,
  userPath,
  userTagsPath,
  userWordsPath,
  type CloudEntitlementDocument,
  type CloudLibraryDocument,
  type CloudTagDocument,
  type CloudWordDocument
} from "../shared/firebaseSchema";
import {
  type AuthInput,
  type AuthState,
  type CloudSyncStatus,
  type CloudUser,
  type RecordingSaveInput,
  type TagRecord,
  UNTAGGED_FILTER_ID,
  type VocabApi,
  type WordInput,
  type WordListFilters,
  type WordRecord
} from "../shared/types";
import { getFirebaseWebConfig } from "./firebaseConfig";

const CLOUD_MODE_KEY = "pronunciation-vault-cloud-mode";
const QUEUE_DB_NAME = "pronunciation-vault-cloud-recordings";
const QUEUE_STORE_NAME = "recordingUploads";

type QueuedRecordingUpload = {
  id: string;
  wordId: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
  storagePath: string;
  createdAt: string;
  updatedAt: string;
  error: string | null;
};

type FirebaseRuntime = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
};

let runtimePromise: Promise<FirebaseRuntime> | null = null;
let authPersistencePromise: Promise<void> | null = null;
const previewUrls = new Map<string, string>();

export function createFirebaseAwareApi(localApi: VocabApi): VocabApi {
  const cloud = new FirebaseCloudApi(localApi);

  return {
    words: {
      list: (filters?: WordListFilters) => cloud.isCloudEnabled() ? cloud.listWords(filters) : localApi.words.list(filters),
      create: (input: WordInput) => cloud.isCloudEnabled() ? cloud.createWord(input) : localApi.words.create(input),
      update: (id: string, input: WordInput) => cloud.isCloudEnabled() ? cloud.updateWord(id, input) : localApi.words.update(id, input),
      delete: (id: string) => cloud.isCloudEnabled() ? cloud.deleteWord(id) : localApi.words.delete(id)
    },
    tags: {
      list: () => cloud.isCloudEnabled() ? cloud.listTags() : localApi.tags.list(),
      create: (name: string) => cloud.isCloudEnabled() ? cloud.createTag(name) : localApi.tags.create(name)
    },
    recordings: {
      saveForWord: (input: RecordingSaveInput) =>
        cloud.isCloudEnabled() ? cloud.saveRecording(input) : localApi.recordings.saveForWord(input),
      getPlaybackUrl: (wordId: string) =>
        cloud.isCloudEnabled() ? cloud.getPlaybackUrl(wordId) : localApi.recordings.getPlaybackUrl(wordId)
    },
    auth: {
      getState: () => cloud.getAuthState(),
      signIn: (input: AuthInput) => cloud.signIn(input),
      signUp: (input: AuthInput) => cloud.signUp(input),
      sendVerificationEmail: () => cloud.sendVerificationEmail(),
      signOut: () => cloud.signOut()
    },
    cloudSync: {
      getStatus: () => cloud.getStatus(),
      enable: () => cloud.enableCloudSync(),
      disable: () => cloud.disableCloudSync(),
      refresh: () => cloud.refresh()
    }
  };
}

class FirebaseCloudApi {
  constructor(private readonly localApi: VocabApi) {}

  isCloudEnabled(): boolean {
    return localStorage.getItem(CLOUD_MODE_KEY) === "cloud";
  }

  async getAuthState(): Promise<AuthState> {
    const { auth } = await getRuntime();
    await ensureAuthPersistence(auth);
    return { user: mapUser(auth.currentUser) };
  }

  async signIn(input: AuthInput): Promise<AuthState> {
    const { auth } = await getRuntime();
    await ensureAuthPersistence(auth);
    const credential = await signInWithEmailAndPassword(auth, input.email.trim(), input.password);
    return { user: mapUser(credential.user) };
  }

  async signUp(input: AuthInput): Promise<AuthState> {
    const { auth } = await getRuntime();
    await ensureAuthPersistence(auth);
    const credential = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
    await sendEmailVerification(credential.user);
    return { user: mapUser(credential.user) };
  }

  async sendVerificationEmail(): Promise<AuthState> {
    const { auth } = await getRuntime();
    const user = auth.currentUser;
    if (!user) {
      throw new Error("请先登录后再发送验证邮件");
    }
    await sendEmailVerification(user);
    return { user: mapUser(user) };
  }

  async signOut(): Promise<AuthState> {
    const { auth } = await getRuntime();
    localStorage.setItem(CLOUD_MODE_KEY, "local");
    await firebaseSignOut(auth);
    return { user: null };
  }

  async getStatus(): Promise<CloudSyncStatus> {
    const { auth } = await getRuntime();
    const user = mapUser(auth.currentUser);
    const isEntitled = user?.emailVerified ? await this.isUserEntitled(user.uid) : false;
    return {
      mode: this.isCloudEnabled() ? "cloud" : "local",
      user,
      isEntitled,
      isEnabled: this.isCloudEnabled(),
      isOnline: navigator.onLine,
      isSyncing: false,
      pendingRecordingUploads: user?.emailVerified ? await countQueuedRecordings(user.uid) : 0,
      lastSyncError: null
    };
  }

  async enableCloudSync(): Promise<CloudSyncStatus> {
    const { auth, db } = await getRuntime();
    const user = auth.currentUser;
    if (!user) {
      throw new Error("请先登录后再开启云同步");
    }
    await user.reload();
    if (!user.emailVerified) {
      throw new Error("请先验证邮箱后再开启云同步");
    }
    if (!(await this.isUserEntitled(user.uid))) {
      throw new Error("当前账号尚未开通云同步订阅");
    }

    const userDocRef = doc(db, userPath(user.uid));
    const userDoc = await getDoc(userDocRef);
    const data = userDoc.data() as CloudLibraryDocument | undefined;
    if (!data?.libraryInitialized) {
      await this.importLocalLibrary(user.uid);
      await setDoc(userDocRef, { libraryInitialized: true, updatedAt: new Date().toISOString() }, { merge: true });
    }
    localStorage.setItem(CLOUD_MODE_KEY, "cloud");
    await this.processRecordingQueue(user.uid);
    return this.getStatus();
  }

  async disableCloudSync(): Promise<CloudSyncStatus> {
    localStorage.setItem(CLOUD_MODE_KEY, "local");
    return this.getStatus();
  }

  async refresh(): Promise<CloudSyncStatus> {
    const { auth } = await getRuntime();
    if (auth.currentUser) {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        await this.processRecordingQueue(auth.currentUser.uid);
      }
    }
    return this.getStatus();
  }

  async listTags(): Promise<TagRecord[]> {
    const { db, auth } = await getRuntime();
    const uid = requireUid(auth.currentUser);
    const words = await this.listWords();
    const snapshot = await getDocs(query(collection(db, userTagsPath(uid)), where("deletedAt", "==", null)));
    return snapshot.docs
      .map((item) => {
        const tag = cloudTagToRecord(
          item.id,
          item.data() as CloudTagDocument,
          words.filter((word) => word.tagId === item.id).length,
          item.metadata.hasPendingWrites
        );
        return tag;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async createTag(name: string): Promise<TagRecord> {
    const { db, auth } = await getRuntime();
    const uid = requireUid(auth.currentUser);
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error("标签名称不能为空");
    }

    const existing = (await this.listTags()).find((tag) => tag.name.toLowerCase() === normalizedName.toLowerCase());
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const id = createId();
    const tags = await this.listTags();
    const tagDoc: CloudTagDocument = {
      name: normalizedName,
      color: TAG_COLORS[tags.length % TAG_COLORS.length],
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    await setDoc(doc(db, userTagsPath(uid), id), tagDoc);
    return cloudTagToRecord(id, tagDoc, 0, true);
  }

  async listWords(filters: WordListFilters = {}): Promise<WordRecord[]> {
    const { db, auth } = await getRuntime();
    const uid = requireUid(auth.currentUser);
    await this.processRecordingQueue(uid).catch(() => undefined);

    const [tagSnapshot, wordSnapshot, queuedRecordings] = await Promise.all([
      getDocs(query(collection(db, userTagsPath(uid)), where("deletedAt", "==", null))),
      getDocs(query(collection(db, userWordsPath(uid)), where("deletedAt", "==", null))),
      listQueuedRecordings(uid)
    ]);
    const tags = new Map<string, TagRecord>();
    tagSnapshot.docs.forEach((item) => {
      const data = item.data() as CloudTagDocument;
      tags.set(item.id, cloudTagToRecord(item.id, data, 0, item.metadata.hasPendingWrites));
    });
    const queuedByWordId = new Map(queuedRecordings.map((item) => [item.wordId, item]));

    return wordSnapshot.docs
      .map((item) => {
        const word = cloudWordToRecord(
          item.id,
          item.data() as CloudWordDocument,
          tags.get((item.data() as CloudWordDocument).tagId ?? "") ?? null,
          item.metadata.hasPendingWrites
        );
        const queued = queuedByWordId.get(word.id);
        return queued ? {
          ...word,
          hasRecording: true,
          audioDurationMs: queued.durationMs,
          recordingUploadStatus: queued.error ? "failed" as const : "queued" as const
        } : word;
      })
      .filter((word) => matchesFilters(word, filters))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createWord(input: WordInput): Promise<WordRecord> {
    const { db, auth } = await getRuntime();
    const uid = requireUid(auth.currentUser);
    const now = new Date().toISOString();
    const id = createId();
    const wordDoc: CloudWordDocument = {
      text: normalizeWordText(input.text),
      tagId: normalizeTagId(input.tagId),
      toneNote: input.toneNote.trim(),
      recording: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    await setDoc(doc(db, userWordsPath(uid), id), wordDoc);
    return this.requireWord(id);
  }

  async updateWord(id: string, input: WordInput): Promise<WordRecord> {
    const { db, auth } = await getRuntime();
    const uid = requireUid(auth.currentUser);
    const now = new Date().toISOString();
    await updateDoc(doc(db, userWordsPath(uid), id), {
      text: normalizeWordText(input.text),
      tagId: normalizeTagId(input.tagId),
      toneNote: input.toneNote.trim(),
      updatedAt: now
    });
    return this.requireWord(id);
  }

  async deleteWord(id: string): Promise<void> {
    const { db, auth } = await getRuntime();
    const uid = requireUid(auth.currentUser);
    const now = new Date().toISOString();
    await updateDoc(doc(db, userWordsPath(uid), id), { deletedAt: now, updatedAt: now });
  }

  async saveRecording(input: RecordingSaveInput): Promise<WordRecord> {
    const { auth } = await getRuntime();
    const uid = requireUid(auth.currentUser);
    const blob = new Blob([input.audioBuffer], { type: input.mimeType });
    const extension = extensionForMimeType(input.mimeType);
    const uploadId = createId();
    const storagePath = recordingStoragePath(uid, input.wordId, uploadId, extension);
    const upload: QueuedRecordingUpload = {
      id: `${uid}-${input.wordId}-${uploadId}`,
      wordId: input.wordId,
      blob,
      mimeType: input.mimeType,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      storagePath,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error: null
    };

    await putQueuedRecording(uid, upload);
    await this.processRecordingQueue(uid).catch(() => undefined);
    return this.requireWord(input.wordId);
  }

  async getPlaybackUrl(wordId: string): Promise<string | null> {
    const { db, auth, storage } = await getRuntime();
    const uid = requireUid(auth.currentUser);
    const queued = await getQueuedRecordingForWord(uid, wordId);
    if (queued) {
      const old = previewUrls.get(wordId);
      if (old) {
        URL.revokeObjectURL(old);
      }
      const url = URL.createObjectURL(queued.blob);
      previewUrls.set(wordId, url);
      return url;
    }

    const wordSnapshot = await getDoc(doc(db, userWordsPath(uid), wordId));
    const data = wordSnapshot.data() as CloudWordDocument | undefined;
    if (!data?.recording?.storagePath) {
      return null;
    }
    return getDownloadURL(ref(storage, data.recording.storagePath));
  }

  private async importLocalLibrary(uid: string): Promise<void> {
    const { db, storage } = await getRuntime();
    const [tags, words] = await Promise.all([this.localApi.tags.list(), this.localApi.words.list()]);
    const now = new Date().toISOString();
    await Promise.all(tags.map((tag) => setDoc(doc(db, userTagsPath(uid), tag.id), {
      name: tag.name,
      color: tag.color,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    } satisfies CloudTagDocument)));
    await Promise.all(words.map(async (word) => {
      const wordDoc: CloudWordDocument = {
        text: word.text,
        tagId: word.tagId,
        toneNote: word.toneNote,
        recording: null,
        createdAt: word.createdAt,
        updatedAt: word.updatedAt,
        deletedAt: null
      };
      if (word.hasRecording) {
        const playbackUrl = await this.localApi.recordings.getPlaybackUrl(word.id);
        if (playbackUrl) {
          const response = await fetch(playbackUrl);
          const blob = await response.blob();
          const mimeType = blob.type || "audio/webm";
          const uploadId = createId();
          const storagePath = recordingStoragePath(uid, word.id, uploadId, extensionForMimeType(mimeType));
          try {
            await uploadBytes(ref(storage, storagePath), blob, { contentType: mimeType });
            wordDoc.recording = {
              storagePath,
              mimeType,
              durationMs: word.audioDurationMs ?? 0,
              uploadedAt: new Date().toISOString()
            };
          } catch {
            await putQueuedRecording(uid, {
              id: `${uid}-${word.id}-${uploadId}`,
              wordId: word.id,
              blob,
              mimeType,
              durationMs: word.audioDurationMs ?? 0,
              storagePath,
              createdAt: now,
              updatedAt: now,
              error: null
            });
          }
        }
      }
      await setDoc(doc(db, userWordsPath(uid), word.id), wordDoc);
    }));
  }

  private async requireWord(id: string): Promise<WordRecord> {
    const words = await this.listWords();
    const word = words.find((item) => item.id === id);
    if (!word) {
      throw new Error("词条不存在");
    }
    return word;
  }

  private async isUserEntitled(uid: string): Promise<boolean> {
    const { db } = await getRuntime();
    const snapshot = await getDoc(doc(db, cloudSyncEntitlementPath(uid)));
    const data = snapshot.data() as CloudEntitlementDocument | undefined;
    if (!data?.active) {
      return false;
    }
    if (!data.expiresAt) {
      return true;
    }
    const expiresAt = typeof data.expiresAt === "string" ? data.expiresAt : data.expiresAt.toDate?.().toISOString();
    return expiresAt ? new Date(expiresAt).getTime() > Date.now() : true;
  }

  private async processRecordingQueue(uid: string): Promise<void> {
    if (!navigator.onLine) {
      return;
    }
    const { db, storage } = await getRuntime();
    const queued = await listQueuedRecordings(uid);
    for (const upload of queued) {
      try {
        await uploadBytes(ref(storage, upload.storagePath), upload.blob, { contentType: upload.mimeType });
        await updateDoc(doc(db, userWordsPath(uid), upload.wordId), {
          recording: {
            storagePath: upload.storagePath,
            mimeType: upload.mimeType,
            durationMs: upload.durationMs,
            uploadedAt: new Date().toISOString()
          },
          updatedAt: new Date().toISOString()
        });
        await deleteQueuedRecording(uid, upload.id);
      } catch (caught) {
        await putQueuedRecording(uid, { ...upload, error: errorMessage(caught), updatedAt: new Date().toISOString() });
      }
    }
  }
}

async function getRuntime(): Promise<FirebaseRuntime> {
  if (!runtimePromise) {
    runtimePromise = Promise.resolve().then(() => {
      const app = initializeApp(getFirebaseWebConfig());
      return {
        app,
        auth: getAuth(app),
        db: initializeFirestore(app, {
          localCache: persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) })
        }),
        storage: getStorage(app)
      };
    });
  }
  return runtimePromise;
}

function ensureAuthPersistence(auth: Auth): Promise<void> {
  authPersistencePromise ??= setPersistence(auth, browserLocalPersistence);
  return authPersistencePromise;
}

function mapUser(user: User | null): CloudUser | null {
  return user ? { uid: user.uid, email: user.email, emailVerified: user.emailVerified } : null;
}

function requireUid(user: User | null): string {
  if (!user) {
    throw new Error("请先登录后再使用云同步");
  }
  return user.uid;
}

function normalizeWordText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("词条不能为空");
  }
  return trimmed;
}

function normalizeTagId(tagId: string | null): string | null {
  return tagId && tagId.trim() ? tagId : null;
}

function matchesFilters(word: WordRecord, filters: WordListFilters): boolean {
  const queryText = filters.query?.trim() ?? "";
  const lowerQuery = queryText.toLowerCase();
  if (filters.tagId === UNTAGGED_FILTER_ID && word.tagId !== null) {
    return false;
  }
  if (filters.tagId && filters.tagId !== UNTAGGED_FILTER_ID && word.tagId !== filters.tagId) {
    return false;
  }
  if (queryText.startsWith("#")) {
    const tagQuery = queryText.slice(1).trim().toLowerCase();
    return tagQuery.length === 0 || (word.tagName ?? "").toLowerCase().includes(tagQuery);
  }
  if (!lowerQuery) {
    return true;
  }
  return (
    word.text.toLowerCase().includes(lowerQuery) ||
    word.toneNote.toLowerCase().includes(lowerQuery) ||
    (word.tagName ?? "").toLowerCase().includes(lowerQuery)
  );
}

function createId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : "操作失败";
}

async function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(QUEUE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE_NAME)) {
        const store = db.createObjectStore(QUEUE_STORE_NAME, { keyPath: "id" });
        store.createIndex("uid", "uid", { unique: false });
        store.createIndex("uid_wordId", ["uid", "wordId"], { unique: false });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function putQueuedRecording(uid: string, upload: QueuedRecordingUpload): Promise<void> {
  const db = await openQueueDb();
  await idbRequest(db.transaction(QUEUE_STORE_NAME, "readwrite").objectStore(QUEUE_STORE_NAME).put({ ...upload, uid }));
  db.close();
}

async function listQueuedRecordings(uid: string): Promise<QueuedRecordingUpload[]> {
  const db = await openQueueDb();
  const tx = db.transaction(QUEUE_STORE_NAME, "readonly");
  const result = await idbRequest<({ uid: string } & QueuedRecordingUpload)[]>(
    tx.objectStore(QUEUE_STORE_NAME).index("uid").getAll(uid) as IDBRequest<({ uid: string } & QueuedRecordingUpload)[]>
  );
  db.close();
  return result;
}

async function countQueuedRecordings(uid: string): Promise<number> {
  const db = await openQueueDb();
  const count = await idbRequest<number>(db.transaction(QUEUE_STORE_NAME, "readonly").objectStore(QUEUE_STORE_NAME).index("uid").count(uid));
  db.close();
  return count;
}

async function getQueuedRecordingForWord(uid: string, wordId: string): Promise<QueuedRecordingUpload | null> {
  const db = await openQueueDb();
  const results = await idbRequest<({ uid: string } & QueuedRecordingUpload)[]>(
    db.transaction(QUEUE_STORE_NAME, "readonly").objectStore(QUEUE_STORE_NAME).index("uid_wordId").getAll([uid, wordId])
  );
  db.close();
  return results[0] ?? null;
}

async function deleteQueuedRecording(uid: string, id: string): Promise<void> {
  const db = await openQueueDb();
  const existing = await idbRequest<({ uid: string } & QueuedRecordingUpload) | undefined>(
    db.transaction(QUEUE_STORE_NAME, "readonly").objectStore(QUEUE_STORE_NAME).get(id)
  );
  if (existing?.uid !== uid) {
    db.close();
    return;
  }
  await idbRequest(db.transaction(QUEUE_STORE_NAME, "readwrite").objectStore(QUEUE_STORE_NAME).delete(id));
  db.close();
}

function idbRequest<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

import auth from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";
import storage from "@react-native-firebase/storage";
import {
  cloudTagToRecord,
  cloudWordToRecord,
  extensionForMimeType,
  recordingStoragePath,
  TAG_COLORS,
  userTagsPath,
  userWordsPath,
  type CloudTagDocument,
  type CloudWordDocument
} from "../../../shared/firebaseSchema";
import {
  type AuthInput,
  type AuthState,
  type CloudSyncStatus,
  type CloudUser,
  type TagRecord,
  type WordInput,
  type WordListFilters
} from "../../../shared/types";
import { filterWords } from "../../../shared/vocabulary";
import type {
  DeletedWordResult,
  MobileWordRecord,
  MobileVocabularyLibrary,
  RepositoryChangeListener,
  RepositoryUnsubscribe,
  RecordingReplacementResult,
  SavedRecordingInput,
  SqlValue,
  VocabDatabase,
  VocabularyRepositoryApi
} from "./types";

type UploadRow = Record<string, SqlValue>;

export class FirebaseMobileSession {
  private readonly auth = auth();

  constructor(private readonly queueDb: VocabDatabase) {}

  getCurrentUser(): CloudUser | null {
    return mapUser(this.auth.currentUser);
  }

  async signIn(input: AuthInput): Promise<AuthState> {
    const credential = await this.auth.signInWithEmailAndPassword(input.email.trim(), input.password);
    return { user: mapUser(credential.user) };
  }

  async signUp(input: AuthInput): Promise<AuthState> {
    const credential = await this.auth.createUserWithEmailAndPassword(input.email.trim(), input.password);
    await credential.user.sendEmailVerification().catch(() => undefined);
    return { user: mapUser(credential.user) };
  }

  async sendVerificationEmail(): Promise<AuthState> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error("请先登录后再发送验证邮件");
    }
    await user.sendEmailVerification();
    return { user: mapUser(user) };
  }

  async signOut(): Promise<AuthState> {
    await this.auth.signOut();
    return { user: null };
  }

  async getStatus(isEnabled: boolean): Promise<CloudSyncStatus> {
    const user = this.getCurrentUser();
    return {
      mode: isEnabled ? "cloud" : "local",
      user,
      isEntitled: Boolean(user),
      isEnabled,
      isOnline: true,
      isSyncing: false,
      pendingRecordingUploads: user ? await countQueuedRecordings(this.queueDb, user.uid) : 0,
      lastSyncError: null
    };
  }
}

export class FirebaseVocabularyRepository implements VocabularyRepositoryApi {
  private readonly auth = auth();
  private readonly firestore = firestore();
  private readonly storage = storage();

  constructor(private readonly queueDb: VocabDatabase) {}

  subscribe(listener: RepositoryChangeListener): RepositoryUnsubscribe {
    const uid = requireUid(this.auth.currentUser);
    const initialized = { tags: false, words: false };
    let notifyTimer: ReturnType<typeof setTimeout> | null = null;
    const notify = () => {
      if (notifyTimer) {
        return;
      }
      notifyTimer = setTimeout(() => {
        notifyTimer = null;
        listener();
      }, 0);
    };
    const notifyAfterInitial = (key: keyof typeof initialized) => () => {
      if (!initialized[key]) {
        initialized[key] = true;
        return;
      }
      notify();
    };
    const unsubscribeTags = this.firestore.collection(userTagsPath(uid)).where("deletedAt", "==", null).onSnapshot(
      notifyAfterInitial("tags"),
      notify
    );
    const unsubscribeWords = this.firestore.collection(userWordsPath(uid)).where("deletedAt", "==", null).onSnapshot(
      notifyAfterInitial("words"),
      notify
    );

    return () => {
      if (notifyTimer) {
        clearTimeout(notifyTimer);
      }
      unsubscribeTags();
      unsubscribeWords();
    };
  }

  async loadVocabulary(): Promise<MobileVocabularyLibrary> {
    const uid = requireUid(this.auth.currentUser);
    await this.processRecordingQueue().catch(() => undefined);
    const [tagSnapshot, wordSnapshot, queued] = await Promise.all([
      this.firestore.collection(userTagsPath(uid)).where("deletedAt", "==", null).get(),
      this.firestore.collection(userWordsPath(uid)).where("deletedAt", "==", null).get(),
      listQueuedRecordings(this.queueDb, uid)
    ]);
    const tagsById = new Map<string, TagRecord>();
    tagSnapshot.docs.forEach((docSnapshot) => {
      tagsById.set(docSnapshot.id, cloudTagToRecord(
        docSnapshot.id,
        docSnapshot.data() as CloudTagDocument,
        0,
        docSnapshot.metadata.hasPendingWrites
      ));
    });
    const queuedByWordId = new Map(queued.map((upload) => [String(upload.word_id), upload]));

    const words = wordSnapshot.docs
      .map((docSnapshot) => {
        const data = docSnapshot.data() as CloudWordDocument;
        const word = cloudWordToRecord(
          docSnapshot.id,
          data,
          tagsById.get(data.tagId ?? "") ?? null,
          docSnapshot.metadata.hasPendingWrites
        ) as MobileWordRecord;
        const queuedUpload = queuedByWordId.get(word.id);
        return {
          ...word,
          recordingUri: queuedUpload ? String(queuedUpload.local_uri) : null,
          audioMimeType: queuedUpload ? String(queuedUpload.mime_type) : data.recording?.mimeType ?? null,
          hasRecording: word.hasRecording || Boolean(queuedUpload),
          audioDurationMs: queuedUpload ? Number(queuedUpload.duration_ms) : word.audioDurationMs,
          recordingUploadStatus: queuedUpload ? (queuedUpload.error ? "failed" : "queued") : word.recordingUploadStatus
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const wordCounts = new Map<string, number>();
    words.forEach((word) => {
      if (word.tagId) {
        wordCounts.set(word.tagId, (wordCounts.get(word.tagId) ?? 0) + 1);
      }
    });
    const tags = Array.from(tagsById.values())
      .map((tag) => ({ ...tag, wordCount: wordCounts.get(tag.id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { words, tags };
  }

  async listWords(filters: WordListFilters = {}): Promise<MobileWordRecord[]> {
    return filterWords((await this.loadVocabulary()).words, filters);
  }

  async listTags(): Promise<TagRecord[]> {
    return (await this.loadVocabulary()).tags;
  }

  async createTag(name: string): Promise<TagRecord> {
    const uid = requireUid(this.auth.currentUser);
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error("标签名称不能为空");
    }
    const tags = await this.listTags();
    const existing = tags.find((tag) => tag.name.toLowerCase() === normalizedName.toLowerCase());
    if (existing) {
      return existing;
    }
    const now = new Date().toISOString();
    const id = createId();
    const tagDoc: CloudTagDocument = {
      name: normalizedName,
      color: TAG_COLORS[tags.length % TAG_COLORS.length],
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    await this.firestore.doc(`${userTagsPath(uid)}/${id}`).set(tagDoc);
    return cloudTagToRecord(id, tagDoc, 0, true);
  }

  async createWord(input: WordInput): Promise<MobileWordRecord> {
    const uid = requireUid(this.auth.currentUser);
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
    await this.firestore.doc(`${userWordsPath(uid)}/${id}`).set(wordDoc);
    return this.requireWord(id);
  }

  async updateWord(id: string, input: WordInput): Promise<MobileWordRecord> {
    const uid = requireUid(this.auth.currentUser);
    await this.firestore.doc(`${userWordsPath(uid)}/${id}`).update({
      text: normalizeWordText(input.text),
      tagId: normalizeTagId(input.tagId),
      toneNote: input.toneNote.trim(),
      updatedAt: new Date().toISOString()
    });
    return this.requireWord(id);
  }

  async deleteWord(id: string): Promise<DeletedWordResult> {
    const uid = requireUid(this.auth.currentUser);
    const queued = await getQueuedRecordingForWord(this.queueDb, uid, id);
    await this.firestore.doc(`${userWordsPath(uid)}/${id}`).update({
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return { recordingUri: queued ? String(queued.local_uri) : null };
  }

  async saveRecordingForWord(input: SavedRecordingInput): Promise<RecordingReplacementResult> {
    const uid = requireUid(this.auth.currentUser);
    const id = `${uid}-${input.wordId}-${createId()}`;
    const storagePath = recordingStoragePath(uid, input.wordId, id, extensionForMimeType(input.mimeType));
    const now = new Date().toISOString();
    const old = await getQueuedRecordingForWord(this.queueDb, uid, input.wordId);
    await this.queueDb.runAsync(
      `
        INSERT OR REPLACE INTO cloud_recording_uploads
          (id, user_id, word_id, local_uri, storage_path, mime_type, duration_ms, error, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `,
      [id, uid, input.wordId, input.uri, storagePath, input.mimeType, Math.max(0, Math.round(input.durationMs)), now, now]
    );
    await this.processRecordingQueue().catch(() => undefined);
    return {
      word: await this.requireWord(input.wordId),
      oldRecordingUri: typeof old?.local_uri === "string" ? old.local_uri : null
    };
  }

  async processRecordingQueue(): Promise<void> {
    const uid = requireUid(this.auth.currentUser);
    const uploads = await listQueuedRecordings(this.queueDb, uid);
    for (const upload of uploads) {
      try {
        await this.storage.ref(String(upload.storage_path)).putFile(String(upload.local_uri), {
          contentType: String(upload.mime_type)
        });
        await this.firestore.doc(`${userWordsPath(uid)}/${String(upload.word_id)}`).update({
          recording: {
            storagePath: String(upload.storage_path),
            mimeType: String(upload.mime_type),
            durationMs: Number(upload.duration_ms),
            uploadedAt: new Date().toISOString()
          },
          updatedAt: new Date().toISOString()
        });
        await this.queueDb.runAsync("DELETE FROM cloud_recording_uploads WHERE id = ? AND user_id = ?", [
          String(upload.id),
          uid
        ]);
      } catch (caught) {
        await this.queueDb.runAsync(
          "UPDATE cloud_recording_uploads SET error = ?, updated_at = ? WHERE id = ? AND user_id = ?",
          [errorMessage(caught), new Date().toISOString(), String(upload.id), uid]
        );
      }
    }
  }

  async importLocalLibrary(localRepository: VocabularyRepositoryApi): Promise<void> {
    const uid = requireUid(this.auth.currentUser);
    const userDoc = this.firestore.doc(`users/${uid}`);
    const userSnapshot = await userDoc.get();
    if (userSnapshot.data()?.libraryInitialized) {
      return;
    }

    const [tags, words] = await Promise.all([localRepository.listTags(), localRepository.listWords()]);
    const now = new Date().toISOString();
    await Promise.all(tags.map((tag) => this.firestore.doc(`${userTagsPath(uid)}/${tag.id}`).set({
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
      if (word.recordingUri) {
        const mimeType = word.audioMimeType ?? "audio/m4a";
        const uploadId = createId();
        const storagePath = recordingStoragePath(uid, word.id, uploadId, extensionForMimeType(mimeType));
        try {
          await this.storage.ref(storagePath).putFile(word.recordingUri, { contentType: mimeType });
          wordDoc.recording = {
            storagePath,
            mimeType,
            durationMs: word.audioDurationMs ?? 0,
            uploadedAt: new Date().toISOString()
          };
        } catch {
          await this.queueDb.runAsync(
            `
              INSERT OR REPLACE INTO cloud_recording_uploads
                (id, user_id, word_id, local_uri, storage_path, mime_type, duration_ms, error, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
            `,
            [
              `${uid}-${word.id}-${uploadId}`,
              uid,
              word.id,
              word.recordingUri,
              storagePath,
              mimeType,
              word.audioDurationMs ?? 0,
              now,
              now
            ]
          );
        }
      }
      await this.firestore.doc(`${userWordsPath(uid)}/${word.id}`).set(wordDoc);
    }));
    await userDoc.set({ libraryInitialized: true, updatedAt: new Date().toISOString() }, { merge: true });
  }

  private async requireWord(id: string): Promise<MobileWordRecord> {
    const word = (await this.listWords()).find((item) => item.id === id);
    if (!word) {
      throw new Error("词条不存在");
    }
    return word;
  }
}

function mapUser(user: { uid: string; email: string | null; emailVerified: boolean } | null): CloudUser | null {
  return user ? { uid: user.uid, email: user.email, emailVerified: user.emailVerified } : null;
}

function requireUid(user: { uid: string } | null): string {
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

async function listQueuedRecordings(db: VocabDatabase, uid: string): Promise<UploadRow[]> {
  return db.getAllAsync<UploadRow>("SELECT * FROM cloud_recording_uploads WHERE user_id = ?", [uid]);
}

async function countQueuedRecordings(db: VocabDatabase, uid: string): Promise<number> {
  const row = await db.getFirstAsync<UploadRow>("SELECT COUNT(*) AS count FROM cloud_recording_uploads WHERE user_id = ?", [uid]);
  return Number(row?.count ?? 0);
}

async function getQueuedRecordingForWord(db: VocabDatabase, uid: string, wordId: string): Promise<UploadRow | null> {
  return db.getFirstAsync<UploadRow>(
    "SELECT * FROM cloud_recording_uploads WHERE user_id = ? AND word_id = ? ORDER BY datetime(updated_at) DESC LIMIT 1",
    [uid, wordId]
  );
}

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : "操作失败";
}

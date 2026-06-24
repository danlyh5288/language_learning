export const UNTAGGED_FILTER_ID = "__untagged__";

export type WordRecord = {
  id: string;
  text: string;
  tagId: string | null;
  tagName: string | null;
  tagColor: string | null;
  toneNote: string;
  audioDurationMs: number | null;
  hasRecording: boolean;
  createdAt: string;
  updatedAt: string;
  syncSource?: SyncSource;
  hasPendingWrites?: boolean;
  recordingUploadStatus?: RecordingUploadStatus;
};

export type TagRecord = {
  id: string;
  name: string;
  color: string;
  wordCount: number;
  hasPendingWrites?: boolean;
};

export type WordListFilters = {
  query?: string;
  tagId?: string | null;
};

export type WordInput = {
  text: string;
  tagId: string | null;
  toneNote: string;
};

export type RecordingSaveInput = {
  wordId: string;
  audioBuffer: ArrayBuffer;
  mimeType: string;
  durationMs: number;
};

export type RecordingReadResult = {
  audioBuffer: ArrayBuffer;
  mimeType: string;
};

export type SyncSource = "local" | "cloud";

export type RecordingUploadStatus = "local" | "queued" | "uploading" | "uploaded" | "failed";

export type CloudMode = "local" | "cloud";

export type CloudUser = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
};

export type AuthState = {
  user: CloudUser | null;
};

export type CloudSyncStatus = {
  mode: CloudMode;
  user: CloudUser | null;
  isEntitled: boolean;
  isEnabled: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  pendingRecordingUploads: number;
  lastSyncError: string | null;
};

export type AuthInput = {
  email: string;
  password: string;
};

export type CloudSyncUnsubscribe = () => void;

export type CloudSyncChangeListener = () => void;

export type VocabApi = {
  words: {
    list(filters?: WordListFilters): Promise<WordRecord[]>;
    create(input: WordInput): Promise<WordRecord>;
    update(id: string, input: WordInput): Promise<WordRecord>;
    delete(id: string): Promise<void>;
  };
  tags: {
    list(): Promise<TagRecord[]>;
    create(name: string): Promise<TagRecord>;
  };
  recordings: {
    saveForWord(input: RecordingSaveInput): Promise<WordRecord>;
    getPlaybackUrl(wordId: string): Promise<string | null>;
    readForWord?(wordId: string): Promise<RecordingReadResult | null>;
  };
  auth?: {
    getState(): Promise<AuthState>;
    signIn(input: AuthInput): Promise<AuthState>;
    signUp(input: AuthInput): Promise<AuthState>;
    sendVerificationEmail(): Promise<AuthState>;
    signOut(): Promise<AuthState>;
  };
  cloudSync?: {
    getStatus(): Promise<CloudSyncStatus>;
    enable(): Promise<CloudSyncStatus>;
    disable(): Promise<CloudSyncStatus>;
    refresh(): Promise<CloudSyncStatus>;
    subscribe?(listener: CloudSyncChangeListener): Promise<CloudSyncUnsubscribe>;
  };
};

import type { TagRecord, WordRecord } from "./types";

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC4y3A61w3yOZlUp64oJzIdrXAIuXGgfk0",
  authDomain: "language-vault-5a846.firebaseapp.com",
  projectId: "language-vault-5a846",
  storageBucket: "language-vault-5a846.firebasestorage.app",
  messagingSenderId: "947812044809",
  appId: "1:947812044809:web:7f7f7021354f607a56e8d8",
  measurementId: "G-7VT59S6SWE"
} as const;

export const TAG_COLORS = ["#2563eb", "#059669", "#7c3aed", "#d97706", "#dc2626", "#0891b2"] as const;

export type FirebaseTimestampLike = {
  toDate?: () => Date;
  seconds?: number;
  nanoseconds?: number;
};

export type CloudTagDocument = {
  name: string;
  color: string;
  createdAt: string | FirebaseTimestampLike;
  updatedAt: string | FirebaseTimestampLike;
  deletedAt: string | FirebaseTimestampLike | null;
};

export type CloudRecordingDocument = {
  storagePath: string;
  mimeType: string;
  durationMs: number;
  uploadedAt: string | FirebaseTimestampLike;
};

export type CloudWordDocument = {
  text: string;
  tagId: string | null;
  toneNote: string;
  recording: CloudRecordingDocument | null;
  createdAt: string | FirebaseTimestampLike;
  updatedAt: string | FirebaseTimestampLike;
  deletedAt: string | FirebaseTimestampLike | null;
};

export type CloudLibraryDocument = {
  libraryInitialized: boolean;
  updatedAt: string | FirebaseTimestampLike;
};

export type CloudEntitlementDocument = {
  active: boolean;
  source: "stripe" | "app_store" | "play_billing" | "manual";
  updatedAt: string | FirebaseTimestampLike;
  expiresAt?: string | FirebaseTimestampLike | null;
};

export type RecordingUploadQueueItem = {
  id: string;
  wordId: string;
  localUri: string;
  mimeType: string;
  durationMs: number;
  storagePath: string;
  status: "queued" | "uploading" | "failed";
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export function userPath(uid: string): string {
  return `users/${uid}`;
}

export function userTagsPath(uid: string): string {
  return `${userPath(uid)}/tags`;
}

export function userWordsPath(uid: string): string {
  return `${userPath(uid)}/words`;
}

export function cloudSyncEntitlementPath(uid: string): string {
  return `${userPath(uid)}/entitlements/cloudSync`;
}

export function recordingStoragePath(uid: string, wordId: string, recordingId: string, extension: string): string {
  return `recordings/${uid}/${wordId}/${recordingId}.${extension}`;
}

export function normalizeCloudDate(value: string | FirebaseTimestampLike | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (typeof value.seconds === "number") {
    return new Date(value.seconds * 1000 + Math.round((value.nanoseconds ?? 0) / 1_000_000)).toISOString();
  }
  return null;
}

export function cloudTagToRecord(id: string, data: CloudTagDocument, wordCount: number, hasPendingWrites = false): TagRecord {
  return {
    id,
    name: data.name,
    color: data.color,
    wordCount,
    hasPendingWrites
  };
}

export function cloudWordToRecord(
  id: string,
  data: CloudWordDocument,
  tag: TagRecord | null,
  hasPendingWrites = false
): WordRecord {
  const createdAt = normalizeCloudDate(data.createdAt) ?? new Date(0).toISOString();
  const updatedAt = normalizeCloudDate(data.updatedAt) ?? createdAt;
  return {
    id,
    text: data.text,
    tagId: data.tagId,
    tagName: tag?.name ?? null,
    tagColor: tag?.color ?? null,
    toneNote: data.toneNote,
    audioDurationMs: data.recording?.durationMs ?? null,
    hasRecording: Boolean(data.recording?.storagePath),
    createdAt,
    updatedAt,
    syncSource: "cloud",
    hasPendingWrites,
    recordingUploadStatus: data.recording?.storagePath ? "uploaded" : undefined
  };
}

export function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("webm")) {
    return "webm";
  }
  if (mimeType.includes("ogg")) {
    return "ogg";
  }
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) {
    return "m4a";
  }
  if (mimeType.includes("wav")) {
    return "wav";
  }
  return "audio";
}

import { describe, expect, it } from "vitest";
import {
  cloudSyncEntitlementPath,
  cloudWordToRecord,
  normalizeCloudDate,
  recordingStoragePath,
  userTagsPath,
  userWordsPath,
  type CloudWordDocument
} from "../shared/firebaseSchema";

describe("Firebase schema helpers", () => {
  it("builds user-scoped Firestore and Storage paths", () => {
    expect(userTagsPath("user-1")).toBe("users/user-1/tags");
    expect(userWordsPath("user-1")).toBe("users/user-1/words");
    expect(cloudSyncEntitlementPath("user-1")).toBe("users/user-1/entitlements/cloudSync");
    expect(recordingStoragePath("user-1", "word-1", "recording-1", "m4a")).toBe(
      "recordings/user-1/word-1/recording-1.m4a"
    );
  });

  it("normalizes Firestore timestamps and ISO strings", () => {
    expect(normalizeCloudDate("2026-06-18T10:00:00.000Z")).toBe("2026-06-18T10:00:00.000Z");
    expect(normalizeCloudDate({ seconds: 1_780_000_000, nanoseconds: 500_000_000 })).toBe(
      "2026-05-28T20:26:40.500Z"
    );
    expect(normalizeCloudDate({ toDate: () => new Date("2026-06-18T12:00:00.000Z") })).toBe(
      "2026-06-18T12:00:00.000Z"
    );
  });

  it("maps cloud words into shared records with tag and recording metadata", () => {
    const doc: CloudWordDocument = {
      text: "侬好",
      tagId: "tag-daily",
      toneNote: "开口轻一点",
      recording: {
        storagePath: "recordings/user-1/word-1/r1.m4a",
        mimeType: "audio/m4a",
        durationMs: 2400,
        uploadedAt: "2026-06-18T10:01:00.000Z"
      },
      createdAt: "2026-06-18T10:00:00.000Z",
      updatedAt: "2026-06-18T10:02:00.000Z",
      deletedAt: null
    };

    expect(cloudWordToRecord("word-1", doc, { id: "tag-daily", name: "日常", color: "#059669", wordCount: 1 })).toEqual(
      expect.objectContaining({
        id: "word-1",
        text: "侬好",
        tagName: "日常",
        hasRecording: true,
        audioDurationMs: 2400,
        syncSource: "cloud",
        recordingUploadStatus: "uploaded"
      })
    );
  });
});

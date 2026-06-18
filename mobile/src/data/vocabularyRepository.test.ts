import { UNTAGGED_FILTER_ID } from "../../../shared/types";
import { createSqlJsAdapter } from "../test/sqlJsAdapter";
import { migrateVocabularyDb, VocabularyRepository } from "./vocabularyRepository";

async function createRepository() {
  const db = await createSqlJsAdapter();
  await migrateVocabularyDb(db);
  return new VocabularyRepository(db);
}

describe("VocabularyRepository", () => {
  it("migrates the local cloud recording upload queue", async () => {
    const db = await createSqlJsAdapter();
    await migrateVocabularyDb(db);
    await db.runAsync(
      `
        INSERT INTO cloud_recording_uploads
          (id, user_id, word_id, local_uri, storage_path, mime_type, duration_ms, error, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `,
      [
        "upload-1",
        "user-1",
        "word-1",
        "file://recordings/local.m4a",
        "recordings/user-1/word-1/upload-1.m4a",
        "audio/m4a",
        1800,
        "2026-06-18T10:00:00.000Z",
        "2026-06-18T10:00:00.000Z"
      ]
    );

    await expect(db.getFirstAsync("SELECT id, word_id AS wordId FROM cloud_recording_uploads WHERE user_id = ?", [
      "user-1"
    ])).resolves.toEqual(expect.objectContaining({ id: "upload-1", wordId: "word-1" }));
  });

  it("creates words, tags, and fresh tag counts", async () => {
    const repository = await createRepository();
    const daily = await repository.createTag("日常");
    const duplicate = await repository.createTag("日常");

    expect(duplicate.id).toBe(daily.id);

    const word = await repository.createWord({
      text: " 侬好 ",
      tagId: daily.id,
      toneNote: " 第二字收短 "
    });

    expect(word.text).toBe("侬好");
    expect(word.tagName).toBe("日常");
    expect(word.toneNote).toBe("第二字收短");
    await expect(repository.listTags()).resolves.toEqual([
      expect.objectContaining({ id: daily.id, name: "日常", wordCount: 1 })
    ]);
  });

  it("filters by text, note, tag query, and untagged sentinel", async () => {
    const repository = await createRepository();
    const lesson = await repository.createTag("第一课");
    const daily = await repository.createTag("日常");

    await repository.createWord({ text: "侬好", tagId: daily.id, toneNote: "开口轻一点" });
    await repository.createWord({ text: "辰光", tagId: lesson.id, toneNote: "第一个字不要拖长" });
    await repository.createWord({ text: "弄堂", tagId: null, toneNote: "后字更轻" });

    await expect(repository.listWords({ query: "辰光" })).resolves.toEqual([
      expect.objectContaining({ text: "辰光" })
    ]);
    await expect(repository.listWords({ query: "拖长" })).resolves.toEqual([
      expect.objectContaining({ text: "辰光" })
    ]);
    await expect(repository.listWords({ query: "#日常" })).resolves.toEqual([
      expect.objectContaining({ text: "侬好" })
    ]);
    await expect(repository.listWords({ tagId: UNTAGGED_FILTER_ID })).resolves.toEqual([
      expect.objectContaining({ text: "弄堂" })
    ]);
  });

  it("updates, deletes, and returns recording URIs for file cleanup", async () => {
    const repository = await createRepository();
    const tag = await repository.createTag("练习");
    const word = await repository.createWord({ text: "谢谢", tagId: null, toneNote: "" });

    const updated = await repository.updateWord(word.id, {
      text: "谢谢侬",
      tagId: tag.id,
      toneNote: "尾音不要上扬"
    });
    expect(updated.text).toBe("谢谢侬");
    expect(updated.tagName).toBe("练习");

    const firstRecording = await repository.saveRecordingForWord({
      wordId: word.id,
      uri: "file://recordings/one.m4a",
      mimeType: "audio/m4a",
      durationMs: 2100
    });
    expect(firstRecording.oldRecordingUri).toBeNull();
    expect(firstRecording.word.hasRecording).toBe(true);
    expect(firstRecording.word.audioDurationMs).toBe(2100);

    const replacement = await repository.saveRecordingForWord({
      wordId: word.id,
      uri: "file://recordings/two.m4a",
      mimeType: "audio/m4a",
      durationMs: 1800
    });
    expect(replacement.oldRecordingUri).toBe("file://recordings/one.m4a");
    expect(replacement.word.recordingUri).toBe("file://recordings/two.m4a");

    const deleted = await repository.deleteWord(word.id);
    expect(deleted.recordingUri).toBe("file://recordings/two.m4a");
    await expect(repository.listWords()).resolves.toEqual([]);
  });
});

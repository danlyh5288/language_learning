import {
  type TagRecord,
  UNTAGGED_FILTER_ID,
  type WordInput,
  type WordListFilters
} from "../../../shared/types";
import type { SQLiteDatabase } from "expo-sqlite";
import type {
  DeletedWordResult,
  MobileWordRecord,
  RecordingReplacementResult,
  SavedRecordingInput,
  SqlValue,
  VocabDatabase,
  VocabularyRepositoryApi
} from "./types";

const TAG_COLORS = ["#2563eb", "#059669", "#7c3aed", "#d97706", "#dc2626", "#0891b2"];

type SqlRow = Record<string, SqlValue>;

export function createExpoDatabaseAdapter(db: SQLiteDatabase): VocabDatabase {
  return {
    execAsync: (sql: string) => db.execAsync(sql),
    runAsync: (sql: string, params: SqlValue[] = []) => db.runAsync(sql, params),
    getAllAsync: <T>(sql: string, params: SqlValue[] = []) => db.getAllAsync<T>(sql, params),
    getFirstAsync: <T>(sql: string, params: SqlValue[] = []) => db.getFirstAsync<T>(sql, params)
  };
}

export async function migrateVocabularyDb(db: VocabDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS words (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      tag_id TEXT REFERENCES tags(id) ON DELETE SET NULL,
      tone_note TEXT NOT NULL DEFAULT '',
      audio_uri TEXT,
      audio_mime TEXT,
      audio_duration_ms INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_words_text ON words(text);
    CREATE INDEX IF NOT EXISTS idx_words_tag_id ON words(tag_id);
    CREATE INDEX IF NOT EXISTS idx_words_updated_at ON words(updated_at);

    CREATE TABLE IF NOT EXISTS cloud_recording_uploads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      word_id TEXT NOT NULL,
      local_uri TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cloud_recording_uploads_user_id ON cloud_recording_uploads(user_id);
    CREATE INDEX IF NOT EXISTS idx_cloud_recording_uploads_word_id ON cloud_recording_uploads(word_id);
  `);
}

export class VocabularyRepository implements VocabularyRepositoryApi {
  constructor(private readonly db: VocabDatabase) {}

  async listWords(filters: WordListFilters = {}): Promise<MobileWordRecord[]> {
    const where: string[] = [];
    const params: SqlValue[] = [];
    const trimmedQuery = filters.query?.trim() ?? "";

    if (filters.tagId === UNTAGGED_FILTER_ID) {
      where.push("w.tag_id IS NULL");
    } else if (filters.tagId) {
      where.push("w.tag_id = ?");
      params.push(filters.tagId);
    }

    if (trimmedQuery.startsWith("#")) {
      const tagQuery = trimmedQuery.slice(1).trim();
      if (tagQuery.length > 0) {
        where.push("LOWER(t.name) LIKE LOWER(?)");
        params.push(`%${tagQuery}%`);
      }
    } else if (trimmedQuery.length > 0) {
      where.push("(LOWER(w.text) LIKE LOWER(?) OR LOWER(w.tone_note) LIKE LOWER(?) OR LOWER(t.name) LIKE LOWER(?))");
      params.push(`%${trimmedQuery}%`, `%${trimmedQuery}%`, `%${trimmedQuery}%`);
    }

    const rows = await this.db.getAllAsync<SqlRow>(
      `
        SELECT
          w.id,
          w.text,
          w.tag_id AS tagId,
          t.name AS tagName,
          t.color AS tagColor,
          w.tone_note AS toneNote,
          w.audio_uri AS recordingUri,
          w.audio_mime AS audioMimeType,
          w.audio_duration_ms AS audioDurationMs,
          CASE WHEN w.audio_uri IS NULL THEN 0 ELSE 1 END AS hasRecording,
          w.created_at AS createdAt,
          w.updated_at AS updatedAt
        FROM words w
        LEFT JOIN tags t ON t.id = w.tag_id
        ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY datetime(w.updated_at) DESC, datetime(w.created_at) DESC
      `,
      params
    );

    return rows.map(mapWordRow);
  }

  async listTags(): Promise<TagRecord[]> {
    const rows = await this.db.getAllAsync<SqlRow>(`
      SELECT
        t.id,
        t.name,
        t.color,
        COUNT(w.id) AS wordCount
      FROM tags t
      LEFT JOIN words w ON w.tag_id = t.id
      GROUP BY t.id, t.name, t.color
      ORDER BY LOWER(t.name)
    `);

    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      color: String(row.color),
      wordCount: Number(row.wordCount ?? 0)
    }));
  }

  async createTag(name: string): Promise<TagRecord> {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error("标签名称不能为空");
    }

    const existing = await this.db.getFirstAsync<SqlRow>(
      "SELECT id, name, color, 0 AS wordCount FROM tags WHERE LOWER(name) = LOWER(?)",
      [normalizedName]
    );

    if (existing) {
      return {
        id: String(existing.id),
        name: String(existing.name),
        color: String(existing.color),
        wordCount: Number(existing.wordCount ?? 0)
      };
    }

    const id = createId();
    const now = new Date().toISOString();
    const tags = await this.listTags();
    const color = TAG_COLORS[tags.length % TAG_COLORS.length];
    await this.db.runAsync("INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)", [
      id,
      normalizedName,
      color,
      now
    ]);

    const created = (await this.listTags()).find((tag) => tag.id === id);
    return created ?? { id, name: normalizedName, color, wordCount: 0 };
  }

  async createWord(input: WordInput): Promise<MobileWordRecord> {
    const text = normalizeWordText(input.text);
    const now = new Date().toISOString();
    const id = createId();

    await this.db.runAsync(
      `
        INSERT INTO words (id, text, tag_id, tone_note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [id, text, normalizeTagId(input.tagId), input.toneNote.trim(), now, now]
    );

    return this.requireWord(id);
  }

  async updateWord(id: string, input: WordInput): Promise<MobileWordRecord> {
    const text = normalizeWordText(input.text);
    const now = new Date().toISOString();

    await this.assertWordExists(id);
    await this.db.runAsync(
      `
        UPDATE words
        SET text = ?, tag_id = ?, tone_note = ?, updated_at = ?
        WHERE id = ?
      `,
      [text, normalizeTagId(input.tagId), input.toneNote.trim(), now, id]
    );

    return this.requireWord(id);
  }

  async deleteWord(id: string): Promise<DeletedWordResult> {
    const existing = await this.getWordStorageRow(id);
    if (!existing) {
      return { recordingUri: null };
    }

    await this.db.runAsync("DELETE FROM words WHERE id = ?", [id]);
    return {
      recordingUri: typeof existing.audio_uri === "string" ? existing.audio_uri : null
    };
  }

  async saveRecordingForWord(input: SavedRecordingInput): Promise<RecordingReplacementResult> {
    await this.assertWordExists(input.wordId);

    const oldRow = await this.getWordStorageRow(input.wordId);
    const oldRecordingUri = typeof oldRow?.audio_uri === "string" ? oldRow.audio_uri : null;
    const now = new Date().toISOString();

    await this.db.runAsync(
      `
        UPDATE words
        SET audio_uri = ?, audio_mime = ?, audio_duration_ms = ?, updated_at = ?
        WHERE id = ?
      `,
      [input.uri, input.mimeType, Math.max(0, Math.round(input.durationMs)), now, input.wordId]
    );

    return {
      word: await this.requireWord(input.wordId),
      oldRecordingUri
    };
  }

  private async requireWord(id: string): Promise<MobileWordRecord> {
    const row = await this.db.getFirstAsync<SqlRow>(
      `
        SELECT
          w.id,
          w.text,
          w.tag_id AS tagId,
          t.name AS tagName,
          t.color AS tagColor,
          w.tone_note AS toneNote,
          w.audio_uri AS recordingUri,
          w.audio_mime AS audioMimeType,
          w.audio_duration_ms AS audioDurationMs,
          CASE WHEN w.audio_uri IS NULL THEN 0 ELSE 1 END AS hasRecording,
          w.created_at AS createdAt,
          w.updated_at AS updatedAt
        FROM words w
        LEFT JOIN tags t ON t.id = w.tag_id
        WHERE w.id = ?
      `,
      [id]
    );

    if (!row) {
      throw new Error("词条不存在");
    }

    return mapWordRow(row);
  }

  private async assertWordExists(id: string): Promise<void> {
    await this.requireWord(id);
  }

  private async getWordStorageRow(id: string): Promise<SqlRow | null> {
    return this.db.getFirstAsync<SqlRow>("SELECT id, audio_uri FROM words WHERE id = ?", [id]);
  }
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

function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mapWordRow(row: SqlRow): MobileWordRecord {
  const recordingUri = row.recordingUri ? String(row.recordingUri) : null;

  return {
    id: String(row.id),
    text: String(row.text),
    tagId: row.tagId ? String(row.tagId) : null,
    tagName: row.tagName ? String(row.tagName) : null,
    tagColor: row.tagColor ? String(row.tagColor) : null,
    toneNote: String(row.toneNote ?? ""),
    recordingUri,
    audioMimeType: row.audioMimeType ? String(row.audioMimeType) : null,
    audioDurationMs: row.audioDurationMs === null || row.audioDurationMs === undefined ? null : Number(row.audioDurationMs),
    hasRecording: Number(row.hasRecording) === 1,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

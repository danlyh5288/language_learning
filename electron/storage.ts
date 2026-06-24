import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import type { Database, SqlJsStatic } from "sql.js";
import {
  type RecordingReadResult,
  type RecordingSaveInput,
  type TagRecord,
  UNTAGGED_FILTER_ID,
  type WordInput,
  type WordListFilters,
  type WordRecord
} from "../shared/types";

const TAG_COLORS = ["#2563eb", "#059669", "#7c3aed", "#d97706", "#dc2626", "#0891b2"];

type SqlValue = string | number | null;
type SqlRow = Record<string, SqlValue>;

export class VocabularyStore {
  private readonly db: Database;
  private readonly dbPath: string;
  private readonly recordingsDir: string;

  constructor(db: Database, dbPath: string, recordingsDir: string) {
    this.db = db;
    this.dbPath = dbPath;
    this.recordingsDir = recordingsDir;
    this.migrate();
  }

  listWords(filters: WordListFilters = {}): WordRecord[] {
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

    const sql = `
      SELECT
        w.id,
        w.text,
        w.tag_id AS tagId,
        t.name AS tagName,
        t.color AS tagColor,
        w.tone_note AS toneNote,
        w.audio_duration_ms AS audioDurationMs,
        CASE WHEN w.audio_path IS NULL THEN 0 ELSE 1 END AS hasRecording,
        w.created_at AS createdAt,
        w.updated_at AS updatedAt
      FROM words w
      LEFT JOIN tags t ON t.id = w.tag_id
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY datetime(w.updated_at) DESC, datetime(w.created_at) DESC
    `;

    return this.select(sql, params).map(mapWordRow);
  }

  getWord(id: string): WordRecord | null {
    const row = this.select(
      `
        SELECT
          w.id,
          w.text,
          w.tag_id AS tagId,
          t.name AS tagName,
          t.color AS tagColor,
          w.tone_note AS toneNote,
          w.audio_duration_ms AS audioDurationMs,
          CASE WHEN w.audio_path IS NULL THEN 0 ELSE 1 END AS hasRecording,
          w.created_at AS createdAt,
          w.updated_at AS updatedAt
        FROM words w
        LEFT JOIN tags t ON t.id = w.tag_id
        WHERE w.id = ?
      `,
      [id]
    )[0];

    return row ? mapWordRow(row) : null;
  }

  createWord(input: WordInput): WordRecord {
    const text = normalizeWordText(input.text);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    this.run(
      `
        INSERT INTO words (id, text, tag_id, tone_note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [id, text, normalizeTagId(input.tagId), input.toneNote.trim(), now, now]
    );
    this.persist();

    return this.requireWord(id);
  }

  updateWord(id: string, input: WordInput): WordRecord {
    const text = normalizeWordText(input.text);
    const now = new Date().toISOString();

    this.assertWordExists(id);
    this.run(
      `
        UPDATE words
        SET text = ?, tag_id = ?, tone_note = ?, updated_at = ?
        WHERE id = ?
      `,
      [text, normalizeTagId(input.tagId), input.toneNote.trim(), now, id]
    );
    this.persist();

    return this.requireWord(id);
  }

  deleteWord(id: string): void {
    const existing = this.getWordStorageRow(id);
    if (!existing) {
      return;
    }

    this.run("DELETE FROM words WHERE id = ?", [id]);
    this.persist();
    this.removeRecordingFile(existing.audio_path);
  }

  listTags(): TagRecord[] {
    return this.select(
      `
        SELECT
          t.id,
          t.name,
          t.color,
          COUNT(w.id) AS wordCount
        FROM tags t
        LEFT JOIN words w ON w.tag_id = t.id
        GROUP BY t.id, t.name, t.color
        ORDER BY LOWER(t.name)
      `
    ).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      color: String(row.color),
      wordCount: Number(row.wordCount ?? 0)
    }));
  }

  createTag(name: string): TagRecord {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error("标签名称不能为空");
    }

    const existing = this.select("SELECT id, name, color, 0 AS wordCount FROM tags WHERE LOWER(name) = LOWER(?)", [
      normalizedName
    ])[0];

    if (existing) {
      return {
        id: String(existing.id),
        name: String(existing.name),
        color: String(existing.color),
        wordCount: Number(existing.wordCount ?? 0)
      };
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const color = TAG_COLORS[this.listTags().length % TAG_COLORS.length];
    this.run("INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)", [id, normalizedName, color, now]);
    this.persist();

    return this.listTags().find((tag) => tag.id === id) ?? { id, name: normalizedName, color, wordCount: 0 };
  }

  saveRecording(input: RecordingSaveInput): WordRecord {
    this.assertWordExists(input.wordId);
    fs.mkdirSync(this.recordingsDir, { recursive: true });

    const extension = extensionForMime(input.mimeType);
    const fileName = `${input.wordId}-${Date.now()}.${extension}`;
    const filePath = path.join(this.recordingsDir, fileName);
    const oldPath = this.getWordStorageRow(input.wordId)?.audio_path ?? null;
    const now = new Date().toISOString();

    fs.writeFileSync(filePath, Buffer.from(input.audioBuffer));
    this.run(
      `
        UPDATE words
        SET audio_path = ?, audio_mime = ?, audio_duration_ms = ?, updated_at = ?
        WHERE id = ?
      `,
      [filePath, input.mimeType, Math.max(0, Math.round(input.durationMs)), now, input.wordId]
    );
    this.persist();

    if (oldPath && oldPath !== filePath) {
      this.removeRecordingFile(oldPath);
    }

    return this.requireWord(input.wordId);
  }

  getRecordingPath(wordId: string): string | null {
    const row = this.getWordStorageRow(wordId);
    if (!row?.audio_path || typeof row.audio_path !== "string") {
      return null;
    }

    if (!fs.existsSync(row.audio_path)) {
      return null;
    }

    return row.audio_path;
  }

  getPlaybackUrl(wordId: string): string | null {
    const word = this.getWord(wordId);
    if (!word?.hasRecording || !this.getRecordingPath(wordId)) {
      return null;
    }

    return `recording://local/${encodeURIComponent(wordId)}?v=${encodeURIComponent(word.updatedAt)}`;
  }

  readRecording(wordId: string): RecordingReadResult | null {
    const row = this.getWordStorageRow(wordId);
    if (!row?.audio_path || typeof row.audio_path !== "string" || !fs.existsSync(row.audio_path)) {
      return null;
    }

    const audioBuffer = fs.readFileSync(row.audio_path);
    const mimeType = typeof row.audio_mime === "string" && row.audio_mime ? row.audio_mime : mimeTypeForPath(row.audio_path);
    return {
      audioBuffer: audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength),
      mimeType
    };
  }

  private migrate(): void {
    this.db.run("PRAGMA foreign_keys = ON");
    this.db.run(`
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
        audio_path TEXT,
        audio_mime TEXT,
        audio_duration_ms INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_words_text ON words(text);
      CREATE INDEX IF NOT EXISTS idx_words_tag_id ON words(tag_id);
      CREATE INDEX IF NOT EXISTS idx_words_updated_at ON words(updated_at);
    `);
    this.persist();
  }

  private select(sql: string, params: SqlValue[] = []): SqlRow[] {
    const statement = this.db.prepare(sql);
    const rows: SqlRow[] = [];

    try {
      if (params.length > 0) {
        statement.bind(params);
      }

      while (statement.step()) {
        rows.push(statement.getAsObject() as SqlRow);
      }
    } finally {
      statement.free();
    }

    return rows;
  }

  private run(sql: string, params: SqlValue[] = []): void {
    const statement = this.db.prepare(sql);

    try {
      if (params.length > 0) {
        statement.bind(params);
      }
      statement.step();
    } finally {
      statement.free();
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()));
  }

  private requireWord(id: string): WordRecord {
    const word = this.getWord(id);
    if (!word) {
      throw new Error("词条不存在");
    }
    return word;
  }

  private assertWordExists(id: string): void {
    if (!this.getWord(id)) {
      throw new Error("词条不存在");
    }
  }

  private getWordStorageRow(id: string): SqlRow | null {
    return this.select("SELECT id, audio_path, audio_mime FROM words WHERE id = ?", [id])[0] ?? null;
  }

  private removeRecordingFile(filePath: SqlValue): void {
    if (typeof filePath !== "string") {
      return;
    }

    const resolved = path.resolve(filePath);
    const recordingsRoot = path.resolve(this.recordingsDir);
    if (!resolved.startsWith(recordingsRoot) || !fs.existsSync(resolved)) {
      return;
    }

    fs.rmSync(resolved, { force: true });
  }
}

export async function createVocabularyStore(userDataPath: string): Promise<VocabularyStore> {
  const SQL: SqlJsStatic = await initSqlJs({
    locateFile: (file) => path.join(__dirname, "..", "..", "node_modules", "sql.js", "dist", file)
  });
  const dataDir = path.join(userDataPath, "data");
  const dbPath = path.join(dataDir, "vocabulary.sqlite");
  const recordingsDir = path.join(dataDir, "recordings");
  const db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();

  return new VocabularyStore(db, dbPath, recordingsDir);
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

function extensionForMime(mimeType: string): string {
  if (mimeType.includes("webm")) {
    return "webm";
  }
  if (mimeType.includes("ogg")) {
    return "ogg";
  }
  if (mimeType.includes("mp4")) {
    return "m4a";
  }
  if (mimeType.includes("wav")) {
    return "wav";
  }
  return "audio";
}

function mimeTypeForPath(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".webm") {
    return "audio/webm";
  }
  if (extension === ".ogg") {
    return "audio/ogg";
  }
  if (extension === ".m4a" || extension === ".mp4") {
    return "audio/mp4";
  }
  if (extension === ".wav") {
    return "audio/wav";
  }
  return "application/octet-stream";
}

function mapWordRow(row: SqlRow): WordRecord {
  return {
    id: String(row.id),
    text: String(row.text),
    tagId: row.tagId ? String(row.tagId) : null,
    tagName: row.tagName ? String(row.tagName) : null,
    tagColor: row.tagColor ? String(row.tagColor) : null,
    toneNote: String(row.toneNote ?? ""),
    audioDurationMs: row.audioDurationMs === null || row.audioDurationMs === undefined ? null : Number(row.audioDurationMs),
    hasRecording: Number(row.hasRecording) === 1,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt)
  };
}

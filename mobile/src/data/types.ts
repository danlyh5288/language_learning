import type { TagRecord, WordInput, WordListFilters, WordRecord } from "../../../shared/types";

export type SqlValue = string | number | null;

export type VocabDatabase = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlValue[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
};

export type MobileWordRecord = WordRecord & {
  recordingUri: string | null;
  audioMimeType: string | null;
};

export type PendingRecording = {
  uri: string;
  durationMs: number;
  mimeType: string;
};

export type SavedRecordingInput = PendingRecording & {
  wordId: string;
};

export type RecordingReplacementResult = {
  word: MobileWordRecord;
  oldRecordingUri: string | null;
};

export type DeletedWordResult = {
  recordingUri: string | null;
};

export type RepositoryChangeListener = () => void;

export type RepositoryUnsubscribe = () => void;

export type VocabularyRepositoryApi = {
  listWords(filters?: WordListFilters): Promise<MobileWordRecord[]>;
  listTags(): Promise<TagRecord[]>;
  createTag(name: string): Promise<TagRecord>;
  createWord(input: WordInput): Promise<MobileWordRecord>;
  updateWord(id: string, input: WordInput): Promise<MobileWordRecord>;
  deleteWord(id: string): Promise<DeletedWordResult>;
  saveRecordingForWord(input: SavedRecordingInput): Promise<RecordingReplacementResult>;
  subscribe?(listener: RepositoryChangeListener): RepositoryUnsubscribe;
};

export type RecordingFileStore = {
  copyRecordingToLibrary(sourceUri: string, wordId: string): Promise<string>;
  deleteRecording(uri: string | null | undefined): Promise<void>;
};

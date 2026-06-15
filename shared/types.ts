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
};

export type TagRecord = {
  id: string;
  name: string;
  color: string;
  wordCount: number;
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
  };
};

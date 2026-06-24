import {
  type RecordingSaveInput,
  type TagRecord,
  UNTAGGED_FILTER_ID,
  type VocabApi,
  type WordInput,
  type WordListFilters,
  type WordRecord
} from "../shared/types";

type PreviewWord = WordRecord & {
  previewUrl?: string;
};

type PreviewState = {
  tags: TagRecord[];
  words: PreviewWord[];
};

const PREVIEW_STORAGE_KEY = "pronunciation-vault-preview-state";
const CLOUD_MODE_KEY = "pronunciation-vault-cloud-mode";
const previewRecordingUrls = new Map<string, string>();

const baseApi = window.vocabApi ?? createPreviewApi();
let cloudApiPromise: Promise<VocabApi> | null = null;

export const api: VocabApi = import.meta.env.MODE === "test" ? baseApi : createLazyFirebaseApi(baseApi);
export const isElectronRuntime = Boolean(window.vocabApi);

function createLazyFirebaseApi(localApi: VocabApi): VocabApi {
  const shouldUseCloud = () => localStorage.getItem(CLOUD_MODE_KEY) === "cloud";
  const getCloudApi = async () => {
    cloudApiPromise ??= import("./firebaseCloudApi").then((module) => module.createFirebaseAwareApi(localApi));
    return cloudApiPromise;
  };

  return {
    words: {
      list: async (filters?: WordListFilters) => shouldUseCloud() ? (await getCloudApi()).words.list(filters) : localApi.words.list(filters),
      create: async (input: WordInput) => shouldUseCloud() ? (await getCloudApi()).words.create(input) : localApi.words.create(input),
      update: async (id: string, input: WordInput) =>
        shouldUseCloud() ? (await getCloudApi()).words.update(id, input) : localApi.words.update(id, input),
      delete: async (id: string) => shouldUseCloud() ? (await getCloudApi()).words.delete(id) : localApi.words.delete(id)
    },
    tags: {
      list: async () => shouldUseCloud() ? (await getCloudApi()).tags.list() : localApi.tags.list(),
      create: async (name: string) => shouldUseCloud() ? (await getCloudApi()).tags.create(name) : localApi.tags.create(name)
    },
    recordings: {
      saveForWord: async (input: RecordingSaveInput) =>
        shouldUseCloud() ? (await getCloudApi()).recordings.saveForWord(input) : localApi.recordings.saveForWord(input),
      getPlaybackUrl: async (wordId: string) =>
        shouldUseCloud() ? (await getCloudApi()).recordings.getPlaybackUrl(wordId) : localApi.recordings.getPlaybackUrl(wordId)
    },
    auth: {
      getState: async () => (await getCloudApi()).auth?.getState() ?? { user: null },
      signIn: async (input) => (await getCloudApi()).auth?.signIn(input) ?? { user: null },
      signUp: async (input) => (await getCloudApi()).auth?.signUp(input) ?? { user: null },
      sendVerificationEmail: async () => (await getCloudApi()).auth?.sendVerificationEmail() ?? { user: null },
      signOut: async () => (await getCloudApi()).auth?.signOut() ?? { user: null }
    },
    cloudSync: {
      getStatus: async () => {
        if (!shouldUseCloud() && !cloudApiPromise) {
          return localCloudStatus();
        }
        return (await getCloudApi()).cloudSync?.getStatus() ?? localCloudStatus();
      },
      enable: async () => (await getCloudApi()).cloudSync?.enable() ?? Promise.reject(new Error("云同步不可用")),
      disable: async () => (await getCloudApi()).cloudSync?.disable() ?? Promise.reject(new Error("云同步不可用")),
      refresh: async () => (await getCloudApi()).cloudSync?.refresh() ?? Promise.reject(new Error("云同步不可用")),
      subscribe: async (listener) => (await getCloudApi()).cloudSync?.subscribe?.(listener) ?? (() => undefined)
    }
  };
}

function localCloudStatus() {
  return {
    mode: "local" as const,
    user: null,
    isEntitled: false,
    isEnabled: false,
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingRecordingUploads: 0,
    lastSyncError: null
  };
}

function createPreviewApi(): VocabApi {
  return {
    words: {
      list: async (filters?: WordListFilters) => filterWords(loadPreviewState(), filters),
      create: async (input: WordInput) => {
        const state = loadPreviewState();
        const now = new Date().toISOString();
        const word: PreviewWord = {
          id: createId(),
          text: input.text.trim(),
          tagId: input.tagId,
          tagName: tagNameForId(state.tags, input.tagId),
          tagColor: tagColorForId(state.tags, input.tagId),
          toneNote: input.toneNote.trim(),
          audioDurationMs: null,
          hasRecording: false,
          createdAt: now,
          updatedAt: now
        };

        state.words.unshift(word);
        savePreviewState(state);
        return word;
      },
      update: async (id: string, input: WordInput) => {
        const state = loadPreviewState();
        const word = state.words.find((item) => item.id === id);
        if (!word) {
          throw new Error("词条不存在");
        }

        word.text = input.text.trim();
        word.tagId = input.tagId;
        word.tagName = tagNameForId(state.tags, input.tagId);
        word.tagColor = tagColorForId(state.tags, input.tagId);
        word.toneNote = input.toneNote.trim();
        word.updatedAt = new Date().toISOString();
        savePreviewState(state);
        return word;
      },
      delete: async (id: string) => {
        const state = loadPreviewState();
        savePreviewState({ ...state, words: state.words.filter((word) => word.id !== id) });
        const url = previewRecordingUrls.get(id);
        if (url) {
          URL.revokeObjectURL(url);
          previewRecordingUrls.delete(id);
        }
      }
    },
    tags: {
      list: async () => loadPreviewState().tags.map((tag) => ({ ...tag })),
      create: async (name: string) => {
        const state = loadPreviewState();
        const normalizedName = name.trim();
        const existing = state.tags.find((tag) => tag.name.toLowerCase() === normalizedName.toLowerCase());
        if (existing) {
          return existing;
        }

        const tag: TagRecord = {
          id: createId(),
          name: normalizedName,
          color: ["#2563eb", "#059669", "#7c3aed", "#d97706", "#dc2626"][state.tags.length % 5],
          wordCount: 0
        };
        state.tags.push(tag);
        savePreviewState(state);
        return tag;
      }
    },
    recordings: {
      saveForWord: async (input: RecordingSaveInput) => {
        const state = loadPreviewState();
        const word = state.words.find((item) => item.id === input.wordId);
        if (!word) {
          throw new Error("词条不存在");
        }

        const oldUrl = previewRecordingUrls.get(input.wordId);
        if (oldUrl) {
          URL.revokeObjectURL(oldUrl);
        }
        const url = URL.createObjectURL(new Blob([input.audioBuffer], { type: input.mimeType }));
        previewRecordingUrls.set(input.wordId, url);

        word.hasRecording = true;
        word.audioDurationMs = Math.round(input.durationMs);
        word.updatedAt = new Date().toISOString();
        savePreviewState(state);
        return word;
      },
      getPlaybackUrl: async (wordId: string) => previewRecordingUrls.get(wordId) ?? null
    }
  };
}

function loadPreviewState(): PreviewState {
  const saved = localStorage.getItem(PREVIEW_STORAGE_KEY);
  if (saved) {
    const state = JSON.parse(saved) as PreviewState;
    return withFreshCounts(state);
  }

  const now = new Date().toISOString();
  const tags: TagRecord[] = [
    { id: "tag-lesson-1", name: "第一课", color: "#2563eb", wordCount: 0 },
    { id: "tag-daily", name: "日常", color: "#059669", wordCount: 0 },
    { id: "tag-place", name: "地点", color: "#7c3aed", wordCount: 0 }
  ];
  const words: PreviewWord[] = [
    {
      id: "word-1",
      text: "侬好",
      tagId: "tag-daily",
      tagName: "日常",
      tagColor: "#059669",
      toneNote: "开口轻一点，第二字收短。",
      audioDurationMs: null,
      hasRecording: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "word-2",
      text: "辰光",
      tagId: "tag-lesson-1",
      tagName: "第一课",
      tagColor: "#2563eb",
      toneNote: "老师说第一个字不要拖长。",
      audioDurationMs: null,
      hasRecording: false,
      createdAt: now,
      updatedAt: now
    },
    {
      id: "word-3",
      text: "弄堂",
      tagId: "tag-place",
      tagName: "地点",
      tagColor: "#7c3aed",
      toneNote: "后字更轻，整体往下走。",
      audioDurationMs: null,
      hasRecording: false,
      createdAt: now,
      updatedAt: now
    }
  ];

  const state = withFreshCounts({ tags, words });
  savePreviewState(state);
  return state;
}

function savePreviewState(state: PreviewState): void {
  localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(withFreshCounts(state)));
}

function withFreshCounts(state: PreviewState): PreviewState {
  return {
    words: state.words.map((word) => ({
      ...word,
      tagName: tagNameForId(state.tags, word.tagId),
      tagColor: tagColorForId(state.tags, word.tagId)
    })),
    tags: state.tags.map((tag) => ({
      ...tag,
      wordCount: state.words.filter((word) => word.tagId === tag.id).length
    }))
  };
}

function filterWords(state: PreviewState, filters: WordListFilters = {}): WordRecord[] {
  const query = filters.query?.trim() ?? "";
  const lowerQuery = query.toLowerCase();

  return state.words
    .filter((word) => {
      if (filters.tagId === UNTAGGED_FILTER_ID && word.tagId !== null) {
        return false;
      }
      if (filters.tagId && filters.tagId !== UNTAGGED_FILTER_ID && word.tagId !== filters.tagId) {
        return false;
      }
      if (query.startsWith("#")) {
        const tagQuery = query.slice(1).trim().toLowerCase();
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
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function tagNameForId(tags: TagRecord[], tagId: string | null): string | null {
  return tags.find((tag) => tag.id === tagId)?.name ?? null;
}

function tagColorForId(tags: TagRecord[], tagId: string | null): string | null {
  return tags.find((tag) => tag.id === tagId)?.color ?? null;
}

function createId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

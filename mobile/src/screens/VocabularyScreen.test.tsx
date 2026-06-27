import { Alert } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { UNTAGGED_FILTER_ID, type TagRecord, type WordInput, type WordListFilters } from "../../../shared/types";
import type {
  DeletedWordResult,
  MobileWordRecord,
  RecordingFileStore,
  RepositoryChangeListener,
  RecordingReplacementResult,
  SavedRecordingInput,
  VocabularyRepositoryApi
} from "../data/types";
import { VocabularyScreen } from "./VocabularyScreen";

function createFileStore(): RecordingFileStore {
  return {
    copyRecordingToLibrary: jest.fn(async (_sourceUri: string, wordId: string) => `file://library/${wordId}.m4a`),
    deleteRecording: jest.fn(async () => undefined)
  };
}

class FakeRepository implements VocabularyRepositoryApi {
  tags: TagRecord[];
  words: MobileWordRecord[];
  private listeners = new Set<RepositoryChangeListener>();
  private nextId = 1;

  constructor(seed?: { tags?: TagRecord[]; words?: MobileWordRecord[] }) {
    this.tags = seed?.tags ?? [];
    this.words = seed?.words ?? [];
  }

  async listWords(filters: WordListFilters = {}): Promise<MobileWordRecord[]> {
    const query = filters.query?.trim() ?? "";
    const lowerQuery = query.toLowerCase();

    return this.withFreshTags()
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

  async listTags(): Promise<TagRecord[]> {
    return this.tags.map((tag) => ({
      ...tag,
      wordCount: this.words.filter((word) => word.tagId === tag.id).length
    }));
  }

  async createTag(name: string): Promise<TagRecord> {
    const existing = this.tags.find((tag) => tag.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) {
      return existing;
    }

    const tag: TagRecord = {
      id: `tag-${this.nextId++}`,
      name: name.trim(),
      color: "#059669",
      wordCount: 0
    };
    this.tags.push(tag);
    return tag;
  }

  async createWord(input: WordInput): Promise<MobileWordRecord> {
    const now = new Date().toISOString();
    const word = this.decorateWord({
      id: `word-${this.nextId++}`,
      text: input.text.trim(),
      tagId: input.tagId,
      tagName: null,
      tagColor: null,
      toneNote: input.toneNote.trim(),
      audioDurationMs: null,
      hasRecording: false,
      recordingUri: null,
      audioMimeType: null,
      createdAt: now,
      updatedAt: now
    });
    this.words.unshift(word);
    return word;
  }

  async updateWord(id: string, input: WordInput): Promise<MobileWordRecord> {
    const word = this.words.find((item) => item.id === id);
    if (!word) {
      throw new Error("词条不存在");
    }
    word.text = input.text.trim();
    word.tagId = input.tagId;
    word.toneNote = input.toneNote.trim();
    word.updatedAt = new Date().toISOString();
    return this.decorateWord(word);
  }

  async deleteWord(id: string): Promise<DeletedWordResult> {
    const word = this.words.find((item) => item.id === id);
    this.words = this.words.filter((item) => item.id !== id);
    return { recordingUri: word?.recordingUri ?? null };
  }

  async saveRecordingForWord(input: SavedRecordingInput): Promise<RecordingReplacementResult> {
    const word = this.words.find((item) => item.id === input.wordId);
    if (!word) {
      throw new Error("词条不存在");
    }
    const oldRecordingUri = word.recordingUri;
    word.recordingUri = input.uri;
    word.audioMimeType = input.mimeType;
    word.audioDurationMs = input.durationMs;
    word.hasRecording = true;
    word.updatedAt = new Date().toISOString();
    return { word: this.decorateWord(word), oldRecordingUri };
  }

  subscribe(listener: RepositoryChangeListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitChange() {
    this.listeners.forEach((listener) => listener());
  }

  private withFreshTags(): MobileWordRecord[] {
    return this.words.map((word) => this.decorateWord(word));
  }

  private decorateWord(word: MobileWordRecord): MobileWordRecord {
    const tag = this.tags.find((item) => item.id === word.tagId);
    return {
      ...word,
      tagName: tag?.name ?? null,
      tagColor: tag?.color ?? null
    };
  }
}

function seedWord(partial: Partial<MobileWordRecord> & Pick<MobileWordRecord, "id" | "text">): MobileWordRecord {
  const now = new Date().toISOString();
  return {
    tagId: null,
    tagName: null,
    tagColor: null,
    toneNote: "",
    audioDurationMs: null,
    hasRecording: false,
    recordingUri: null,
    audioMimeType: null,
    createdAt: now,
    updatedAt: now,
    ...partial
  };
}

describe("VocabularyScreen", () => {
  it("renders words and filters by text", async () => {
    const tags = [{ id: "tag-lesson", name: "第一课", color: "#2563eb", wordCount: 0 }];
    const repository = new FakeRepository({
      tags,
      words: [
        seedWord({ id: "word-1", text: "侬好", toneNote: "开口轻一点" }),
        seedWord({ id: "word-2", text: "辰光", tagId: "tag-lesson", toneNote: "第一个字不要拖长" })
      ]
    });

    const view = await render(<VocabularyScreen repository={repository} recordingFiles={createFileStore()} />);

    expect(await view.findByText("侬好")).toBeTruthy();
    expect(view.getByText("辰光")).toBeTruthy();

    await fireEvent.changeText(view.getByLabelText("搜索词条"), "辰光");

    expect(await view.findByText("1 个词条")).toBeTruthy();
    expect(view.getByText("辰光")).toBeTruthy();
    expect(view.queryByText("侬好")).toBeNull();
  });

  it("reloads words when the repository emits a change", async () => {
    const repository = new FakeRepository();
    const view = await render(<VocabularyScreen repository={repository} recordingFiles={createFileStore()} />);

    expect(await view.findByText("暂无匹配词条")).toBeTruthy();

    repository.words.push(seedWord({ id: "word-remote", text: "远端词" }));
    await act(async () => {
      repository.emitChange();
    });

    expect(await view.findByText("远端词")).toBeTruthy();
  });

  it("does not show the just-created word as a duplicate while a save is still pending", async () => {
    const repository = new FakeRepository();
    jest.spyOn(repository, "createWord").mockImplementation(async () => new Promise<MobileWordRecord>(() => undefined));
    const view = await render(<VocabularyScreen repository={repository} recordingFiles={createFileStore()} />);

    await fireEvent.press(view.getByLabelText("添加词条"));
    await view.findByLabelText("词条");
    await fireEvent.changeText(view.getByLabelText("词条"), "谢谢");
    await fireEvent.press(view.getByText("保存"));

    repository.words.push(seedWord({ id: "word-created", text: "谢谢" }));
    await act(async () => {
      repository.emitChange();
    });

    expect(view.queryByText("已有同名词条：谢谢")).toBeNull();
  });

  it("creates a word with a new tag and filters with #tag search", async () => {
    const repository = new FakeRepository();

    const view = await render(<VocabularyScreen repository={repository} recordingFiles={createFileStore()} />);

    await fireEvent.press(view.getByLabelText("添加词条"));
    await view.findByLabelText("词条");
    await fireEvent.changeText(view.getByLabelText("词条"), "谢谢");
    await fireEvent.changeText(view.getByLabelText("新建标签名称"), "问候");
    await fireEvent.press(view.getByLabelText("新建标签"));
    await fireEvent.changeText(view.getByLabelText("音调备注"), "第二个字轻短，尾音不要上扬。");
    await fireEvent.press(view.getByText("保存"));

    expect(await view.findByText("已保存")).toBeTruthy();

    await fireEvent.press(view.getByLabelText("返回词条列表"));
    expect(await view.findByText("谢谢")).toBeTruthy();

    await fireEvent.changeText(view.getByLabelText("搜索词条"), "#问候");

    expect(await view.findByText("1 个词条")).toBeTruthy();
    expect(view.getByText("谢谢")).toBeTruthy();
  });

  it("shows existing recording state in the detail audio panel", async () => {
    const repository = new FakeRepository({
      words: [
        seedWord({
          id: "word-recorded",
          text: "弄堂",
          hasRecording: true,
          recordingUri: "file://recordings/word-recorded.m4a",
          audioDurationMs: 2400
        })
      ]
    });

    const view = await render(<VocabularyScreen repository={repository} recordingFiles={createFileStore()} />);

    await fireEvent.press(await view.findByLabelText("打开词条 弄堂"));

    expect(await view.findByText("当前录音 0:02")).toBeTruthy();
    expect(view.getByLabelText("试听录音")).toBeTruthy();
    expect(view.getByText("重新录音")).toBeTruthy();
  });

  it("deletes a word after confirmation and asks file store to remove audio", async () => {
    const repository = new FakeRepository({
      words: [
        seedWord({
          id: "word-delete",
          text: "再会",
          hasRecording: true,
          recordingUri: "file://recordings/delete.m4a",
          audioDurationMs: 1200
        })
      ]
    });
    const fileStore = createFileStore();
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.style === "destructive")?.onPress?.();
    });

    const view = await render(<VocabularyScreen repository={repository} recordingFiles={fileStore} />);

    await fireEvent.press(await view.findByLabelText("打开词条 再会"));
    await view.findByLabelText("删除词条");
    await fireEvent.press(view.getByLabelText("删除词条"));

    await waitFor(() => expect(view.queryByText("再会")).toBeNull());
    expect(fileStore.deleteRecording).toHaveBeenCalledWith("file://recordings/delete.m4a");
    alertSpy.mockRestore();
  });
});

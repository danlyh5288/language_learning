import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type TagRecord, UNTAGGED_FILTER_ID, type WordInput } from "../../../shared/types";
import { filterWords } from "../../../shared/vocabulary";
import { AlertCircle, Check, ChevronLeft, ListMusic, Plus, Search, Tag, Trash2, X } from "../components/icons";
import { errorMessage, formatDuration } from "../format";
import { colors, styles } from "../theme";
import type { MobileWordRecord, PendingRecording, RecordingFileStore, VocabularyRepositoryApi } from "../data/types";
import { AudioRecorderPanel } from "./AudioRecorderPanel";

const appLogo = require("../../../assets/app-logo-1024.png");

const emptyDraft: WordInput = {
  text: "",
  tagId: null,
  toneNote: ""
};

type Mode =
  | { name: "list" }
  | { name: "detail"; isCreating: boolean };

type VocabularyScreenProps = {
  repository: VocabularyRepositoryApi;
  recordingFiles: RecordingFileStore;
};

export function VocabularyScreen({ repository, recordingFiles }: VocabularyScreenProps) {
  const [allWords, setAllWords] = useState<MobileWordRecord[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [query, setQuery] = useState("");
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ name: "list" });
  const [selectedWord, setSelectedWord] = useState<MobileWordRecord | null>(null);
  const [draft, setDraft] = useState<WordInput>(emptyDraft);
  const [newTagName, setNewTagName] = useState("");
  const [pendingRecording, setPendingRecording] = useState<PendingRecording | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { words: nextAllWords, tags: nextTags } = await repository.loadVocabulary();
      if (!mountedRef.current) {
        return;
      }
      setTags(nextTags);
      setAllWords(nextAllWords);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    mountedRef.current = true;
    void loadData();
    return () => {
      mountedRef.current = false;
    };
  }, [loadData]);

  useEffect(() => {
    if (!repository.subscribe) {
      return undefined;
    }
    return repository.subscribe(() => {
      void loadData();
    });
  }, [loadData, repository]);

  useEffect(() => {
    if (!selectedWord) {
      return;
    }

    const freshWord = allWords.find((word) => word.id === selectedWord.id);
    if (!freshWord) {
      setSelectedWord(null);
      setDraft(emptyDraft);
      return;
    }

    setSelectedWord(freshWord);
  }, [allWords, selectedWord]);

  const words = useMemo(() => filterWords(allWords, { query, tagId: activeTagId }), [activeTagId, allWords, query]);
  const untaggedCount = useMemo(() => allWords.filter((word) => !word.tagId).length, [allWords]);
  const duplicateWord = useMemo(() => {
    if (isSaving) {
      return null;
    }

    const normalized = draft.text.trim();
    if (!normalized) {
      return null;
    }

    return allWords.find((word) => word.text === normalized && word.id !== selectedWord?.id) ?? null;
  }, [allWords, draft.text, isSaving, selectedWord?.id]);
  const canSave = draft.text.trim().length > 0 && !isSaving;

  async function discardPendingRecording() {
    const current = pendingRecording;
    setPendingRecording(null);
    if (current) {
      await recordingFiles.deleteRecording(current.uri);
    }
  }

  async function clearDetailState() {
    await discardPendingRecording();
    setSelectedWord(null);
    setDraft(emptyDraft);
    setNewTagName("");
    setMessage(null);
    setError(null);
  }

  function selectWord(word: MobileWordRecord) {
    void discardPendingRecording();
    setSelectedWord(word);
    setDraft({
      text: word.text,
      tagId: word.tagId,
      toneNote: word.toneNote
    });
    setMode({ name: "detail", isCreating: false });
    setMessage(null);
    setError(null);
  }

  function startNewWord() {
    void clearDetailState();
    setMode({ name: "detail", isCreating: true });
  }

  function closeDetail() {
    void clearDetailState();
    setMode({ name: "list" });
  }

  function updateDraft(partial: Partial<WordInput>) {
    setDraft((current) => ({ ...current, ...partial }));
    setMessage(null);
  }

  async function createTag() {
    const normalizedName = newTagName.trim();
    if (!normalizedName) {
      return;
    }

    try {
      const tag = await repository.createTag(normalizedName);
      setDraft((current) => ({ ...current, tagId: tag.id }));
      setNewTagName("");
      await loadData();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function saveDraft() {
    if (!canSave) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);

    let copiedRecordingUri: string | null = null;
    try {
      let savedWord = mode.name === "detail" && !mode.isCreating && selectedWord
        ? await repository.updateWord(selectedWord.id, draft)
        : await repository.createWord(draft);

      if (pendingRecording) {
        copiedRecordingUri = await recordingFiles.copyRecordingToLibrary(pendingRecording.uri, savedWord.id);
        const replacement = await repository.saveRecordingForWord({
          wordId: savedWord.id,
          uri: copiedRecordingUri,
          mimeType: pendingRecording.mimeType,
          durationMs: pendingRecording.durationMs
        });
        await recordingFiles.deleteRecording(replacement.oldRecordingUri);
        await recordingFiles.deleteRecording(pendingRecording.uri);
        copiedRecordingUri = null;
        setPendingRecording(null);
        savedWord = replacement.word;
      }

      setSelectedWord(savedWord);
      setDraft({
        text: savedWord.text,
        tagId: savedWord.tagId,
        toneNote: savedWord.toneNote
      });
      setMode({ name: "detail", isCreating: false });
      setMessage("已保存");
      await loadData();
    } catch (caught) {
      if (copiedRecordingUri) {
        await recordingFiles.deleteRecording(copiedRecordingUri);
      }
      setError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  function confirmDeleteSelectedWord() {
    if (!selectedWord) {
      return;
    }

    Alert.alert("删除词条", `删除“${selectedWord.text}”？录音也会从本机移除。`, [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => void deleteSelectedWord()
      }
    ]);
  }

  async function deleteSelectedWord() {
    if (!selectedWord) {
      return;
    }

    try {
      const deleted = await repository.deleteWord(selectedWord.id);
      await recordingFiles.deleteRecording(deleted.recordingUri);
      await clearDetailState();
      setMode({ name: "list" });
      setMessage("已删除");
      await loadData();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  if (mode.name === "detail") {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.screen}
      >
        <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
          <DetailHeader
            title={mode.isCreating ? "新词条" : selectedWord?.text ?? "词条详情"}
            canDelete={Boolean(selectedWord)}
            onBack={closeDetail}
            onDelete={confirmDeleteSelectedWord}
          />
          <ScrollView style={styles.detailScroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>{mode.isCreating ? "新词条" : selectedWord?.text ?? "词条详情"}</Text>

              <View style={[styles.field, { marginTop: 18 }]}>
                <Text style={styles.label}>词条</Text>
                <TextInput
                  accessibilityLabel="词条"
                  style={styles.input}
                  value={draft.text}
                  placeholder="例如：侬好"
                  placeholderTextColor={colors.faint}
                  onChangeText={(text) => updateDraft({ text })}
                />
              </View>

              {duplicateWord ? (
                <View style={styles.inlineWarning}>
                  <AlertCircle size={16} color={colors.warning} />
                  <Text style={styles.inlineWarningText}>已有同名词条：{duplicateWord.text}</Text>
                </View>
              ) : null}

              <View style={styles.field}>
                <Text style={styles.label}>标签</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.tagChoiceScroll}
                  contentContainerStyle={styles.tagChoiceRail}
                >
                  <TagChoice
                    label="未分类"
                    active={draft.tagId === null}
                    onPress={() => updateDraft({ tagId: null })}
                  />
                  {tags.map((tag) => (
                    <TagChoice
                      key={tag.id}
                      label={tag.name}
                      color={tag.color}
                      active={draft.tagId === tag.id}
                      onPress={() => updateDraft({ tagId: tag.id })}
                    />
                  ))}
                </ScrollView>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>新建标签</Text>
                <View style={styles.inlineCreate}>
                  <TextInput
                    accessibilityLabel="新建标签名称"
                    style={[styles.input, styles.inlineCreateInput]}
                    value={newTagName}
                    placeholder="如：第一课"
                    placeholderTextColor={colors.faint}
                    onChangeText={setNewTagName}
                    onSubmitEditing={() => void createTag()}
                  />
                  <Pressable accessibilityRole="button" accessibilityLabel="新建标签" style={styles.iconButton} onPress={() => void createTag()}>
                    <Plus size={18} color={colors.muted} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>音调备注</Text>
                <TextInput
                  accessibilityLabel="音调备注"
                  multiline
                  style={[styles.input, styles.textArea]}
                  value={draft.toneNote}
                  placeholder="记录老师提示、调值、近似音或易错点"
                  placeholderTextColor={colors.faint}
                  onChangeText={(toneNote) => updateDraft({ toneNote })}
                />
              </View>

              <AudioRecorderPanel
                word={selectedWord}
                pendingRecording={pendingRecording}
                onDiscard={() => void discardPendingRecording()}
                onPreview={(recording) => {
                  void discardPendingRecording();
                  setPendingRecording(recording);
                  setMessage("新录音待保存");
                }}
              />

              <View style={styles.detailActions}>
                <View style={{ flex: 1 }}>
                  {error ? <Text style={styles.statusError}>{error}</Text> : null}
                  {message && !error ? <Text style={styles.statusOk}>{message}</Text> : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={!canSave}
                  style={[styles.primaryButton, !canSave ? styles.primaryButtonDisabled : null]}
                  onPress={() => void saveDraft()}
                >
                  <Check size={17} color="#ffffff" />
                  <Text style={styles.primaryButtonText}>{isSaving ? "保存中" : "保存"}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View style={styles.brandCluster}>
          <Image source={appLogo} style={styles.logo} accessibilityIgnoresInvertColors />
          <View>
            <Text style={styles.appTitle}>发音词库</Text>
            <Text style={styles.appSubtitle}>本地移动模式</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="添加词条" style={styles.primaryButton} onPress={startNewWord}>
          <Plus size={18} color="#ffffff" />
          <Text style={styles.primaryButtonText}>添加</Text>
        </Pressable>
      </View>

      <View style={styles.searchBox}>
        <Search size={17} color={colors.faint} />
        <TextInput
          accessibilityLabel="搜索词条"
          style={styles.searchInput}
          value={query}
          placeholder="搜索词、备注或 #标签"
          placeholderTextColor={colors.faint}
          onChangeText={setQuery}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="清空搜索" onPress={() => setQuery("")}>
            <X size={17} color={colors.faint} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRailScroll}
        contentContainerStyle={styles.filterRail}
      >
        <FilterChip
          active={activeTagId === null}
          icon={<ListMusic size={15} color={activeTagId === null ? colors.primaryStrong : colors.muted} />}
          label="全部"
          count={allWords.length}
          onPress={() => setActiveTagId(null)}
        />
        <FilterChip
          active={activeTagId === UNTAGGED_FILTER_ID}
          icon={<Tag size={15} color={activeTagId === UNTAGGED_FILTER_ID ? colors.primaryStrong : colors.muted} />}
          label="未分类"
          count={untaggedCount}
          onPress={() => setActiveTagId(UNTAGGED_FILTER_ID)}
        />
        {tags.map((tag) => (
          <FilterChip
            key={tag.id}
            active={activeTagId === tag.id}
            color={tag.color}
            label={tag.name}
            count={tag.wordCount}
            onPress={() => setActiveTagId(tag.id)}
          />
        ))}
      </ScrollView>

      <Text style={styles.listMeta}>{isLoading ? "加载中" : `${words.length} 个词条`}</Text>
      {error ? (
        <View style={[styles.inlineWarning, { marginHorizontal: 16 }]}>
          <AlertCircle size={16} color={colors.warning} />
          <Text style={styles.inlineWarningText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={words}
        keyExtractor={(word) => word.id}
        renderItem={({ item }) => <WordRow word={item} onPress={() => selectWord(item)} />}
        contentContainerStyle={words.length === 0 ? { flexGrow: 1 } : { paddingBottom: 16 }}
        ListEmptyComponent={
          <View style={styles.centeredState}>
            <Text style={styles.emptyTitle}>暂无匹配词条</Text>
            <Text style={[styles.mutedText, { marginTop: 6 }]}>添加课堂词汇、标签和自己的发音录音。</Text>
            <Pressable accessibilityRole="button" style={[styles.secondaryButton, { marginTop: 16 }]} onPress={startNewWord}>
              <Plus size={16} color={colors.primaryStrong} />
              <Text style={styles.secondaryButtonText}>添加第一个词</Text>
            </Pressable>
          </View>
        }
      />
    </SafeAreaView>
  );
}

type DetailHeaderProps = {
  title: string;
  canDelete: boolean;
  onBack: () => void;
  onDelete: () => void;
};

function DetailHeader({ title, canDelete, onBack, onDelete }: DetailHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.brandCluster}>
        <Pressable accessibilityRole="button" accessibilityLabel="返回词条列表" style={styles.iconButton} onPress={onBack}>
          <ChevronLeft size={22} color={colors.muted} />
        </Pressable>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.appSubtitle}>词条详情</Text>
          <Text style={[styles.appTitle, { fontSize: 20 }]} numberOfLines={1}>{title}</Text>
        </View>
      </View>
      {canDelete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="删除词条"
          style={[styles.iconButton, styles.dangerIconButton]}
          onPress={onDelete}
        >
          <Trash2 size={18} color={colors.danger} />
        </Pressable>
      ) : null}
    </View>
  );
}

type FilterChipProps = {
  active: boolean;
  label: string;
  count: number;
  icon?: ReactNode;
  color?: string;
  onPress: () => void;
};

function FilterChip({ active, label, count, icon, color, onPress }: FilterChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}${count}`}
      style={[styles.chip, active ? styles.chipActive : null]}
      onPress={onPress}
    >
      {icon ?? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color ?? colors.muted }} />}
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]} numberOfLines={1}>{label}</Text>
      <Text style={styles.countPill}>{count}</Text>
    </Pressable>
  );
}

type TagChoiceProps = {
  active: boolean;
  label: string;
  color?: string;
  onPress: () => void;
};

function TagChoice({ active, label, color, onPress }: TagChoiceProps) {
  return (
    <Pressable style={[styles.chip, styles.tagChoiceChip, active ? styles.chipActive : null]} onPress={onPress}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color ?? colors.faint }} />
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

type WordRowProps = {
  word: MobileWordRecord;
  onPress: () => void;
};

function WordRow({ word, onPress }: WordRowProps) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`打开词条 ${word.text}`} style={styles.wordRow} onPress={onPress}>
      <View style={[styles.playButton, !word.hasRecording ? styles.playButtonDisabled : null]}>
        <Text style={{ color: word.hasRecording ? colors.primary : colors.faint, fontSize: 16, fontWeight: "800" }}>▶</Text>
      </View>
      <View style={styles.wordMain}>
        <View style={styles.wordTitleRow}>
          <Text style={styles.wordTitle} numberOfLines={1}>{word.text}</Text>
          <Text style={styles.duration}>{word.hasRecording ? formatDuration(word.audioDurationMs) : "未录音"}</Text>
        </View>
        <Text style={styles.notePreview} numberOfLines={1}>{word.toneNote || "无备注"}</Text>
      </View>
      <Text style={[styles.miniTag, { color: word.tagColor ?? colors.muted }]} numberOfLines={1}>
        {word.tagName ?? "未分类"}
      </Text>
    </Pressable>
  );
}

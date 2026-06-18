import {
  AlertCircle,
  BookOpen,
  Check,
  Cloud,
  ListMusic,
  LogIn,
  LogOut,
  Mic,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Square,
  Tag,
  Trash2,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import appLogo from "../assets/app-logo.svg";
import { api, isElectronRuntime } from "./api";
import {
  type TagRecord,
  type CloudSyncStatus,
  UNTAGGED_FILTER_ID,
  type WordInput,
  type WordRecord
} from "../shared/types";

type PendingRecording = {
  blob: Blob;
  durationMs: number;
  url: string;
};

const emptyDraft: WordInput = {
  text: "",
  tagId: null,
  toneNote: ""
};

export default function App() {
  const [words, setWords] = useState<WordRecord[]>([]);
  const [allWords, setAllWords] = useState<WordRecord[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [query, setQuery] = useState("");
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [selectedWord, setSelectedWord] = useState<WordRecord | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<WordInput>(emptyDraft);
  const [newTagName, setNewTagName] = useState("");
  const [pendingRecording, setPendingRecording] = useState<PendingRecording | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [playingWordId, setPlayingWordId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isCloudBusy, setIsCloudBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listAudioRef = useRef<HTMLAudioElement | null>(null);

  const loadCloudStatus = useCallback(async () => {
    if (!api.cloudSync) {
      return;
    }
    try {
      setCloudStatus(await api.cloudSync.getStatus());
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [nextWords, nextTags, nextAllWords] = await Promise.all([
        api.words.list({ query, tagId: activeTagId }),
        api.tags.list(),
        api.words.list()
      ]);
      setWords(nextWords);
      setTags(nextTags);
      setAllWords(nextAllWords);
      setError(null);
      await loadCloudStatus();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsLoading(false);
    }
  }, [activeTagId, loadCloudStatus, query]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  useEffect(() => {
    let cancelled = false;

    async function loadPlaybackUrl() {
      if (pendingRecording) {
        setPlaybackUrl(pendingRecording.url);
        return;
      }

      if (!selectedWord?.hasRecording) {
        setPlaybackUrl(null);
        return;
      }

      const url = await api.recordings.getPlaybackUrl(selectedWord.id);
      if (!cancelled) {
        setPlaybackUrl(url);
      }
    }

    void loadPlaybackUrl().catch((caught) => setError(errorMessage(caught)));
    return () => {
      cancelled = true;
    };
  }, [pendingRecording, selectedWord?.hasRecording, selectedWord?.id, selectedWord?.updatedAt]);

  useEffect(() => {
    return () => {
      if (pendingRecording) {
        URL.revokeObjectURL(pendingRecording.url);
      }
      listAudioRef.current?.pause();
    };
  }, [pendingRecording]);

  const untaggedCount = useMemo(() => allWords.filter((word) => !word.tagId).length, [allWords]);
  const duplicateWord = useMemo(() => {
    const normalized = draft.text.trim();
    if (!normalized) {
      return null;
    }

    return (
      allWords.find((word) => word.text === normalized && word.id !== selectedWord?.id) ??
      null
    );
  }, [allWords, draft.text, selectedWord?.id]);

  const title = isCreating ? "新词条" : selectedWord?.text ?? "选择词条";
  const canSave = draft.text.trim().length > 0 && !isSaving;

  function clearPendingRecording() {
    setPendingRecording((current) => {
      if (current) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  }

  function selectWord(word: WordRecord) {
    clearPendingRecording();
    setIsCreating(false);
    setSelectedWord(word);
    setDraft({
      text: word.text,
      tagId: word.tagId,
      toneNote: word.toneNote
    });
    setMessage(null);
    setError(null);
  }

  function startNewWord() {
    clearPendingRecording();
    setIsCreating(true);
    setSelectedWord(null);
    setDraft(emptyDraft);
    setMessage(null);
    setError(null);
  }

  async function createTag() {
    const normalizedName = newTagName.trim();
    if (!normalizedName) {
      return;
    }

    try {
      const tag = await api.tags.create(normalizedName);
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
    try {
      let savedWord = isCreating || !selectedWord
        ? await api.words.create(draft)
        : await api.words.update(selectedWord.id, draft);

      if (pendingRecording) {
        savedWord = await api.recordings.saveForWord({
          wordId: savedWord.id,
          audioBuffer: await pendingRecording.blob.arrayBuffer(),
          mimeType: pendingRecording.blob.type || "audio/webm",
          durationMs: pendingRecording.durationMs
        });
        clearPendingRecording();
      }

      setIsCreating(false);
      setSelectedWord(savedWord);
      setDraft({
        text: savedWord.text,
        tagId: savedWord.tagId,
        toneNote: savedWord.toneNote
      });
      setMessage("已保存");
      await loadData();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSelectedWord() {
    if (!selectedWord) {
      return;
    }

    const confirmed = window.confirm(`删除“${selectedWord.text}”？录音也会从本机移除。`);
    if (!confirmed) {
      return;
    }

    try {
      await api.words.delete(selectedWord.id);
      clearPendingRecording();
      setSelectedWord(null);
      setDraft(emptyDraft);
      setMessage("已删除");
      await loadData();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function playListRecording(word: WordRecord) {
    if (!word.hasRecording) {
      return;
    }

    try {
      listAudioRef.current?.pause();
      const url = await api.recordings.getPlaybackUrl(word.id);
      if (!url) {
        return;
      }

      const audio = new Audio(url);
      listAudioRef.current = audio;
      setPlayingWordId(word.id);
      audio.addEventListener("ended", () => setPlayingWordId(null), { once: true });
      audio.addEventListener("pause", () => setPlayingWordId(null), { once: true });
      await audio.play();
    } catch (caught) {
      setPlayingWordId(null);
      setError(errorMessage(caught));
    }
  }

  function updateDraft(partial: Partial<WordInput>) {
    setDraft((current) => ({ ...current, ...partial }));
    setMessage(null);
  }

  function handlePendingRecording(blob: Blob, durationMs: number) {
    clearPendingRecording();
    setPendingRecording({
      blob,
      durationMs,
      url: URL.createObjectURL(blob)
    });
    setMessage("新录音待保存");
  }

  async function signIn() {
    if (!api.auth || !authEmail.trim() || !authPassword) {
      return;
    }
    setIsCloudBusy(true);
    setError(null);
    try {
      await api.auth.signIn({ email: authEmail, password: authPassword });
      setAuthPassword("");
      setMessage("已登录");
      await loadCloudStatus();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsCloudBusy(false);
    }
  }

  async function signUp() {
    if (!api.auth || !authEmail.trim() || !authPassword) {
      return;
    }
    setIsCloudBusy(true);
    setError(null);
    try {
      await api.auth.signUp({ email: authEmail, password: authPassword });
      setAuthPassword("");
      setMessage("账号已创建");
      await loadCloudStatus();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsCloudBusy(false);
    }
  }

  async function signOut() {
    if (!api.auth) {
      return;
    }
    setIsCloudBusy(true);
    setError(null);
    try {
      await api.auth.signOut();
      setSelectedWord(null);
      setIsCreating(false);
      setDraft(emptyDraft);
      setMessage("已退出云端账号");
      await loadData();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsCloudBusy(false);
    }
  }

  async function enableCloudSync() {
    if (!api.cloudSync) {
      return;
    }
    setIsCloudBusy(true);
    setError(null);
    try {
      await api.cloudSync.enable();
      setSelectedWord(null);
      setIsCreating(false);
      setDraft(emptyDraft);
      setMessage("已开启云同步");
      await loadData();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsCloudBusy(false);
    }
  }

  async function disableCloudSync() {
    if (!api.cloudSync) {
      return;
    }
    setIsCloudBusy(true);
    setError(null);
    try {
      await api.cloudSync.disable();
      setSelectedWord(null);
      setIsCreating(false);
      setDraft(emptyDraft);
      setMessage("已切换到本地模式");
      await loadData();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsCloudBusy(false);
    }
  }

  async function refreshCloudSync() {
    if (!api.cloudSync) {
      return;
    }
    setIsCloudBusy(true);
    setError(null);
    try {
      await api.cloudSync.refresh();
      await loadData();
      setMessage("云同步已刷新");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsCloudBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="标签">
        <div className="brand">
          <div className="brand-mark">
            <img src={appLogo} alt="" aria-hidden="true" />
          </div>
          <div>
            <h1>发音词库</h1>
            <p>{cloudStatus?.isEnabled ? "云端模式" : isElectronRuntime ? "本地模式" : "浏览器预览"}</p>
          </div>
        </div>

        <CloudPanel
          status={cloudStatus}
          email={authEmail}
          password={authPassword}
          busy={isCloudBusy}
          onEmailChange={setAuthEmail}
          onPasswordChange={setAuthPassword}
          onSignIn={() => void signIn()}
          onSignUp={() => void signUp()}
          onSignOut={() => void signOut()}
          onEnable={() => void enableCloudSync()}
          onDisable={() => void disableCloudSync()}
          onRefresh={() => void refreshCloudSync()}
        />

        <nav className="tag-nav">
          <FilterButton
            active={activeTagId === null}
            icon={<ListMusic size={16} />}
            label="全部"
            count={allWords.length}
            onClick={() => setActiveTagId(null)}
          />
          <FilterButton
            active={activeTagId === UNTAGGED_FILTER_ID}
            icon={<Tag size={16} />}
            label="未分类"
            count={untaggedCount}
            onClick={() => setActiveTagId(UNTAGGED_FILTER_ID)}
          />
        </nav>

        <div className="tag-section">
          <div className="section-label">标签</div>
          {tags.length === 0 ? (
            <div className="muted-row">暂无标签</div>
          ) : (
            tags.map((tag) => (
              <button
                className={`tag-filter ${activeTagId === tag.id ? "is-active" : ""}`}
                key={tag.id}
                type="button"
                onClick={() => setActiveTagId(tag.id)}
              >
                <span className="tag-dot" style={{ backgroundColor: tag.color }} />
                <span>{tag.name}</span>
                <span className="tag-count">{tag.wordCount}</span>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="word-column" aria-label="词条列表">
        <header className="list-header">
          <div className="search-wrap">
            <Search size={17} />
            <input
              aria-label="搜索词条"
              placeholder="搜索词、备注或 #标签"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button className="icon-button compact" type="button" aria-label="清空搜索" onClick={() => setQuery("")}>
                <X size={15} />
              </button>
            ) : null}
          </div>
          <button className="primary-button" type="button" onClick={startNewWord}>
            <Plus size={17} />
            添加词条
          </button>
        </header>

        <div className="list-meta">
          <span>{isLoading ? "加载中" : `${words.length} 个词条`}</span>
          {activeTagId || query ? <button type="button" onClick={() => { setActiveTagId(null); setQuery(""); }}>清除筛选</button> : null}
        </div>

        <div className="word-list">
          {words.length === 0 ? (
            <div className="empty-list">
              <p>暂无匹配词条</p>
              <button type="button" onClick={startNewWord}>添加第一个词</button>
            </div>
          ) : (
            words.map((word) => (
              <WordRow
                key={word.id}
                word={word}
                selected={selectedWord?.id === word.id}
                playing={playingWordId === word.id}
                onSelect={() => selectWord(word)}
                onPlay={() => void playListRecording(word)}
              />
            ))
          )}
        </div>
      </section>

      <section className="detail-panel" aria-label="词条详情">
        <div className="detail-title-row">
          <div>
            <span className="eyebrow">{isCreating ? "添加" : selectedWord ? "编辑" : "详情"}</span>
            <h2>{title}</h2>
          </div>
          {selectedWord ? (
            <button className="icon-button danger" type="button" aria-label="删除词条" onClick={() => void deleteSelectedWord()}>
              <Trash2 size={18} />
            </button>
          ) : null}
        </div>

        {!selectedWord && !isCreating ? (
          <div className="empty-detail">
            <BookOpen size={36} />
            <p>选择或添加词条</p>
          </div>
        ) : (
          <>
            <label className="field">
              <span>词条</span>
              <input
                value={draft.text}
                placeholder="例如：侬好"
                onChange={(event) => updateDraft({ text: event.target.value })}
              />
            </label>

            {duplicateWord ? (
              <div className="inline-warning">
                <AlertCircle size={16} />
                已有同名词条：{duplicateWord.text}
              </div>
            ) : null}

            <div className="field-grid">
              <label className="field">
                <span>标签</span>
                <select
                  value={draft.tagId ?? ""}
                  onChange={(event) => updateDraft({ tagId: event.target.value || null })}
                >
                  <option value="">未分类</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="field">
                <span>新建标签</span>
                <div className="inline-create">
                  <input
                    value={newTagName}
                    placeholder="如：第一课"
                    onChange={(event) => setNewTagName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void createTag();
                      }
                    }}
                  />
                  <button className="icon-button" type="button" aria-label="新建标签" onClick={() => void createTag()}>
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>

            <label className="field">
              <span>音调备注</span>
              <textarea
                value={draft.toneNote}
                placeholder="记录老师提示、调值、近似音或易错点"
                rows={5}
                onChange={(event) => updateDraft({ toneNote: event.target.value })}
              />
            </label>

            <div className="audio-surface">
              <div className="audio-heading">
                <div>
                  <span>发音录音</span>
                  <strong>
                    {pendingRecording
                      ? `新录音 ${formatDuration(pendingRecording.durationMs)}`
                      : selectedWord?.hasRecording
                        ? formatDuration(selectedWord.audioDurationMs)
                        : "尚未录音"}
                  </strong>
                </div>
                {pendingRecording ? <span className="pending-pill">待保存</span> : null}
              </div>

              {playbackUrl ? (
                <audio className="audio-player" controls src={playbackUrl} />
              ) : (
                <div className="audio-placeholder">保存一段录音后可在这里试听</div>
              )}

              <AudioRecorder
                hasExistingRecording={Boolean(selectedWord?.hasRecording || pendingRecording)}
                hasPendingRecording={Boolean(pendingRecording)}
                onDiscard={clearPendingRecording}
                onPreview={handlePendingRecording}
              />
            </div>

            <footer className="detail-actions">
              <div className="status-area" role="status">
                {error ? <span className="status error">{error}</span> : null}
                {message && !error ? <span className="status ok"><Check size={15} />{message}</span> : null}
              </div>
              <button className="primary-button save-button" type="button" disabled={!canSave} onClick={() => void saveDraft()}>
                <Save size={17} />
                {isSaving ? "保存中" : "保存"}
              </button>
            </footer>
          </>
        )}
      </section>
    </main>
  );
}

type FilterButtonProps = {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
};

type CloudPanelProps = {
  status: CloudSyncStatus | null;
  email: string;
  password: string;
  busy: boolean;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onSignIn: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onRefresh: () => void;
};

function CloudPanel({
  status,
  email,
  password,
  busy,
  onEmailChange,
  onPasswordChange,
  onSignIn,
  onSignUp,
  onSignOut,
  onEnable,
  onDisable,
  onRefresh
}: CloudPanelProps) {
  const signedIn = Boolean(status?.user);
  const canSubmitAuth = email.trim().length > 0 && password.length >= 6 && !busy;
  const statusLabel = status?.isEnabled
    ? status.pendingRecordingUploads > 0
      ? `云端模式 · ${status.pendingRecordingUploads} 个录音待上传`
      : "云端模式 · 已同步"
    : signedIn
      ? status?.isEntitled
        ? "已登录 · 可开启云同步"
        : "已登录 · 未开通订阅"
      : "本地模式";

  return (
    <section className="cloud-panel" aria-label="云同步">
      <div className="cloud-heading">
        <Cloud size={15} />
        <span>{statusLabel}</span>
      </div>

      {!signedIn ? (
        <div className="cloud-auth">
          <input
            aria-label="云同步邮箱"
            type="email"
            value={email}
            placeholder="邮箱"
            onChange={(event) => onEmailChange(event.target.value)}
          />
          <input
            aria-label="云同步密码"
            type="password"
            value={password}
            placeholder="密码"
            onChange={(event) => onPasswordChange(event.target.value)}
          />
          <div className="cloud-actions">
            <button type="button" disabled={!canSubmitAuth} onClick={onSignIn}>
              <LogIn size={14} />
              登录
            </button>
            <button type="button" disabled={!canSubmitAuth} onClick={onSignUp}>注册</button>
          </div>
        </div>
      ) : (
        <div className="cloud-account">
          <span title={status?.user?.email ?? undefined}>{status?.user?.email ?? "已登录"}</span>
          <div className="cloud-actions">
            {status?.isEnabled ? (
              <button type="button" disabled={busy} onClick={onDisable}>停用</button>
            ) : (
              <button type="button" disabled={busy || !status?.isEntitled} onClick={onEnable}>开启</button>
            )}
            <button type="button" disabled={busy} aria-label="刷新云同步" onClick={onRefresh}>
              <RefreshCw size={14} />
            </button>
            <button type="button" disabled={busy} aria-label="退出云端账号" onClick={onSignOut}>
              <LogOut size={14} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function FilterButton({ active, icon, label, count, onClick }: FilterButtonProps) {
  return (
    <button className={`filter-button ${active ? "is-active" : ""}`} type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
      <span className="tag-count">{count}</span>
    </button>
  );
}

type WordRowProps = {
  word: WordRecord;
  selected: boolean;
  playing: boolean;
  onSelect: () => void;
  onPlay: () => void;
};

function WordRow({ word, selected, playing, onSelect, onPlay }: WordRowProps) {
  return (
    <div
      className={`word-row ${selected ? "is-selected" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <button
        className={`play-button ${playing ? "is-playing" : ""}`}
        type="button"
        disabled={!word.hasRecording}
        aria-label={`播放 ${word.text}`}
        onClick={(event) => {
          event.stopPropagation();
          onPlay();
        }}
      >
        <Play size={15} fill="currentColor" />
      </button>
      <div className="word-row-main">
        <div className="word-row-title">
          <strong>{word.text}</strong>
          <span className="duration">{word.hasRecording ? formatDuration(word.audioDurationMs) : "未录音"}</span>
        </div>
        <p>{word.toneNote || "无备注"}</p>
      </div>
      <span className="mini-tag" style={{ color: word.tagColor ?? "#64748b" }}>
        {word.tagName ?? "未分类"}
      </span>
    </div>
  );
}

type AudioRecorderProps = {
  hasExistingRecording: boolean;
  hasPendingRecording: boolean;
  onPreview: (blob: Blob, durationMs: number) => void;
  onDiscard: () => void;
};

function AudioRecorder({ hasExistingRecording, hasPendingRecording, onPreview, onDiscard }: AudioRecorderProps) {
  const [status, setStatus] = useState<"idle" | "recording" | "processing">("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const animationRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);

  const stopMeter = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setLevel(0);
  }, []);

  const cleanupMedia = useCallback(() => {
    stopMeter();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
  }, [stopMeter]);

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      cleanupMedia();
    };
  }, [cleanupMedia]);

  async function startRecording() {
    setRecordingError(null);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError("当前环境不支持录音");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = bestRecordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      const samples = new Uint8Array(analyser.fftSize);

      analyser.fftSize = 1024;
      source.connect(analyser);
      streamRef.current = stream;
      contextRef.current = audioContext;
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = performance.now();

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const durationMs = performance.now() - startedAtRef.current;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        cleanupMedia();
        setElapsedMs(durationMs);
        setStatus("idle");
        if (blob.size > 0) {
          onPreview(blob, durationMs);
        } else {
          setRecordingError("录音为空，请重试");
        }
      });

      function tick() {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / samples.length);
        setLevel(Math.min(1, rms * 3.2));
        setElapsedMs(performance.now() - startedAtRef.current);
        animationRef.current = requestAnimationFrame(tick);
      }

      recorder.start();
      setStatus("recording");
      tick();
    } catch (caught) {
      cleanupMedia();
      setStatus("idle");
      setRecordingError(errorMessage(caught));
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      setStatus("processing");
      recorderRef.current.stop();
    }
  }

  const activeBars = Math.max(1, Math.round(level * 22));

  return (
    <div className="recorder">
      <div className="recorder-controls">
        {status === "recording" || status === "processing" ? (
          <button className="record-button is-recording" type="button" disabled={status === "processing"} onClick={stopRecording}>
            <Square size={16} fill="currentColor" />
            {status === "processing" ? "处理中" : "停止"}
          </button>
        ) : (
          <button className="record-button" type="button" onClick={() => void startRecording()}>
            <Mic size={17} />
            {hasExistingRecording ? "重新录音" : "录音"}
          </button>
        )}

        {hasPendingRecording && status !== "recording" ? (
          <button className="secondary-button" type="button" onClick={onDiscard}>
            <RotateCcw size={16} />
            丢弃
          </button>
        ) : null}

        <span className="timer">{formatDuration(elapsedMs)}</span>
      </div>

      <div className={`level-meter ${status === "recording" ? "is-live" : ""}`} aria-label="输入音量">
        {Array.from({ length: 22 }, (_, index) => (
          <span
            key={index}
            className={status === "recording" && index < activeBars ? "is-active" : ""}
          />
        ))}
      </div>

      {recordingError ? <div className="inline-warning"><AlertCircle size={16} />{recordingError}</div> : null}
    </div>
  );
}

function bestRecordingMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function errorMessage(caught: unknown): string {
  if (caught instanceof DOMException && caught.name === "NotAllowedError") {
    return "麦克风权限被拒绝";
  }
  if (caught instanceof Error) {
    return caught.message;
  }
  return "操作失败";
}

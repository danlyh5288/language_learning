import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Select from "@radix-ui/react-select";
import {
  Activity,
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  Cloud,
  Languages,
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
  UserRound,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import appLogo from "../assets/app-logo.svg";
import { api, isElectronRuntime } from "./api";
import {
  type I18nMessages,
  type Locale,
  messages,
  readStoredLocale,
  writeStoredLocale
} from "./i18n";
import {
  type AuthState,
  type CloudUser,
  type TagRecord,
  type CloudSyncStatus,
  type HealthStatus,
  type MonitorSnapshot,
  UNTAGGED_FILTER_ID,
  type WordInput,
  type WordRecord
} from "../shared/types";
import { filterWords } from "../shared/vocabulary";

type PendingRecording = {
  blob: Blob;
  durationMs: number;
  url: string;
};

type AuthMode = "signIn" | "signUp";
type LoadCloudStatusOptions = {
  authState?: AuthState;
  showError?: boolean;
  assumeCloudEnabled?: boolean;
};

const emptyDraft: WordInput = {
  text: "",
  tagId: null,
  toneNote: ""
};

const UNTAGGED_SELECT_VALUE = "__untagged__";

export default function App() {
  const [locale, setLocale] = useState<Locale>(readStoredLocale);
  const i18n = messages[locale];
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
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [isCloudBusy, setIsCloudBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [isMonitorOpen, setIsMonitorOpen] = useState(false);
  const [monitorSnapshot, setMonitorSnapshot] = useState<MonitorSnapshot | null>(null);
  const [isMonitorBusy, setIsMonitorBusy] = useState(false);
  const [monitorMessage, setMonitorMessage] = useState<string | null>(null);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listAudioRef = useRef<HTMLAudioElement | null>(null);

  const changeLocale = useCallback((nextLocale: Locale) => {
    setLocale(nextLocale);
    writeStoredLocale(nextLocale);
  }, []);

  const loadCloudStatus = useCallback(async ({ authState, showError = false, assumeCloudEnabled = false }: LoadCloudStatusOptions = {}) => {
    if (!api.cloudSync) {
      return;
    }
    try {
      const nextStatus = await api.cloudSync.getStatus();
      if (!nextStatus.user && authState?.user) {
        setCloudStatus(cloudStatusFromAuthState(authState, nextStatus, assumeCloudEnabled));
      } else {
        setCloudStatus(nextStatus);
      }
      setCloudError(null);
    } catch (caught) {
      if (authState) {
        setCloudStatus((current) => cloudStatusFromAuthState(authState, current, assumeCloudEnabled));
      }
      if (showError) {
        setCloudError(cloudErrorMessage(caught, i18n));
      }
    }
  }, [i18n]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { words: nextAllWords, tags: nextTags } = await api.vocabulary.load();
      setTags(nextTags);
      setAllWords(nextAllWords);
      setError(null);
      void loadCloudStatus();
    } catch (caught) {
      setError(errorMessage(caught, i18n));
    } finally {
      setIsLoading(false);
    }
  }, [i18n, loadCloudStatus]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    document.title = i18n.app.name;
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  useEffect(() => {
    if (!cloudStatus?.isEnabled || !api.cloudSync?.subscribe) {
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    void api.cloudSync.subscribe(() => {
      void loadData();
    }).then((nextUnsubscribe) => {
      if (cancelled) {
        nextUnsubscribe();
        return;
      }
      unsubscribe = nextUnsubscribe;
    }).catch((caught) => {
      setCloudError(cloudErrorMessage(caught, i18n));
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [cloudStatus?.isEnabled, cloudStatus?.user?.uid, i18n, loadData]);

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

    void loadPlaybackUrl().catch((caught) => setError(errorMessage(caught, i18n)));
    return () => {
      cancelled = true;
    };
  }, [i18n, pendingRecording, selectedWord?.hasRecording, selectedWord?.id, selectedWord?.updatedAt]);

  useEffect(() => {
    return () => {
      if (pendingRecording) {
        URL.revokeObjectURL(pendingRecording.url);
      }
      listAudioRef.current?.pause();
    };
  }, [pendingRecording]);

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

    return (
      allWords.find((word) => word.text === normalized && word.id !== selectedWord?.id) ??
      null
    );
  }, [allWords, draft.text, isSaving, selectedWord?.id]);

  const title = isCreating ? i18n.detail.newWordTitle : selectedWord?.text ?? i18n.detail.selectWordTitle;
  const canSave = draft.text.trim().length > 0 && !isSaving;

  const openAuthModal = useCallback((mode: AuthMode) => {
    setAuthMode(mode);
    setCloudError(null);
    setCloudMessage(null);
  }, []);

  const closeAuthModal = useCallback(() => {
    if (isCloudBusy) {
      return;
    }
    setAuthMode(null);
    setAuthPassword("");
    setCloudError(null);
  }, [isCloudBusy]);

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
      setError(errorMessage(caught, i18n));
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
      setMessage(i18n.status.saved);
      await loadData();
    } catch (caught) {
      setError(errorMessage(caught, i18n));
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSelectedWord() {
    if (!selectedWord) {
      return;
    }

    const confirmed = window.confirm(i18n.detail.deleteConfirm(selectedWord.text));
    if (!confirmed) {
      return;
    }

    try {
      await api.words.delete(selectedWord.id);
      clearPendingRecording();
      setSelectedWord(null);
      setDraft(emptyDraft);
      setMessage(i18n.status.deleted);
      await loadData();
    } catch (caught) {
      setError(errorMessage(caught, i18n));
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
      setError(errorMessage(caught, i18n));
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
    setMessage(i18n.status.newRecordingPending);
  }

  async function signIn() {
    if (!api.auth || !authEmail.trim() || authPassword.length < 6) {
      return;
    }
    let authSucceeded = false;
    setIsCloudBusy(true);
    setCloudError(null);
    setCloudMessage(null);
    try {
      const authState = await api.auth.signIn({ email: authEmail, password: authPassword });
      authSucceeded = true;
      setCloudStatus((current) => cloudStatusFromAuthState(authState, current));
      setAuthPassword("");
      setAuthMode(null);
      setSelectedWord(null);
      setIsCreating(false);
      setDraft(emptyDraft);
      setCloudMessage(i18n.cloudMessages.signedInEnablingCloud);
      setIsCloudBusy(false);
      void activateCloudSyncAfterAuth(authState, i18n.cloudMessages.signedInCloudEnabled);
    } catch (caught) {
      setCloudError(cloudErrorMessage(caught, i18n));
    } finally {
      if (!authSucceeded) {
        setIsCloudBusy(false);
      }
    }
  }

  async function signUp() {
    if (!api.auth || !authEmail.trim() || authPassword.length < 6) {
      return;
    }
    let authSucceeded = false;
    setIsCloudBusy(true);
    setCloudError(null);
    setCloudMessage(null);
    try {
      const authState = await api.auth.signUp({ email: authEmail, password: authPassword });
      authSucceeded = true;
      setCloudStatus((current) => cloudStatusFromAuthState(authState, current));
      setAuthPassword("");
      setAuthMode(null);
      setSelectedWord(null);
      setIsCreating(false);
      setDraft(emptyDraft);
      setCloudMessage(i18n.cloudMessages.signedUpEnablingCloud);
      setIsCloudBusy(false);
      void activateCloudSyncAfterAuth(authState, i18n.cloudMessages.signedUpCloudEnabled);
    } catch (caught) {
      setCloudError(cloudErrorMessage(caught, i18n));
    } finally {
      if (!authSucceeded) {
        setIsCloudBusy(false);
      }
    }
  }

  async function activateCloudSyncAfterAuth(authState: AuthState, successMessage: string) {
    if (!api.cloudSync || !authState.user) {
      await loadCloudStatus({ authState });
      await loadData();
      return;
    }

    setIsCloudBusy(true);
    setCloudError(null);
    try {
      await api.cloudSync.enable();
      setCloudStatus((current) => cloudStatusFromAuthState(authState, current, true));
      setCloudMessage(successMessage);
      await loadCloudStatus({ authState, assumeCloudEnabled: true });
      await loadData();
    } catch (caught) {
      const activationError = cloudActivationErrorMessage(caught, i18n);
      setCloudMessage(i18n.cloudMessages.signedInLocalMode);
      await loadCloudStatus({ authState });
      await loadData();
      setCloudError(activationError);
    } finally {
      setIsCloudBusy(false);
    }
  }

  async function sendVerificationEmail() {
    if (!api.auth) {
      return;
    }
    setIsCloudBusy(true);
    setCloudError(null);
    setCloudMessage(null);
    try {
      await api.auth.sendVerificationEmail();
      setCloudMessage(i18n.cloudMessages.verificationEmailSent);
      await loadCloudStatus({ showError: true });
    } catch (caught) {
      setCloudError(cloudErrorMessage(caught, i18n));
    } finally {
      setIsCloudBusy(false);
    }
  }

  async function signOut() {
    if (!api.auth) {
      return;
    }
    setIsCloudBusy(true);
    setCloudError(null);
    setCloudMessage(null);
    try {
      await api.auth.signOut();
      setSelectedWord(null);
      setIsCreating(false);
      setDraft(emptyDraft);
      setCloudMessage(i18n.cloudMessages.signedOut);
      await loadData();
    } catch (caught) {
      setCloudError(cloudErrorMessage(caught, i18n));
    } finally {
      setIsCloudBusy(false);
    }
  }

  async function enableCloudSync() {
    if (!api.cloudSync) {
      return;
    }
    setIsCloudBusy(true);
    setCloudError(null);
    setCloudMessage(null);
    try {
      await api.cloudSync.enable();
      setSelectedWord(null);
      setIsCreating(false);
      setDraft(emptyDraft);
      setCloudMessage(i18n.cloudMessages.cloudEnabled);
      await loadData();
    } catch (caught) {
      setCloudError(cloudErrorMessage(caught, i18n));
    } finally {
      setIsCloudBusy(false);
    }
  }

  async function disableCloudSync() {
    if (!api.cloudSync) {
      return;
    }
    setIsCloudBusy(true);
    setCloudError(null);
    setCloudMessage(null);
    try {
      await api.cloudSync.disable();
      setSelectedWord(null);
      setIsCreating(false);
      setDraft(emptyDraft);
      setCloudMessage(i18n.cloudMessages.switchedLocal);
      await loadData();
    } catch (caught) {
      setCloudError(cloudErrorMessage(caught, i18n));
    } finally {
      setIsCloudBusy(false);
    }
  }

  async function refreshCloudSync() {
    if (!api.cloudSync) {
      return;
    }
    setIsCloudBusy(true);
    setCloudError(null);
    setCloudMessage(null);
    try {
      await api.cloudSync.refresh();
      await loadData();
      setCloudMessage(i18n.cloudMessages.cloudRefreshed);
    } catch (caught) {
      setCloudError(cloudErrorMessage(caught, i18n));
    } finally {
      setIsCloudBusy(false);
    }
  }

  async function refreshMonitor() {
    if (!api.monitor) {
      setMonitorError(i18n.cloudMessages.diagnosticsUnavailable);
      return null;
    }
    setIsMonitorBusy(true);
    setMonitorError(null);
    setMonitorMessage(null);
    try {
      const snapshot = await api.monitor.getSnapshot();
      setMonitorSnapshot(snapshot);
      setMonitorMessage(i18n.cloudMessages.diagnosticsRefreshed);
      return snapshot;
    } catch (caught) {
      setMonitorError(errorMessage(caught, i18n));
      return null;
    } finally {
      setIsMonitorBusy(false);
    }
  }

  async function submitMonitorSnapshot() {
    if (!api.monitor) {
      setMonitorError(i18n.cloudMessages.diagnosticsSubmitUnavailable);
      return;
    }
    setIsMonitorBusy(true);
    setMonitorError(null);
    setMonitorMessage(null);
    try {
      const snapshot = monitorSnapshot ?? await api.monitor.getSnapshot();
      setMonitorSnapshot(snapshot);
      const result = await api.monitor.submitSnapshot(snapshot);
      setMonitorMessage(result.accepted ? i18n.cloudMessages.diagnosticsSubmitted : i18n.cloudMessages.diagnosticsSkipped);
    } catch (caught) {
      setMonitorError(errorMessage(caught, i18n));
    } finally {
      setIsMonitorBusy(false);
    }
  }

  function openMonitor() {
    setIsMonitorOpen(true);
    setMonitorError(null);
    setMonitorMessage(null);
    if (!monitorSnapshot) {
      void refreshMonitor();
    }
  }

  return (
    <>
      <main className="app-shell">
        <aside className="sidebar" aria-label={i18n.sidebar.tags}>
          <div className="brand">
            <div className="brand-mark">
              <img src={appLogo} alt="" aria-hidden="true" />
            </div>
            <div>
              <h1>{i18n.app.name}</h1>
              <p>{cloudStatus?.isEnabled ? i18n.app.cloudMode : isElectronRuntime ? i18n.app.localMode : i18n.app.browserPreview}</p>
            </div>
          </div>

          <nav className="tag-nav">
            <FilterButton
              active={activeTagId === null}
              icon={<ListMusic size={16} />}
              label={i18n.sidebar.all}
              count={allWords.length}
              onClick={() => setActiveTagId(null)}
            />
            <FilterButton
              active={activeTagId === UNTAGGED_FILTER_ID}
              icon={<Tag size={16} />}
              label={i18n.sidebar.untagged}
              count={untaggedCount}
              onClick={() => setActiveTagId(UNTAGGED_FILTER_ID)}
            />
          </nav>

          <div className="tag-section">
            <div className="section-label">{i18n.sidebar.tags}</div>
            {tags.length === 0 ? (
              <div className="muted-row">{i18n.sidebar.noTags}</div>
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

          <AccountMenu
            i18n={i18n}
            locale={locale}
            status={cloudStatus}
            busy={isCloudBusy}
            message={cloudMessage}
            error={authMode ? null : cloudError}
            onLocaleChange={changeLocale}
            onOpenAuth={openAuthModal}
            onSendVerificationEmail={() => void sendVerificationEmail()}
            onSignOut={() => void signOut()}
            onEnable={() => void enableCloudSync()}
            onDisable={() => void disableCloudSync()}
            onRefresh={() => void refreshCloudSync()}
            onOpenMonitor={openMonitor}
          />
        </aside>

      <section className="word-column" aria-label={i18n.list.ariaLabel}>
        <header className="list-header">
          <div className="search-wrap">
            <Search size={17} />
            <input
              aria-label={i18n.list.searchLabel}
              placeholder={i18n.list.searchPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button className="icon-button compact" type="button" aria-label={i18n.list.clearSearch} onClick={() => setQuery("")}>
                <X size={15} />
              </button>
            ) : null}
          </div>
          <button className="primary-button" type="button" onClick={startNewWord}>
            <Plus size={17} />
            {i18n.list.addWord}
          </button>
        </header>

        <div className="list-meta">
          <span>{isLoading ? i18n.list.loading : i18n.list.wordCount(words.length)}</span>
          {activeTagId || query ? <button type="button" onClick={() => { setActiveTagId(null); setQuery(""); }}>{i18n.list.clearFilters}</button> : null}
        </div>

        <div className="word-list">
          {words.length === 0 ? (
            <div className="empty-list">
              <p>{i18n.list.noMatches}</p>
              <button type="button" onClick={startNewWord}>{i18n.list.addFirstWord}</button>
            </div>
          ) : (
            words.map((word) => (
              <WordRow
                i18n={i18n}
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

      <section className="detail-panel" aria-label={i18n.detail.ariaLabel}>
        <div className="detail-title-row">
          <div>
            <span className="eyebrow">{isCreating ? i18n.detail.add : selectedWord ? i18n.detail.edit : i18n.detail.details}</span>
            <h2>{title}</h2>
          </div>
          {selectedWord ? (
            <button className="icon-button danger" type="button" aria-label={i18n.detail.deleteWord} onClick={() => void deleteSelectedWord()}>
              <Trash2 size={18} />
            </button>
          ) : null}
        </div>

        {!selectedWord && !isCreating ? (
          <div className="empty-detail">
            <BookOpen size={36} />
            <p>{i18n.detail.empty}</p>
          </div>
        ) : (
          <>
            <label className="field">
              <span>{i18n.detail.wordLabel}</span>
              <input
                value={draft.text}
                placeholder={i18n.detail.wordPlaceholder}
                onChange={(event) => updateDraft({ text: event.target.value })}
              />
            </label>

            {duplicateWord ? (
              <div className="inline-warning">
                <AlertCircle size={16} />
                {i18n.detail.duplicateWord(duplicateWord.text)}
              </div>
            ) : null}

            <div className="field-grid">
              <div className="field">
                <span>{i18n.detail.tagLabel}</span>
                <TagSelect
                  i18n={i18n}
                  value={draft.tagId}
                  tags={tags}
                  onChange={(tagId) => updateDraft({ tagId })}
                />
              </div>

              <div className="field">
                <span>{i18n.detail.newTagLabel}</span>
                <div className="inline-create">
                  <input
                    value={newTagName}
                    placeholder={i18n.detail.newTagPlaceholder}
                    onChange={(event) => setNewTagName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void createTag();
                      }
                    }}
                  />
                  <button className="icon-button" type="button" aria-label={i18n.detail.createTag} onClick={() => void createTag()}>
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>

            <label className="field">
              <span>{i18n.detail.toneNoteLabel}</span>
              <textarea
                value={draft.toneNote}
                placeholder={i18n.detail.toneNotePlaceholder}
                rows={5}
                onChange={(event) => updateDraft({ toneNote: event.target.value })}
              />
            </label>

            <div className="audio-surface">
              <div className="audio-heading">
                <div>
                  <span>{i18n.detail.pronunciationRecording}</span>
                  <strong>
                    {pendingRecording
                      ? i18n.detail.newRecording(formatDuration(pendingRecording.durationMs))
                      : selectedWord?.hasRecording
                        ? formatDuration(selectedWord.audioDurationMs)
                        : i18n.detail.noRecording}
                  </strong>
                </div>
                {pendingRecording ? <span className="pending-pill">{i18n.detail.pendingSave}</span> : null}
              </div>

              {playbackUrl ? (
                <audio className="audio-player" controls src={playbackUrl} />
              ) : (
                <div className="audio-placeholder">{i18n.detail.audioPlaceholder}</div>
              )}

              <AudioRecorder
                i18n={i18n}
                hasExistingRecording={Boolean(selectedWord?.hasRecording || pendingRecording)}
                hasPendingRecording={Boolean(pendingRecording)}
                idleDurationMs={pendingRecording?.durationMs ?? selectedWord?.audioDurationMs ?? null}
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
                {isSaving ? i18n.detail.saving : i18n.detail.save}
              </button>
            </footer>
          </>
        )}
      </section>
    </main>
    {authMode ? (
      <AuthModal
        i18n={i18n}
        mode={authMode}
        email={authEmail}
        password={authPassword}
        busy={isCloudBusy}
        error={cloudError}
        onEmailChange={setAuthEmail}
        onPasswordChange={setAuthPassword}
        onModeChange={openAuthModal}
        onClose={closeAuthModal}
        onSubmit={authMode === "signIn" ? () => void signIn() : () => void signUp()}
      />
    ) : null}
    {isMonitorOpen ? (
      <MonitorModal
        i18n={i18n}
        locale={locale}
        snapshot={monitorSnapshot}
        busy={isMonitorBusy}
        message={monitorMessage}
        error={monitorError}
        onClose={() => setIsMonitorOpen(false)}
        onRefresh={() => void refreshMonitor()}
        onSubmit={() => void submitMonitorSnapshot()}
      />
    ) : null}
    </>
  );
}

type FilterButtonProps = {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
};

type AccountMenuProps = {
  i18n: I18nMessages;
  locale: Locale;
  status: CloudSyncStatus | null;
  busy: boolean;
  message: string | null;
  error: string | null;
  onLocaleChange: (locale: Locale) => void;
  onOpenAuth: (mode: AuthMode) => void;
  onSendVerificationEmail: () => void;
  onSignOut: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onRefresh: () => void;
  onOpenMonitor: () => void;
};

function AccountMenu({
  i18n,
  locale,
  status,
  busy,
  message,
  error,
  onLocaleChange,
  onOpenAuth,
  onSendVerificationEmail,
  onSignOut,
  onEnable,
  onDisable,
  onRefresh,
  onOpenMonitor
}: AccountMenuProps) {
  const signedIn = Boolean(status?.user);
  const emailVerified = status?.user?.emailVerified ?? false;
  const canEnableCloud = !busy && signedIn;
  const accountLabel = signedIn
    ? accountDisplayName(status?.user ?? null, i18n)
    : i18n.account.signedOutTrigger;
  const statusLabel = status?.isEnabled
    ? status.pendingRecordingUploads > 0
      ? i18n.account.cloudModePendingUploads(status.pendingRecordingUploads)
      : i18n.account.cloudModeSynced
    : signedIn
      ? i18n.account.signedInCloudDisabled
      : i18n.account.localMode;

  return (
    <section className="account-menu-dock" aria-label={i18n.account.ariaLabel}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="account-menu-trigger" type="button">
            <span className="account-avatar" aria-hidden="true">
              <UserRound size={16} />
            </span>
            <span className="account-trigger-copy">
              <strong>{accountLabel}</strong>
              <span>{statusLabel}</span>
            </span>
            <ChevronDown className="account-trigger-chevron" size={16} aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="account-menu-content"
            side="top"
            align="start"
            sideOffset={8}
            collisionPadding={16}
          >
            <div className="account-menu-header">
              <span className="account-menu-avatar" aria-hidden="true">
                <UserRound size={17} />
              </span>
              <div>
                <strong>{accountLabel}</strong>
                <span title={status?.user?.email ?? undefined}>
                  {signedIn ? status?.user?.email ?? i18n.account.signedIn : statusLabel}
                </span>
              </div>
            </div>
            {signedIn && !emailVerified ? (
              <div className="account-menu-badge">{i18n.account.emailNotVerified}</div>
            ) : null}

            {!signedIn ? (
              <>
                <DropdownMenu.Separator className="account-menu-separator" />
                <DropdownMenu.Item className="account-menu-item" disabled={busy} onSelect={() => onOpenAuth("signIn")}>
                  <LogIn size={15} />
                  <span>{i18n.account.signIn}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item className="account-menu-item" disabled={busy} onSelect={() => onOpenAuth("signUp")}>
                  <Plus size={15} />
                  <span>{i18n.account.signUp}</span>
                </DropdownMenu.Item>
              </>
            ) : null}

            <DropdownMenu.Separator className="account-menu-separator" />
            <DropdownMenu.Label className="account-menu-label">
              <Languages size={14} />
              <span>{i18n.account.language}</span>
            </DropdownMenu.Label>
            <DropdownMenu.RadioGroup value={locale} onValueChange={(value) => onLocaleChange(value as Locale)}>
              <DropdownMenu.RadioItem className="account-menu-radio" value="en">
                <span className="account-menu-indicator-slot" aria-hidden="true">
                  <DropdownMenu.ItemIndicator className="account-menu-indicator">
                    <Check size={14} />
                  </DropdownMenu.ItemIndicator>
                </span>
                <span>{i18n.locale.english}</span>
              </DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem className="account-menu-radio" value="zh">
                <span className="account-menu-indicator-slot" aria-hidden="true">
                  <DropdownMenu.ItemIndicator className="account-menu-indicator">
                    <Check size={14} />
                  </DropdownMenu.ItemIndicator>
                </span>
                <span>{i18n.locale.chinese}</span>
              </DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>

            {signedIn ? (
              <>
                <DropdownMenu.Separator className="account-menu-separator" />
                <DropdownMenu.Label className="account-menu-label">
                  <Cloud size={14} />
                  <span>{i18n.account.cloudSync}</span>
                </DropdownMenu.Label>
                {status?.isEnabled ? (
                  <DropdownMenu.Item className="account-menu-item" disabled={busy} onSelect={() => onDisable()}>
                    <Cloud size={15} />
                    <span>{i18n.account.disable}</span>
                  </DropdownMenu.Item>
                ) : (
                  <DropdownMenu.Item className="account-menu-item" disabled={!canEnableCloud} onSelect={() => onEnable()}>
                    <Cloud size={15} />
                    <span>{i18n.account.enable}</span>
                  </DropdownMenu.Item>
                )}
                {!emailVerified ? (
                  <DropdownMenu.Item className="account-menu-item" disabled={busy} onSelect={() => onSendVerificationEmail()}>
                    <RefreshCw size={15} />
                    <span>{i18n.account.resendVerification}</span>
                  </DropdownMenu.Item>
                ) : null}
                <DropdownMenu.Item className="account-menu-item" disabled={busy} onSelect={() => onRefresh()}>
                  <RefreshCw size={15} />
                  <span>{i18n.account.refreshCloudSync}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Item className="account-menu-item" disabled={busy} onSelect={() => onOpenMonitor()}>
                  <Activity size={15} />
                  <span>{i18n.account.diagnostics}</span>
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="account-menu-separator" />
                <DropdownMenu.Item className="account-menu-item danger" disabled={busy} onSelect={() => onSignOut()}>
                  <LogOut size={15} />
                  <span>{i18n.account.signOutShort}</span>
                </DropdownMenu.Item>
              </>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {error ? <p className="cloud-feedback error" role="alert">{error}</p> : null}
      {message && !error ? <p className="cloud-feedback ok" role="status"><Check size={14} />{message}</p> : null}
    </section>
  );
}

type MonitorModalProps = {
  i18n: I18nMessages;
  locale: Locale;
  snapshot: MonitorSnapshot | null;
  busy: boolean;
  message: string | null;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onSubmit: () => void;
};

function MonitorModal({
  i18n,
  locale,
  snapshot,
  busy,
  message,
  error,
  onClose,
  onRefresh,
  onSubmit
}: MonitorModalProps) {
  const overallStatus = snapshot ? summarizeMonitorStatus(snapshot) : "unknown";

  return (
    <Dialog.Root open onOpenChange={(open) => {
      if (!open && !busy) {
        onClose();
      }
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content monitor-modal">
          <div className="auth-modal-header">
            <div>
              <span className="eyebrow">{i18n.monitor.eyebrow}</span>
              <Dialog.Title asChild>
                <h2>{i18n.monitor.title}</h2>
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button compact" type="button" aria-label={i18n.monitor.close} disabled={busy}>
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            {i18n.monitor.empty}
          </Dialog.Description>

          <div className="monitor-summary">
            <span className={`health-dot ${overallStatus}`} />
            <strong>{healthStatusLabel(overallStatus, i18n)}</strong>
            <span>{snapshot ? new Date(snapshot.checkedAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US") : i18n.monitor.notChecked}</span>
          </div>

          {snapshot ? (
            <div className="monitor-grid">
              <span>mode</span>
              <strong>{snapshot.mode}</strong>
              <span>platform</span>
              <strong>{snapshot.platform}</strong>
              <span>uid hash</span>
              <strong>{snapshot.uidHash ?? "none"}</strong>
              <span>recordings</span>
              <strong>{i18n.monitor.recordingsSummary(snapshot.pendingRecordingUploads, snapshot.failedRecordingUploads)}</strong>
            </div>
          ) : null}

          <div className="monitor-checks">
            {snapshot?.checks.map((check) => (
              <div className="monitor-check-row" key={check.service}>
                <span className={`health-dot ${check.status}`} />
                <div>
                  <strong>{serviceLabel(check.service)}</strong>
                  <p>{check.message}</p>
                  {check.errorCode ? <code>{check.errorCode}</code> : null}
                </div>
                <span>{check.latencyMs === null ? "n/a" : `${check.latencyMs} ms`}</span>
              </div>
            )) ?? (
              <div className="monitor-empty">{i18n.monitor.empty}</div>
            )}
          </div>

          {error ? <p className="cloud-feedback error" role="alert">{error}</p> : null}
          {message && !error ? <p className="cloud-feedback ok" role="status"><Check size={14} />{message}</p> : null}

          <div className="auth-modal-actions">
            <button className="secondary-button" type="button" disabled={busy} onClick={onRefresh}>
              <RefreshCw size={15} />
              {busy ? i18n.monitor.refreshing : i18n.monitor.refresh}
            </button>
            <button className="primary-button" type="button" disabled={busy || !snapshot} onClick={onSubmit}>
              <Cloud size={15} />
              {busy ? i18n.monitor.submitting : i18n.monitor.submit}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type AuthModalProps = {
  i18n: I18nMessages;
  mode: AuthMode;
  email: string;
  password: string;
  busy: boolean;
  error: string | null;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
  onSubmit: () => void;
};

function AuthModal({
  i18n,
  mode,
  email,
  password,
  busy,
  error,
  onEmailChange,
  onPasswordChange,
  onModeChange,
  onClose,
  onSubmit
}: AuthModalProps) {
  const isSignIn = mode === "signIn";
  const passwordTooShort = password.length > 0 && password.length < 6;
  const canSubmitAuth = email.trim().length > 0 && password.length >= 6 && !busy;
  const title = isSignIn ? i18n.auth.signInTitle : i18n.auth.signUpTitle;
  const authHelpText = passwordTooShort ? i18n.auth.passwordTooShort : i18n.auth.help;

  function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmitAuth) {
      onSubmit();
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => {
      if (!open && !busy) {
        onClose();
      }
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content auth-modal">
          <div className="auth-modal-header">
            <div>
              <span className="eyebrow">{i18n.auth.cloudSyncAccount}</span>
              <Dialog.Title asChild>
                <h2>{title}</h2>
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="icon-button compact" type="button" aria-label={i18n.auth.close} disabled={busy}>
                <X size={15} />
              </button>
            </Dialog.Close>
          </div>

          <form className="auth-modal-form" onSubmit={submitAuth}>
            <label className="field compact-field">
              <span>{i18n.auth.email}</span>
              <input
                aria-label={i18n.auth.emailAria}
                type="email"
                value={email}
                placeholder="learner@example.com"
                autoComplete="email"
                aria-describedby="auth-modal-help"
                onChange={(event) => onEmailChange(event.target.value)}
              />
            </label>
            <label className="field compact-field">
              <span>{i18n.auth.password}</span>
              <input
                aria-label={i18n.auth.passwordAria}
                type="password"
                value={password}
                placeholder={i18n.auth.passwordPlaceholder}
                autoComplete={isSignIn ? "current-password" : "new-password"}
                aria-describedby="auth-modal-help"
                onChange={(event) => onPasswordChange(event.target.value)}
              />
            </label>
            <Dialog.Description className="cloud-helper" id="auth-modal-help">
              {authHelpText}
            </Dialog.Description>
            {error ? <p className="cloud-feedback error" role="alert">{error}</p> : null}
            <div className="auth-modal-actions">
              <button className="secondary-button" type="button" disabled={busy} onClick={() => onModeChange(isSignIn ? "signUp" : "signIn")}>
                {isSignIn ? i18n.auth.switchToSignUp : i18n.auth.switchToSignIn}
              </button>
              <button className="primary-button" type="submit" disabled={!canSubmitAuth}>
                {isSignIn ? <LogIn size={16} /> : <Plus size={16} />}
                {busy ? i18n.auth.submitting : title}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type TagSelectProps = {
  i18n: I18nMessages;
  value: string | null;
  tags: TagRecord[];
  onChange: (tagId: string | null) => void;
};

function TagSelect({ i18n, value, tags, onChange }: TagSelectProps) {
  return (
    <Select.Root
      value={value ?? UNTAGGED_SELECT_VALUE}
      onValueChange={(nextValue) => onChange(nextValue === UNTAGGED_SELECT_VALUE ? null : nextValue)}
    >
      <Select.Trigger className="tag-select-trigger" aria-label={i18n.detail.tagLabel}>
        <Select.Value />
        <Select.Icon className="tag-select-chevron" asChild>
          <ChevronDown size={16} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="tag-select-content" position="popper" sideOffset={4}>
          <Select.Viewport className="tag-select-viewport">
            <Select.Item className="tag-select-item" value={UNTAGGED_SELECT_VALUE}>
              <Select.ItemText>{i18n.detail.untaggedOption}</Select.ItemText>
              <Select.ItemIndicator className="tag-select-indicator">
                <Check size={14} />
              </Select.ItemIndicator>
            </Select.Item>
            {tags.map((tag) => (
              <Select.Item className="tag-select-item" key={tag.id} value={tag.id}>
                <Select.ItemText>{tag.name}</Select.ItemText>
                <Select.ItemIndicator className="tag-select-indicator">
                  <Check size={14} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
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
  i18n: I18nMessages;
  word: WordRecord;
  selected: boolean;
  playing: boolean;
  onSelect: () => void;
  onPlay: () => void;
};

function WordRow({ i18n, word, selected, playing, onSelect, onPlay }: WordRowProps) {
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
        aria-label={i18n.wordRow.play(word.text)}
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
          <span className="duration">{word.hasRecording ? formatDuration(word.audioDurationMs) : i18n.wordRow.noRecording}</span>
        </div>
        <p>{word.toneNote || i18n.wordRow.noNote}</p>
      </div>
      <span className="mini-tag" style={{ color: word.tagColor ?? "#64748b" }}>
        {word.tagName ?? i18n.wordRow.untagged}
      </span>
    </div>
  );
}

type AudioRecorderProps = {
  i18n: I18nMessages;
  hasExistingRecording: boolean;
  hasPendingRecording: boolean;
  idleDurationMs: number | null;
  onPreview: (blob: Blob, durationMs: number) => void;
  onDiscard: () => void;
};

function AudioRecorder({ i18n, hasExistingRecording, hasPendingRecording, idleDurationMs, onPreview, onDiscard }: AudioRecorderProps) {
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
    setElapsedMs(0);

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError(i18n.recorder.unsupported);
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
          setRecordingError(i18n.recorder.empty);
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
      setRecordingError(errorMessage(caught, i18n));
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      setStatus("processing");
      recorderRef.current.stop();
    }
  }

  const activeBars = Math.max(1, Math.round(level * 22));
  const timerDurationMs = status === "idle" ? idleDurationMs : elapsedMs;

  return (
    <div className="recorder">
      <div className="recorder-controls">
        {status === "recording" || status === "processing" ? (
          <button className="record-button is-recording" type="button" disabled={status === "processing"} onClick={stopRecording}>
            <Square size={16} fill="currentColor" />
            {status === "processing" ? i18n.recorder.processing : i18n.recorder.stop}
          </button>
        ) : (
          <button className="record-button" type="button" onClick={() => void startRecording()}>
            <Mic size={17} />
            {hasExistingRecording ? i18n.recorder.reRecord : i18n.recorder.record}
          </button>
        )}

        {hasPendingRecording && status !== "recording" ? (
          <button className="secondary-button" type="button" onClick={onDiscard}>
            <RotateCcw size={16} />
            {i18n.recorder.discard}
          </button>
        ) : null}

        <span className="timer">{formatDuration(timerDurationMs)}</span>
      </div>

      <div className={`level-meter ${status === "recording" ? "is-live" : ""}`} aria-label={i18n.recorder.inputLevel}>
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

function accountDisplayName(user: CloudUser | null, i18n: I18nMessages): string {
  if (!user?.email) {
    return i18n.account.signedIn;
  }

  const [name] = user.email.split("@");
  return name || user.email;
}

function summarizeMonitorStatus(snapshot: MonitorSnapshot): HealthStatus {
  const statuses = snapshot.checks.map((check) => check.status);
  if (statuses.includes("down")) {
    return "down";
  }
  if (statuses.includes("degraded")) {
    return "degraded";
  }
  if (statuses.includes("unknown")) {
    return "unknown";
  }
  return "ok";
}

function healthStatusLabel(status: HealthStatus, i18n: I18nMessages): string {
  return i18n.monitor.healthStatus[status];
}

function serviceLabel(service: string): string {
  switch (service) {
    case "auth":
      return "Auth";
    case "firestore":
      return "Firestore";
    case "storage":
      return "Storage";
    case "functions":
      return "Functions";
    case "recordingQueue":
      return "Recording queue";
    default:
      return service;
  }
}

function cloudStatusFromAuthState(
  authState: AuthState,
  current: CloudSyncStatus | null,
  assumeCloudEnabled = false
): CloudSyncStatus {
  if (!authState.user) {
    return {
      mode: "local",
      user: null,
      isEntitled: false,
      isEnabled: false,
      isOnline: navigator.onLine,
      isSyncing: false,
      pendingRecordingUploads: 0,
      lastSyncError: null
    };
  }

  return cloudStatusForUser(authState.user, current, assumeCloudEnabled);
}

function cloudStatusForUser(user: CloudUser, current: CloudSyncStatus | null, assumeCloudEnabled = false): CloudSyncStatus {
  const sameUser = current?.user?.uid === user.uid;
  const isEnabled = sameUser ? current.isEnabled || assumeCloudEnabled : assumeCloudEnabled;
  return {
    mode: isEnabled ? "cloud" : "local",
    user,
    isEntitled: true,
    isEnabled,
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingRecordingUploads: sameUser ? current.pendingRecordingUploads : 0,
    lastSyncError: null
  };
}

function errorMessage(caught: unknown, i18n: I18nMessages): string {
  if (caught instanceof DOMException && caught.name === "NotAllowedError") {
    return i18n.recorder.microphonePermissionDenied;
  }
  if (isFirestoreOfflineError(caught)) {
    return i18n.errors.firestoreOffline;
  }
  if (caught instanceof Error) {
    return i18n.errors.messageOverrides[caught.message] ?? caught.message;
  }
  return i18n.errors.genericFailure;
}

function cloudErrorMessage(caught: unknown, i18n: I18nMessages): string {
  const code = errorCode(caught);
  switch (code) {
    case "auth/email-already-in-use":
      return i18n.errors.authEmailAlreadyInUse;
    case "auth/invalid-email":
      return i18n.errors.authInvalidEmail;
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return i18n.errors.authInvalidCredential;
    case "auth/weak-password":
      return i18n.errors.authWeakPassword;
    case "auth/too-many-requests":
      return i18n.errors.authTooManyRequests;
    case "auth/network-request-failed":
      return i18n.errors.authNetworkFailed;
    case "auth/requires-recent-login":
      return i18n.errors.authRequiresRecentLogin;
    default:
      return errorMessage(caught, i18n);
  }
}

function cloudActivationErrorMessage(caught: unknown, i18n: I18nMessages): string {
  const code = errorCode(caught);
  if (isFirestoreOfflineError(caught) || code === "not-found" || code === "failed-precondition") {
    return i18n.errors.cloudActivationUnavailable;
  }
  if (code === "permission-denied") {
    return i18n.errors.cloudActivationPermission;
  }
  return i18n.errors.cloudActivationGeneric(errorMessage(caught, i18n));
}

function errorCode(caught: unknown): string | null {
  if (typeof caught === "object" && caught !== null && "code" in caught) {
    const code = (caught as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function isFirestoreOfflineError(caught: unknown): boolean {
  if (typeof caught !== "object" || caught === null) {
    return false;
  }
  const code = "code" in caught ? (caught as { code?: unknown }).code : null;
  if (code === "unavailable") {
    return true;
  }
  const message = caught instanceof Error ? caught.message : String((caught as { message?: unknown }).message ?? "");
  return message.includes("client is offline");
}

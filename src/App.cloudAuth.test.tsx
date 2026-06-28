import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudSyncStatus, MonitorSnapshot, MonitorSubmitResult, VocabApi, WordRecord } from "../shared/types";

const mockApi = vi.hoisted(() => {
  const signedInUser = { uid: "user-1", email: "learner@example.com", emailVerified: false };
  const status: CloudSyncStatus = {
    mode: "local",
    user: null,
    isEntitled: false,
    isEnabled: false,
    isOnline: true,
    isSyncing: false,
    pendingRecordingUploads: 0,
    lastSyncError: null
  };

  return {
    signedInUser,
    status,
    cloudListener: null as null | (() => void),
    wordsList: vi.fn(async () => [] as WordRecord[]),
    wordsCreate: vi.fn(),
    wordsUpdate: vi.fn(),
    wordsDelete: vi.fn(),
    tagsList: vi.fn(async () => []),
    tagsCreate: vi.fn(),
    saveForWord: vi.fn(),
    getPlaybackUrl: vi.fn(async () => null),
    getAuthState: vi.fn(async () => ({ user: status.user })),
    signIn: vi.fn(async () => ({ user: signedInUser })),
    signUp: vi.fn(async () => ({ user: signedInUser })),
    sendVerificationEmail: vi.fn(async () => ({ user: null })),
    signOut: vi.fn(async () => ({ user: null })),
    getStatus: vi.fn(async () => status),
    enable: vi.fn(async () => status),
    disable: vi.fn(async () => status),
    refresh: vi.fn(async () => status),
    subscribe: vi.fn(),
    getMonitorSnapshot: vi.fn(async () => ({
      schemaVersion: 1,
      appVersion: "test",
      platform: "web",
      checkedAt: "2026-06-24T10:00:00.000Z",
      mode: "cloud",
      uidHash: "hash-1",
      isOnline: true,
      pendingRecordingUploads: 1,
      failedRecordingUploads: 0,
      checks: [
        {
          service: "auth",
          status: "ok",
          latencyMs: 4,
          checkedAt: "2026-06-24T10:00:00.000Z",
          message: "active Firebase auth session",
          errorCode: null
        },
        {
          service: "functions",
          status: "degraded",
          latencyMs: 120,
          checkedAt: "2026-06-24T10:00:00.000Z",
          message: "monitorHealth returned HTTP 503",
          errorCode: "http-503"
        }
      ]
    } satisfies MonitorSnapshot)),
    submitMonitorSnapshot: vi.fn(async () => ({ accepted: true }) as MonitorSubmitResult)
  };
});

vi.mock("./api", () => ({
  api: {
    words: {
      list: mockApi.wordsList,
      create: mockApi.wordsCreate,
      update: mockApi.wordsUpdate,
      delete: mockApi.wordsDelete
    },
    tags: {
      list: mockApi.tagsList,
      create: mockApi.tagsCreate
    },
    recordings: {
      saveForWord: mockApi.saveForWord,
      getPlaybackUrl: mockApi.getPlaybackUrl
    },
    auth: {
      getState: mockApi.getAuthState,
      signIn: mockApi.signIn,
      signUp: mockApi.signUp,
      sendVerificationEmail: mockApi.sendVerificationEmail,
      signOut: mockApi.signOut
    },
    cloudSync: {
      getStatus: mockApi.getStatus,
      enable: mockApi.enable,
      disable: mockApi.disable,
      refresh: mockApi.refresh,
      subscribe: mockApi.subscribe
    },
    monitor: {
      getSnapshot: mockApi.getMonitorSnapshot,
      submitSnapshot: mockApi.submitMonitorSnapshot
    }
  } satisfies VocabApi,
  isElectronRuntime: false
}));

import App from "./App";

describe("Cloud auth panel", () => {
  beforeEach(() => {
    Object.assign(mockApi.status, {
      mode: "local",
      user: null,
      isEntitled: false,
      isEnabled: false,
      isOnline: true,
      isSyncing: false,
      pendingRecordingUploads: 0,
      lastSyncError: null
    } satisfies CloudSyncStatus);
    mockApi.wordsList.mockClear();
    mockApi.wordsCreate.mockClear();
    mockApi.wordsUpdate.mockClear();
    mockApi.wordsDelete.mockClear();
    mockApi.tagsList.mockClear();
    mockApi.tagsCreate.mockClear();
    mockApi.saveForWord.mockClear();
    mockApi.getPlaybackUrl.mockClear();
    mockApi.getAuthState.mockClear();
    mockApi.signIn.mockReset();
    mockApi.signIn.mockImplementation(async () => {
      Object.assign(mockApi.status, {
        mode: "local",
        user: mockApi.signedInUser,
        isEntitled: true,
        isEnabled: false
      } satisfies Partial<CloudSyncStatus>);
      return { user: mockApi.signedInUser };
    });
    mockApi.signUp.mockReset();
    mockApi.signUp.mockImplementation(async () => {
      Object.assign(mockApi.status, {
        mode: "local",
        user: mockApi.signedInUser,
        isEntitled: true,
        isEnabled: false
      } satisfies Partial<CloudSyncStatus>);
      return { user: mockApi.signedInUser };
    });
    mockApi.sendVerificationEmail.mockClear();
    mockApi.signOut.mockClear();
    mockApi.getStatus.mockReset();
    mockApi.getStatus.mockResolvedValue(mockApi.status);
    mockApi.enable.mockReset();
    mockApi.enable.mockImplementation(async () => {
      Object.assign(mockApi.status, {
        mode: "cloud",
        user: mockApi.signedInUser,
        isEntitled: true,
        isEnabled: true
      } satisfies Partial<CloudSyncStatus>);
      return mockApi.status;
    });
    mockApi.disable.mockClear();
    mockApi.refresh.mockClear();
    mockApi.cloudListener = null;
    mockApi.subscribe.mockReset();
    mockApi.subscribe.mockImplementation(async (listener: () => void) => {
      mockApi.cloudListener = listener;
      return vi.fn(() => {
        mockApi.cloudListener = null;
      });
    });
    mockApi.getMonitorSnapshot.mockClear();
    mockApi.submitMonitorSnapshot.mockClear();
  });

  it("opens login modal and enables submission only for valid input", async () => {
    const user = userEvent.setup();
    render(<App />);

    const account = await screen.findByRole("region", { name: "Account" });

    expect(within(account).getByRole("button", { name: "Sign up" })).toBeEnabled();
    expect(within(account).getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(screen.queryByLabelText("Cloud sync email")).not.toBeInTheDocument();

    await user.click(within(account).getByRole("button", { name: "Sign in" }));

    const modal = await screen.findByRole("dialog", { name: "Sign in" });
    const submitButton = within(modal).getByRole("button", { name: "Sign in" });

    expect(within(modal).getByText("Enter an email and a password with at least 6 characters")).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    await user.type(within(modal).getByLabelText("Cloud sync email"), "learner@example.com");
    await user.type(within(modal).getByLabelText("Cloud sync password"), "12345");

    expect(within(modal).getByText("Password must be at least 6 characters")).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    await user.type(within(modal).getByLabelText("Cloud sync password"), "6");

    expect(submitButton).toBeEnabled();

    await user.click(submitButton);

    expect(mockApi.signIn).toHaveBeenCalledWith({
      email: "learner@example.com",
      password: "123456"
    });
    expect(await screen.findByRole("region", { name: "Account" })).toHaveTextContent("learner@example.com");
    expect(await screen.findByText("Signed in with cloud sync enabled")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("shows Firebase auth errors inside the auth modal", async () => {
    const user = userEvent.setup();
    mockApi.signUp.mockRejectedValueOnce({ code: "auth/email-already-in-use" });

    render(<App />);

    const account = await screen.findByRole("region", { name: "Account" });
    await user.click(within(account).getByRole("button", { name: "Sign up" }));

    const modal = await screen.findByRole("dialog", { name: "Sign up" });
    await user.type(within(modal).getByLabelText("Cloud sync email"), "learner@example.com");
    await user.type(within(modal).getByLabelText("Cloud sync password"), "123456");
    await user.click(within(modal).getByRole("button", { name: "Sign up" }));

    expect(await within(modal).findByRole("alert")).toHaveTextContent("This email is already registered. Sign in instead.");
  });

  it("keeps the user signed in when cloud activation fails after login", async () => {
    const user = userEvent.setup();
    mockApi.enable.mockRejectedValueOnce({ code: "unavailable" });

    render(<App />);

    const account = await screen.findByRole("region", { name: "Account" });
    await user.click(within(account).getByRole("button", { name: "Sign in" }));

    const modal = await screen.findByRole("dialog", { name: "Sign in" });
    await user.type(within(modal).getByLabelText("Cloud sync email"), "learner@example.com");
    await user.type(within(modal).getByLabelText("Cloud sync password"), "123456");
    await user.click(within(modal).getByRole("button", { name: "Sign in" }));

    expect(await within(account).findByText("learner@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Sign in" })).not.toBeInTheDocument();
    expect(mockApi.enable).toHaveBeenCalledTimes(1);
    expect(await within(account).findByRole("alert")).toHaveTextContent("Signed in, but cloud sync could not be enabled");
    expect(within(account).getByRole("button", { name: "Enable" })).toBeEnabled();
  });

  it("keeps passive cloud status failures out of the account dock after sign-in", async () => {
    const user = userEvent.setup();
    mockApi.getStatus
      .mockResolvedValueOnce(mockApi.status)
      .mockRejectedValueOnce({ code: "unavailable" });

    render(<App />);

    const account = await screen.findByRole("region", { name: "Account" });
    await user.click(within(account).getByRole("button", { name: "Sign in" }));

    const modal = await screen.findByRole("dialog", { name: "Sign in" });
    await user.type(within(modal).getByLabelText("Cloud sync email"), "learner@example.com");
    await user.type(within(modal).getByLabelText("Cloud sync password"), "123456");
    await user.click(within(modal).getByRole("button", { name: "Sign in" }));

    expect(await within(account).findByText("learner@example.com")).toBeInTheDocument();
    await waitFor(() => expect(mockApi.getStatus).toHaveBeenCalledTimes(3));
    expect(within(account).queryByRole("button", { name: "Sign up" })).not.toBeInTheDocument();
    expect(within(account).queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
    expect(within(account).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows Firebase connectivity errors for explicit account refresh", async () => {
    const user = userEvent.setup();
    Object.assign(mockApi.status, {
      user: { uid: "user-1", email: "learner@example.com", emailVerified: true },
      isEntitled: false
    } satisfies Partial<CloudSyncStatus>);
    mockApi.refresh.mockRejectedValueOnce({ code: "unavailable" });

    render(<App />);

    const account = await screen.findByRole("region", { name: "Account" });
    await user.click(within(account).getByRole("button", { name: "Refresh cloud sync" }));

    expect(await within(account).findByRole("alert")).toHaveTextContent("Cannot connect to Firebase. Check your network and try again.");
  });

  it("allows cloud sync for unverified users and can resend verification", async () => {
    const user = userEvent.setup();
    Object.assign(mockApi.status, {
      user: { uid: "user-1", email: "learner@example.com", emailVerified: false },
      mode: "cloud",
      isEntitled: true,
      isEnabled: true
    } satisfies Partial<CloudSyncStatus>);

    render(<App />);

    const account = await screen.findByRole("region", { name: "Account" });
    expect(await within(account).findByText("Cloud mode · synced")).toBeInTheDocument();
    expect(within(account).getByText("learner@example.com")).toBeInTheDocument();
    expect(within(account).queryByRole("button", { name: "Sign up" })).not.toBeInTheDocument();
    expect(within(account).queryByRole("button", { name: "Sign in" })).not.toBeInTheDocument();
    expect(within(account).getByRole("button", { name: "Disable" })).toBeEnabled();

    await user.click(within(account).getByRole("button", { name: "Resend verification email" }));

    expect(mockApi.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(await within(account).findByText("Verification email sent")).toBeInTheDocument();
  });

  it("reloads vocabulary when cloud snapshots change", async () => {
    Object.assign(mockApi.status, {
      user: { uid: "user-1", email: "learner@example.com", emailVerified: false },
      mode: "cloud",
      isEntitled: true,
      isEnabled: true
    } satisfies Partial<CloudSyncStatus>);
    mockApi.wordsList
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "word-remote", text: "远端", tagId: null, tagName: null, tagColor: null, toneNote: "", audioDurationMs: null, hasRecording: false, createdAt: "2026-06-24T10:00:00.000Z", updatedAt: "2026-06-24T10:00:00.000Z" }])
      .mockResolvedValueOnce([{ id: "word-remote", text: "远端", tagId: null, tagName: null, tagColor: null, toneNote: "", audioDurationMs: null, hasRecording: false, createdAt: "2026-06-24T10:00:00.000Z", updatedAt: "2026-06-24T10:00:00.000Z" }]);

    render(<App />);

    await waitFor(() => expect(mockApi.subscribe).toHaveBeenCalledTimes(1));
    mockApi.cloudListener?.();

    expect(await screen.findByText("远端")).toBeInTheDocument();
  });

  it("opens developer diagnostics and submits the current health snapshot", async () => {
    const user = userEvent.setup();
    Object.assign(mockApi.status, {
      user: { uid: "user-1", email: "learner@example.com", emailVerified: true },
      mode: "cloud",
      isEntitled: true,
      isEnabled: true
    } satisfies Partial<CloudSyncStatus>);

    render(<App />);

    const account = await screen.findByRole("region", { name: "Account" });
    await user.click(within(account).getByRole("button", { name: "Diagnostics" }));

    const dialog = await screen.findByRole("dialog", { name: "Service health" });
    expect(await within(dialog).findByText("degraded")).toBeInTheDocument();
    expect(within(dialog).getByText("Functions")).toBeInTheDocument();
    expect(within(dialog).getByText("http-503")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Submit" }));

    expect(mockApi.submitMonitorSnapshot).toHaveBeenCalledWith(await mockApi.getMonitorSnapshot.mock.results[0].value);
    expect(await within(dialog).findByText("Diagnostics submitted")).toBeInTheDocument();
  });

  it("treats missing OpenObserve config as a skipped diagnostics upload", async () => {
    const user = userEvent.setup();
    mockApi.submitMonitorSnapshot.mockResolvedValueOnce({ accepted: false, reason: "not_configured" });
    Object.assign(mockApi.status, {
      user: { uid: "user-1", email: "learner@example.com", emailVerified: true },
      mode: "cloud",
      isEntitled: true,
      isEnabled: true
    } satisfies Partial<CloudSyncStatus>);

    render(<App />);

    const account = await screen.findByRole("region", { name: "Account" });
    await user.click(within(account).getByRole("button", { name: "Diagnostics" }));

    const dialog = await screen.findByRole("dialog", { name: "Service health" });
    await user.click(await within(dialog).findByRole("button", { name: "Submit" }));

    expect(await within(dialog).findByText("OpenObserve is not configured; diagnostics were not submitted")).toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not show the just-created word as a duplicate while a cloud save is still pending", async () => {
    const user = userEvent.setup();
    const createdWord: WordRecord = {
      id: "word-created",
      text: "谢谢",
      tagId: null,
      tagName: null,
      tagColor: null,
      toneNote: "",
      audioDurationMs: null,
      hasRecording: false,
      createdAt: "2026-06-24T10:00:00.000Z",
      updatedAt: "2026-06-24T10:00:00.000Z"
    };
    Object.assign(mockApi.status, {
      user: { uid: "user-1", email: "learner@example.com", emailVerified: false },
      mode: "cloud",
      isEntitled: true,
      isEnabled: true
    } satisfies Partial<CloudSyncStatus>);
    mockApi.wordsList.mockResolvedValue([]);
    mockApi.wordsCreate.mockImplementation(async () => new Promise<WordRecord>(() => undefined));

    render(<App />);

    await waitFor(() => expect(mockApi.subscribe).toHaveBeenCalledTimes(1));
    await user.click(await screen.findByRole("button", { name: "Add word" }));
    await user.type(screen.getByPlaceholderText("e.g. hello"), "谢谢");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("button", { name: /Saving/ })).toBeDisabled();

    mockApi.wordsList.mockResolvedValue([createdWord]);
    await act(async () => {
      mockApi.cloudListener?.();
    });

    await waitFor(() => expect(mockApi.wordsList).toHaveBeenCalledTimes(4));
    expect(screen.queryByText("Duplicate word: 谢谢")).not.toBeInTheDocument();
  });
});

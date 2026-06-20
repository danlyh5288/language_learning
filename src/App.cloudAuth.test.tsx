import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CloudSyncStatus, VocabApi } from "../shared/types";

const mockApi = vi.hoisted(() => {
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
    status,
    wordsList: vi.fn(async () => []),
    wordsCreate: vi.fn(),
    wordsUpdate: vi.fn(),
    wordsDelete: vi.fn(),
    tagsList: vi.fn(async () => []),
    tagsCreate: vi.fn(),
    saveForWord: vi.fn(),
    getPlaybackUrl: vi.fn(async () => null),
    getAuthState: vi.fn(async () => ({ user: status.user })),
    signIn: vi.fn(async () => ({ user: null })),
    signUp: vi.fn(async () => ({ user: null })),
    sendVerificationEmail: vi.fn(async () => ({ user: null })),
    signOut: vi.fn(async () => ({ user: null })),
    getStatus: vi.fn(async () => status),
    enable: vi.fn(async () => status),
    disable: vi.fn(async () => status),
    refresh: vi.fn(async () => status)
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
      refresh: mockApi.refresh
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
    mockApi.signIn.mockClear();
    mockApi.signUp.mockReset();
    mockApi.signUp.mockResolvedValue({ user: null });
    mockApi.sendVerificationEmail.mockClear();
    mockApi.signOut.mockClear();
    mockApi.getStatus.mockClear();
    mockApi.enable.mockClear();
    mockApi.disable.mockClear();
    mockApi.refresh.mockClear();
  });

  it("explains auth requirements and enables registration only for valid input", async () => {
    const user = userEvent.setup();
    render(<App />);

    const panel = await screen.findByRole("region", { name: "云同步" });
    const registerButton = within(panel).getByRole("button", { name: "注册" });
    const signInButton = within(panel).getByRole("button", { name: "登录" });

    expect(within(panel).getByText("请输入邮箱和至少 6 位密码")).toBeInTheDocument();
    expect(registerButton).toBeDisabled();
    expect(signInButton).toBeDisabled();

    await user.type(within(panel).getByLabelText("云同步邮箱"), "learner@example.com");
    await user.type(within(panel).getByLabelText("云同步密码"), "12345");

    expect(within(panel).getByText("密码至少 6 位")).toBeInTheDocument();
    expect(registerButton).toBeDisabled();

    await user.type(within(panel).getByLabelText("云同步密码"), "6");

    expect(registerButton).toBeEnabled();
    expect(signInButton).toBeEnabled();
  });

  it("shows Firebase auth errors inside the cloud panel", async () => {
    const user = userEvent.setup();
    mockApi.signUp.mockRejectedValueOnce({ code: "auth/email-already-in-use" });

    render(<App />);

    const panel = await screen.findByRole("region", { name: "云同步" });
    await user.type(within(panel).getByLabelText("云同步邮箱"), "learner@example.com");
    await user.type(within(panel).getByLabelText("云同步密码"), "123456");
    await user.click(within(panel).getByRole("button", { name: "注册" }));

    expect(await within(panel).findByRole("alert")).toHaveTextContent("这个邮箱已注册，请直接登录");
  });

  it("blocks cloud sync and allows resending verification for unverified users", async () => {
    const user = userEvent.setup();
    Object.assign(mockApi.status, {
      user: { uid: "user-1", email: "learner@example.com", emailVerified: false },
      isEntitled: true
    } satisfies Partial<CloudSyncStatus>);

    render(<App />);

    const panel = await screen.findByRole("region", { name: "云同步" });
    expect(await within(panel).findByText("已登录 · 邮箱待验证")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "开启" })).toBeDisabled();

    await user.click(within(panel).getByRole("button", { name: "重发验证邮件" }));

    expect(mockApi.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(await within(panel).findByText("验证邮件已重新发送")).toBeInTheDocument();
  });
});

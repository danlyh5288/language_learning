export type Locale = "en" | "zh";

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "pronunciation-vault.locale";

type HealthStatusText = {
  ok: string;
  degraded: string;
  down: string;
  unknown: string;
};

export type I18nMessages = {
  locale: {
    ariaLabel: string;
    english: string;
    chinese: string;
  };
  app: {
    name: string;
    cloudMode: string;
    localMode: string;
    browserPreview: string;
  };
  sidebar: {
    all: string;
    untagged: string;
    tags: string;
    noTags: string;
  };
  list: {
    ariaLabel: string;
    searchLabel: string;
    searchPlaceholder: string;
    clearSearch: string;
    addWord: string;
    loading: string;
    wordCount: (count: number) => string;
    clearFilters: string;
    noMatches: string;
    addFirstWord: string;
  };
  detail: {
    ariaLabel: string;
    add: string;
    edit: string;
    details: string;
    newWordTitle: string;
    selectWordTitle: string;
    empty: string;
    deleteWord: string;
    deleteConfirm: (word: string) => string;
    wordLabel: string;
    wordPlaceholder: string;
    duplicateWord: (word: string) => string;
    tagLabel: string;
    untaggedOption: string;
    newTagLabel: string;
    newTagPlaceholder: string;
    createTag: string;
    toneNoteLabel: string;
    toneNotePlaceholder: string;
    pronunciationRecording: string;
    newRecording: (duration: string) => string;
    noRecording: string;
    pendingSave: string;
    audioPlaceholder: string;
    save: string;
    saving: string;
  };
  status: {
    saved: string;
    deleted: string;
    newRecordingPending: string;
  };
  account: {
    ariaLabel: string;
    signUp: string;
    signIn: string;
    signedIn: string;
    emailNotVerified: string;
    disable: string;
    enable: string;
    resendVerification: string;
    refreshCloudSync: string;
    diagnostics: string;
    signOut: string;
    localMode: string;
    signedInCloudDisabled: string;
    cloudModeSynced: string;
    cloudModePendingUploads: (count: number) => string;
  };
  cloudMessages: {
    signedInEnablingCloud: string;
    signedInCloudEnabled: string;
    signedUpEnablingCloud: string;
    signedUpCloudEnabled: string;
    signedInLocalMode: string;
    verificationEmailSent: string;
    signedOut: string;
    cloudEnabled: string;
    switchedLocal: string;
    cloudRefreshed: string;
    diagnosticsUnavailable: string;
    diagnosticsRefreshed: string;
    diagnosticsSubmitUnavailable: string;
    diagnosticsSubmitted: string;
    diagnosticsSkipped: string;
  };
  auth: {
    cloudSyncAccount: string;
    signInTitle: string;
    signUpTitle: string;
    email: string;
    password: string;
    emailAria: string;
    passwordAria: string;
    passwordPlaceholder: string;
    passwordTooShort: string;
    help: string;
    switchToSignUp: string;
    switchToSignIn: string;
    submitting: string;
    close: string;
  };
  monitor: {
    eyebrow: string;
    title: string;
    close: string;
    notChecked: string;
    recordingsSummary: (pending: number, failed: number) => string;
    empty: string;
    refresh: string;
    refreshing: string;
    submit: string;
    submitting: string;
    healthStatus: HealthStatusText;
  };
  wordRow: {
    play: (word: string) => string;
    noRecording: string;
    noNote: string;
    untagged: string;
  };
  recorder: {
    unsupported: string;
    empty: string;
    processing: string;
    stop: string;
    reRecord: string;
    record: string;
    discard: string;
    inputLevel: string;
    microphonePermissionDenied: string;
  };
  errors: {
    firestoreOffline: string;
    genericFailure: string;
    authEmailAlreadyInUse: string;
    authInvalidEmail: string;
    authInvalidCredential: string;
    authWeakPassword: string;
    authTooManyRequests: string;
    authNetworkFailed: string;
    authRequiresRecentLogin: string;
    cloudActivationUnavailable: string;
    cloudActivationPermission: string;
    cloudActivationGeneric: (message: string) => string;
    messageOverrides: Record<string, string>;
  };
};

const enMessages: I18nMessages = {
  locale: {
    ariaLabel: "Language",
    english: "EN",
    chinese: "中文"
  },
  app: {
    name: "Pronunciation Vault",
    cloudMode: "Cloud mode",
    localMode: "Local mode",
    browserPreview: "Browser preview"
  },
  sidebar: {
    all: "All",
    untagged: "Untagged",
    tags: "Tags",
    noTags: "No tags yet"
  },
  list: {
    ariaLabel: "Word list",
    searchLabel: "Search words",
    searchPlaceholder: "Search words, notes, or #tag",
    clearSearch: "Clear search",
    addWord: "Add word",
    loading: "Loading",
    wordCount: (count) => `${count} ${count === 1 ? "word" : "words"}`,
    clearFilters: "Clear filters",
    noMatches: "No matching words",
    addFirstWord: "Add the first word"
  },
  detail: {
    ariaLabel: "Word details",
    add: "Add",
    edit: "Edit",
    details: "Details",
    newWordTitle: "New word",
    selectWordTitle: "Select a word",
    empty: "Select or add a word",
    deleteWord: "Delete word",
    deleteConfirm: (word) => `Delete "${word}"? Its recording will also be removed from this device.`,
    wordLabel: "Word",
    wordPlaceholder: "e.g. hello",
    duplicateWord: (word) => `Duplicate word: ${word}`,
    tagLabel: "Tag",
    untaggedOption: "Untagged",
    newTagLabel: "New tag",
    newTagPlaceholder: "e.g. Lesson 1",
    createTag: "Create tag",
    toneNoteLabel: "Tone notes",
    toneNotePlaceholder: "Record teacher tips, tone values, similar sounds, or common mistakes",
    pronunciationRecording: "Pronunciation recording",
    newRecording: (duration) => `New recording ${duration}`,
    noRecording: "No recording yet",
    pendingSave: "Pending save",
    audioPlaceholder: "Save a recording to preview it here",
    save: "Save",
    saving: "Saving"
  },
  status: {
    saved: "Saved",
    deleted: "Deleted",
    newRecordingPending: "New recording pending save"
  },
  account: {
    ariaLabel: "Account",
    signUp: "Sign up",
    signIn: "Sign in",
    signedIn: "Signed in",
    emailNotVerified: "Email unverified",
    disable: "Disable",
    enable: "Enable",
    resendVerification: "Resend verification email",
    refreshCloudSync: "Refresh cloud sync",
    diagnostics: "Diagnostics",
    signOut: "Sign out of cloud account",
    localMode: "Local mode",
    signedInCloudDisabled: "Signed in · cloud sync disabled",
    cloudModeSynced: "Cloud mode · synced",
    cloudModePendingUploads: (count) => `Cloud mode · ${count} recording ${count === 1 ? "upload" : "uploads"} pending`
  },
  cloudMessages: {
    signedInEnablingCloud: "Signed in; enabling cloud sync",
    signedInCloudEnabled: "Signed in with cloud sync enabled",
    signedUpEnablingCloud: "Account created; enabling cloud sync",
    signedUpCloudEnabled: "Account created with cloud sync enabled",
    signedInLocalMode: "Signed in; local mode remains available",
    verificationEmailSent: "Verification email sent",
    signedOut: "Signed out of cloud account",
    cloudEnabled: "Cloud sync enabled",
    switchedLocal: "Switched to local mode",
    cloudRefreshed: "Cloud sync refreshed",
    diagnosticsUnavailable: "Diagnostics unavailable",
    diagnosticsRefreshed: "Diagnostics refreshed",
    diagnosticsSubmitUnavailable: "Diagnostics upload unavailable",
    diagnosticsSubmitted: "Diagnostics submitted",
    diagnosticsSkipped: "OpenObserve is not configured; diagnostics were not submitted"
  },
  auth: {
    cloudSyncAccount: "Cloud sync account",
    signInTitle: "Sign in",
    signUpTitle: "Sign up",
    email: "Email",
    password: "Password",
    emailAria: "Cloud sync email",
    passwordAria: "Cloud sync password",
    passwordPlaceholder: "At least 6 characters",
    passwordTooShort: "Password must be at least 6 characters",
    help: "Enter an email and a password with at least 6 characters",
    switchToSignUp: "Create account instead",
    switchToSignIn: "Use existing account",
    submitting: "Submitting",
    close: "Close"
  },
  monitor: {
    eyebrow: "Cloud sync diagnostics",
    title: "Service health",
    close: "Close",
    notChecked: "Not checked yet",
    recordingsSummary: (pending, failed) => `${pending} pending · ${failed} failed`,
    empty: "Refresh to get the current health snapshot",
    refresh: "Refresh",
    refreshing: "Refreshing",
    submit: "Submit",
    submitting: "Submitting",
    healthStatus: {
      ok: "healthy",
      degraded: "degraded",
      down: "down",
      unknown: "unknown"
    }
  },
  wordRow: {
    play: (word) => `Play ${word}`,
    noRecording: "No recording",
    noNote: "No notes",
    untagged: "Untagged"
  },
  recorder: {
    unsupported: "Recording is not supported in this environment",
    empty: "Recording is empty. Please try again.",
    processing: "Processing",
    stop: "Stop",
    reRecord: "Record again",
    record: "Record",
    discard: "Discard",
    inputLevel: "Input level",
    microphonePermissionDenied: "Microphone permission was denied"
  },
  errors: {
    firestoreOffline: "Cannot connect to Firebase. Check your network and try again.",
    genericFailure: "Operation failed",
    authEmailAlreadyInUse: "This email is already registered. Sign in instead.",
    authInvalidEmail: "Invalid email address",
    authInvalidCredential: "Incorrect email or password",
    authWeakPassword: "Password must be at least 6 characters",
    authTooManyRequests: "Too many attempts. Please try again later.",
    authNetworkFailed: "Network connection failed. Please try again later.",
    authRequiresRecentLogin: "Please sign in again before continuing.",
    cloudActivationUnavailable: "Signed in, but cloud sync could not be enabled. Confirm the Firebase project has a default Firestore database and deployed Firestore/Storage rules.",
    cloudActivationPermission: "Signed in, but cloud sync permission was denied. Confirm Firestore/Storage rules are deployed to the current Firebase project.",
    cloudActivationGeneric: (message) => `Signed in, but cloud sync could not be enabled: ${message}`,
    messageOverrides: {
      "请先登录后再发送验证邮件": "Sign in before sending a verification email.",
      "请先登录后再开启云同步": "Sign in before enabling cloud sync.",
      "请先登录后再上报诊断": "Sign in before submitting diagnostics.",
      "标签名称不能为空": "Tag name cannot be empty",
      "词条不存在": "Word does not exist",
      "词条不能为空": "Word cannot be empty",
      "操作失败": "Operation failed",
      "云同步不可用": "Cloud sync unavailable",
      "诊断上报不可用": "Diagnostics upload unavailable"
    }
  }
};

const zhMessages: I18nMessages = {
  locale: {
    ariaLabel: "语言",
    english: "EN",
    chinese: "中文"
  },
  app: {
    name: "发音词库",
    cloudMode: "云端模式",
    localMode: "本地模式",
    browserPreview: "浏览器预览"
  },
  sidebar: {
    all: "全部",
    untagged: "未分类",
    tags: "标签",
    noTags: "暂无标签"
  },
  list: {
    ariaLabel: "词条列表",
    searchLabel: "搜索词条",
    searchPlaceholder: "搜索词、备注或 #标签",
    clearSearch: "清空搜索",
    addWord: "添加词条",
    loading: "加载中",
    wordCount: (count) => `${count} 个词条`,
    clearFilters: "清除筛选",
    noMatches: "暂无匹配词条",
    addFirstWord: "添加第一个词"
  },
  detail: {
    ariaLabel: "词条详情",
    add: "添加",
    edit: "编辑",
    details: "详情",
    newWordTitle: "新词条",
    selectWordTitle: "选择词条",
    empty: "选择或添加词条",
    deleteWord: "删除词条",
    deleteConfirm: (word) => `删除“${word}”？录音也会从本机移除。`,
    wordLabel: "词条",
    wordPlaceholder: "例如：侬好",
    duplicateWord: (word) => `已有同名词条：${word}`,
    tagLabel: "标签",
    untaggedOption: "未分类",
    newTagLabel: "新建标签",
    newTagPlaceholder: "如：第一课",
    createTag: "新建标签",
    toneNoteLabel: "音调备注",
    toneNotePlaceholder: "记录老师提示、调值、近似音或易错点",
    pronunciationRecording: "发音录音",
    newRecording: (duration) => `新录音 ${duration}`,
    noRecording: "尚未录音",
    pendingSave: "待保存",
    audioPlaceholder: "保存一段录音后可在这里试听",
    save: "保存",
    saving: "保存中"
  },
  status: {
    saved: "已保存",
    deleted: "已删除",
    newRecordingPending: "新录音待保存"
  },
  account: {
    ariaLabel: "账户",
    signUp: "注册",
    signIn: "登录",
    signedIn: "已登录",
    emailNotVerified: "邮箱未验证",
    disable: "停用",
    enable: "开启",
    resendVerification: "重发验证邮件",
    refreshCloudSync: "刷新云同步",
    diagnostics: "诊断",
    signOut: "退出云端账号",
    localMode: "本地模式",
    signedInCloudDisabled: "已登录 · 云同步已停用",
    cloudModeSynced: "云端模式 · 已同步",
    cloudModePendingUploads: (count) => `云端模式 · ${count} 个录音待上传`
  },
  cloudMessages: {
    signedInEnablingCloud: "已登录，正在开启云同步",
    signedInCloudEnabled: "已登录并开启云同步",
    signedUpEnablingCloud: "已注册，正在开启云同步",
    signedUpCloudEnabled: "已注册并开启云同步",
    signedInLocalMode: "已登录，本地模式可继续使用",
    verificationEmailSent: "验证邮件已重新发送",
    signedOut: "已退出云端账号",
    cloudEnabled: "已开启云同步",
    switchedLocal: "已切换到本地模式",
    cloudRefreshed: "云同步已刷新",
    diagnosticsUnavailable: "诊断不可用",
    diagnosticsRefreshed: "诊断已刷新",
    diagnosticsSubmitUnavailable: "诊断上报不可用",
    diagnosticsSubmitted: "诊断已上报",
    diagnosticsSkipped: "OpenObserve 未配置，诊断未上报"
  },
  auth: {
    cloudSyncAccount: "云同步账号",
    signInTitle: "登录",
    signUpTitle: "注册",
    email: "邮箱",
    password: "密码",
    emailAria: "云同步邮箱",
    passwordAria: "云同步密码",
    passwordPlaceholder: "至少 6 位",
    passwordTooShort: "密码至少 6 位",
    help: "请输入邮箱和至少 6 位密码",
    switchToSignUp: "改为注册",
    switchToSignIn: "已有账号登录",
    submitting: "提交中",
    close: "关闭"
  },
  monitor: {
    eyebrow: "云同步诊断",
    title: "Service health",
    close: "关闭",
    notChecked: "尚未检查",
    recordingsSummary: (pending, failed) => `${pending} pending · ${failed} failed`,
    empty: "点击刷新获取当前健康快照",
    refresh: "刷新",
    refreshing: "刷新中",
    submit: "上报",
    submitting: "上报中",
    healthStatus: {
      ok: "healthy",
      degraded: "degraded",
      down: "down",
      unknown: "unknown"
    }
  },
  wordRow: {
    play: (word) => `播放 ${word}`,
    noRecording: "未录音",
    noNote: "无备注",
    untagged: "未分类"
  },
  recorder: {
    unsupported: "当前环境不支持录音",
    empty: "录音为空，请重试",
    processing: "处理中",
    stop: "停止",
    reRecord: "重新录音",
    record: "录音",
    discard: "丢弃",
    inputLevel: "输入音量",
    microphonePermissionDenied: "麦克风权限被拒绝"
  },
  errors: {
    firestoreOffline: "当前无法连接 Firebase，请检查网络后重试",
    genericFailure: "操作失败",
    authEmailAlreadyInUse: "这个邮箱已注册，请直接登录",
    authInvalidEmail: "邮箱格式不正确",
    authInvalidCredential: "邮箱或密码不正确",
    authWeakPassword: "密码至少 6 位",
    authTooManyRequests: "尝试次数过多，请稍后再试",
    authNetworkFailed: "网络连接失败，请稍后重试",
    authRequiresRecentLogin: "请重新登录后再操作",
    cloudActivationUnavailable: "已登录，但暂时无法开启云同步。请确认 Firebase 项目已创建 Firestore 默认数据库，并已部署 Firestore/Storage 规则。",
    cloudActivationPermission: "已登录，但云同步权限被拒绝。请确认 Firestore/Storage 规则已部署到当前 Firebase 项目。",
    cloudActivationGeneric: (message) => `已登录，但暂时无法开启云同步：${message}`,
    messageOverrides: {}
  }
};

export const messages: Record<Locale, I18nMessages> = {
  en: enMessages,
  zh: zhMessages
};

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh";
}

export function readStoredLocale(): Locale {
  try {
    const storedLocale = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    return isLocale(storedLocale) ? storedLocale : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function writeStoredLocale(locale: Locale): void {
  try {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}

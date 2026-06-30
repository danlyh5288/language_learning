import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { CloudSyncStatus } from "../shared/types";
import { createExpoDatabaseAdapter, migrateVocabularyDb, VocabularyRepository } from "./src/data/vocabularyRepository";
import { FirebaseMobileSession, FirebaseVocabularyRepository } from "./src/data/firebaseVocabularyRepository";
import { expoRecordingFiles } from "./src/data/recordingFiles";
import { Check, Cloud, ListMusic, LogIn, LogOut, Plus, RefreshCw, UserRound } from "./src/components/icons";
import { VocabularyScreen } from "./src/screens/VocabularyScreen";
import { colors, styles } from "./src/theme";

type MobileTab = "home" | "account";
type AuthMode = "signIn" | "signUp";

export default function App() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="vocabulary.sqlite" onInit={(db) => migrateVocabularyDb(createExpoDatabaseAdapter(db))}>
        <StatusBar style="dark" />
        <RepositoryBackedApp />
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

function RepositoryBackedApp() {
  const db = useSQLiteContext();
  const adapter = useMemo(() => createExpoDatabaseAdapter(db), [db]);
  const localRepository = useMemo(() => new VocabularyRepository(adapter), [adapter]);
  const firebaseRepository = useMemo(() => new FirebaseVocabularyRepository(adapter), [adapter]);
  const firebaseSession = useMemo(() => new FirebaseMobileSession(adapter), [adapter]);
  const [isCloudEnabled, setIsCloudEnabled] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("signIn");
  const [activeTab, setActiveTab] = useState<MobileTab>("home");
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [isCloudBusy, setIsCloudBusy] = useState(false);
  const repository = isCloudEnabled ? firebaseRepository : localRepository;

  const refreshCloudStatus = useCallback(async (enabledOverride?: boolean) => {
    setCloudStatus(await firebaseSession.getStatus(enabledOverride ?? isCloudEnabled));
  }, [firebaseSession, isCloudEnabled]);

  useEffect(() => {
    void refreshCloudStatus().catch((caught) => setCloudError(errorMessage(caught)));
  }, [refreshCloudStatus]);

  async function runCloudAction(action: () => Promise<boolean | void>, successMessage?: string) {
    setIsCloudBusy(true);
    setCloudError(null);
    setCloudMessage(null);
    try {
      const nextEnabled = await action();
      await refreshCloudStatus(typeof nextEnabled === "boolean" ? nextEnabled : undefined);
      if (successMessage) {
        setCloudMessage(successMessage);
      }
    } catch (caught) {
      setCloudError(errorMessage(caught));
    } finally {
      setIsCloudBusy(false);
    }
  }

  return (
    <View style={styles.appRoot}>
      <View style={styles.tabScene}>
        {activeTab === "home" ? (
          <VocabularyScreen repository={repository} recordingFiles={expoRecordingFiles} />
        ) : (
          <AccountScreen
            status={cloudStatus}
            authMode={authMode}
            email={email}
            password={password}
            busy={isCloudBusy}
            message={cloudMessage}
            error={cloudError}
            onAuthModeChange={setAuthMode}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSubmitAuth={() => {
              if (!email.trim() || password.length < 6) {
                return;
              }
              const isSignIn = authMode === "signIn";
              void runCloudAction(async () => {
                if (isSignIn) {
                  await firebaseSession.signIn({ email, password });
                } else {
                  await firebaseSession.signUp({ email, password });
                }
                await firebaseRepository.importLocalLibrary(localRepository);
                setIsCloudEnabled(true);
                setPassword("");
                return true;
              }, isSignIn ? "已登录并开启云同步" : "已注册并开启云同步");
            }}
            onSendVerificationEmail={() => void runCloudAction(async () => {
              await firebaseSession.sendVerificationEmail();
            }, "验证邮件已发送")}
            onSignOut={() => void runCloudAction(async () => {
              await firebaseSession.signOut();
              setIsCloudEnabled(false);
              setPassword("");
              return false;
            }, "已退出登录")}
            onEnable={() => void runCloudAction(async () => {
              const user = firebaseSession.getCurrentUser();
              if (!user) {
                throw new Error("请先登录后再开启云同步");
              }
              await firebaseRepository.importLocalLibrary(localRepository);
              setIsCloudEnabled(true);
              return true;
            }, "已开启云同步")}
            onDisable={() => void runCloudAction(async () => {
              setIsCloudEnabled(false);
              return false;
            }, "已切回本地模式")}
            onRefresh={() => void runCloudAction(async () => {
              if (isCloudEnabled && firebaseSession.getCurrentUser()) {
                await firebaseRepository.processRecordingQueue();
              }
              return isCloudEnabled;
            }, "云同步已刷新")}
          />
        )}
      </View>
      <BottomTabBar activeTab={activeTab} onChange={setActiveTab} />
    </View>
  );
}

type AccountScreenProps = {
  status: CloudSyncStatus | null;
  authMode: AuthMode;
  email: string;
  password: string;
  busy: boolean;
  message: string | null;
  error: string | null;
  onAuthModeChange: (mode: AuthMode) => void;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmitAuth: () => void;
  onSendVerificationEmail: () => void;
  onSignOut: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onRefresh: () => void;
};

function AccountScreen({
  status,
  authMode,
  email,
  password,
  busy,
  message,
  error,
  onAuthModeChange,
  onEmailChange,
  onPasswordChange,
  onSubmitAuth,
  onSendVerificationEmail,
  onSignOut,
  onEnable,
  onDisable,
  onRefresh
}: AccountScreenProps) {
  const signedIn = Boolean(status?.user);
  const emailVerified = status?.user?.emailVerified ?? false;
  const isSignIn = authMode === "signIn";
  const canSubmitAuth = email.trim().length > 0 && password.length >= 6 && !busy;
  const statusText = status?.isEnabled
    ? status.pendingRecordingUploads > 0
      ? `云端模式 · ${status.pendingRecordingUploads} 个录音待上传`
      : "云端模式 · 已同步"
    : signedIn
      ? "已登录 · 云同步已停用"
      : "本地移动模式";
  const authHelpText = password.length > 0 && password.length < 6
    ? "密码至少 6 位。"
    : "登录后会把本机词库导入云端，并在手机上切换到云同步模式。";

  return (
    <SafeAreaView style={styles.accountSafeArea} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.accountKeyboard}>
        <ScrollView
          style={styles.accountScroll}
          contentContainerStyle={styles.accountContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.accountHeader}>
            <Text style={styles.accountEyebrow}>账户</Text>
            <Text style={styles.accountTitle}>云同步账号</Text>
            <Text style={styles.accountSubtitle}>{statusText}</Text>
          </View>

          {signedIn ? (
            <>
              <View style={styles.accountCard}>
                <View style={styles.accountProfileRow}>
                  <View style={styles.accountAvatar}>
                    <UserRound size={20} color={colors.primaryStrong} />
                  </View>
                  <View style={styles.accountProfileCopy}>
                    <Text style={styles.accountCardTitle}>已登录</Text>
                    <Text style={styles.accountEmail} numberOfLines={1}>{status?.user?.email ?? "云同步账号"}</Text>
                  </View>
                </View>
                {!emailVerified ? (
                  <Text style={styles.accountBadge}>邮箱未验证</Text>
                ) : (
                  <Text style={styles.accountBadgeOk}>邮箱已验证</Text>
                )}
                <Text style={styles.accountStatusLine}>{statusText}</Text>
              </View>

              <View style={styles.accountCard}>
                <Text style={styles.accountSectionTitle}>云同步</Text>
                <AccountAction
                  icon={<Cloud size={18} color={status?.isEnabled ? colors.warning : colors.primaryStrong} />}
                  label={status?.isEnabled ? "停用云同步" : "开启云同步"}
                  detail={status?.isEnabled ? "保留账号登录，词库回到本地模式。" : "导入本机词库，并从云端读取词条。"}
                  disabled={busy}
                  danger={Boolean(status?.isEnabled)}
                  onPress={status?.isEnabled ? onDisable : onEnable}
                />
                {!emailVerified ? (
                  <AccountAction
                    icon={<RefreshCw size={18} color={colors.primaryStrong} />}
                    label="重发验证邮件"
                    detail="向当前邮箱重新发送验证链接。"
                    disabled={busy}
                    onPress={onSendVerificationEmail}
                  />
                ) : null}
                <AccountAction
                  icon={<RefreshCw size={18} color={colors.primaryStrong} />}
                  label="刷新云同步"
                  detail="处理待上传录音，并刷新账户状态。"
                  disabled={busy}
                  onPress={onRefresh}
                />
                <AccountAction
                  icon={<LogOut size={18} color={colors.danger} />}
                  label="退出登录"
                  detail="退出云同步账号，手机回到本地模式。"
                  disabled={busy}
                  danger
                  onPress={onSignOut}
                />
              </View>
            </>
          ) : (
            <View style={styles.accountCard}>
              <Text style={styles.accountSectionTitle}>{isSignIn ? "登录" : "注册"}</Text>
              <View style={styles.field}>
                <Text style={styles.label}>邮箱</Text>
                <TextInput
                  accessibilityLabel="云同步邮箱"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.input}
                  value={email}
                  placeholder="learner@example.com"
                  placeholderTextColor={colors.faint}
                  onChangeText={onEmailChange}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>密码</Text>
                <TextInput
                  accessibilityLabel="云同步密码"
                  secureTextEntry
                  style={styles.input}
                  value={password}
                  placeholder="至少 6 位"
                  placeholderTextColor={colors.faint}
                  onChangeText={onPasswordChange}
                  onSubmitEditing={canSubmitAuth ? onSubmitAuth : undefined}
                />
              </View>
              <Text style={styles.accountHelper}>{authHelpText}</Text>
              <View style={styles.accountAuthActions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  style={[styles.accountSecondaryButton, busy ? styles.accountButtonDisabled : null]}
                  onPress={() => onAuthModeChange(isSignIn ? "signUp" : "signIn")}
                >
                  <Text style={styles.accountSecondaryButtonText}>{isSignIn ? "创建账号" : "已有账号登录"}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!canSubmitAuth}
                  style={[styles.accountPrimaryButton, !canSubmitAuth ? styles.accountButtonDisabled : null]}
                  onPress={onSubmitAuth}
                >
                  {isSignIn ? <LogIn size={17} color="#ffffff" /> : <Plus size={17} color="#ffffff" />}
                  <Text style={styles.accountPrimaryButtonText}>{busy ? "处理中" : isSignIn ? "登录" : "注册"}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {error ? (
            <View style={[styles.accountFeedback, styles.accountFeedbackError]}>
              <Text style={styles.accountFeedbackErrorText}>{error}</Text>
            </View>
          ) : null}
          {message && !error ? (
            <View style={[styles.accountFeedback, styles.accountFeedbackOk]}>
              <Check size={16} color={colors.primaryStrong} />
              <Text style={styles.accountFeedbackOkText}>{message}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type AccountActionProps = {
  icon: ReactNode;
  label: string;
  detail: string;
  disabled: boolean;
  danger?: boolean;
  onPress: () => void;
};

function AccountAction({ icon, label, detail, disabled, danger = false, onPress }: AccountActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={[styles.accountAction, disabled ? styles.accountActionDisabled : null]}
      onPress={onPress}
    >
      <View style={styles.accountActionIcon}>{icon}</View>
      <View style={styles.accountActionCopy}>
        <Text style={[styles.accountActionLabel, danger ? styles.accountActionLabelDanger : null]}>{label}</Text>
        <Text style={styles.accountActionDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

type BottomTabBarProps = {
  activeTab: MobileTab;
  onChange: (tab: MobileTab) => void;
};

function BottomTabBar({ activeTab, onChange }: BottomTabBarProps) {
  return (
    <SafeAreaView style={styles.bottomTabSafeArea} edges={["bottom", "left", "right"]}>
      <View style={styles.bottomTabBar}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "home" }}
          style={[styles.bottomTabButton, activeTab === "home" ? styles.bottomTabButtonActive : null]}
          onPress={() => onChange("home")}
        >
          <ListMusic size={20} color={activeTab === "home" ? colors.primaryStrong : colors.muted} />
          <Text style={[styles.bottomTabText, activeTab === "home" ? styles.bottomTabTextActive : null]}>词库</Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "account" }}
          style={[styles.bottomTabButton, activeTab === "account" ? styles.bottomTabButtonActive : null]}
          onPress={() => onChange("account")}
        >
          <UserRound size={20} color={activeTab === "account" ? colors.primaryStrong : colors.muted} />
          <Text style={[styles.bottomTabText, activeTab === "account" ? styles.bottomTabTextActive : null]}>账户</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export function AppFallback({ message }: { message: string }) {
  return (
    <View style={[styles.appRoot, styles.centeredState]}>
      <Text style={styles.emptyTitle}>发音词库</Text>
      <Text style={styles.mutedText}>{message}</Text>
    </View>
  );
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : "操作失败";
}

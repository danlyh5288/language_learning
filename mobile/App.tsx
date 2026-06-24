import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Pressable, Text, TextInput, View } from "react-native";
import type { CloudSyncStatus } from "../shared/types";
import { createExpoDatabaseAdapter, migrateVocabularyDb, VocabularyRepository } from "./src/data/vocabularyRepository";
import { FirebaseMobileSession, FirebaseVocabularyRepository } from "./src/data/firebaseVocabularyRepository";
import { expoRecordingFiles } from "./src/data/recordingFiles";
import { VocabularyScreen } from "./src/screens/VocabularyScreen";
import { colors, styles } from "./src/theme";

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
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [isCloudBusy, setIsCloudBusy] = useState(false);
  const repository = isCloudEnabled ? firebaseRepository : localRepository;

  const refreshCloudStatus = useCallback(async () => {
    setCloudStatus(await firebaseSession.getStatus(isCloudEnabled));
  }, [firebaseSession, isCloudEnabled]);

  useEffect(() => {
    void refreshCloudStatus().catch((caught) => setCloudError(errorMessage(caught)));
  }, [refreshCloudStatus]);

  async function runCloudAction(action: () => Promise<void>) {
    setIsCloudBusy(true);
    setCloudError(null);
    try {
      await action();
      await refreshCloudStatus();
    } catch (caught) {
      setCloudError(errorMessage(caught));
    } finally {
      setIsCloudBusy(false);
    }
  }

  return (
    <View style={styles.appRoot}>
      <CloudControls
        status={cloudStatus}
        email={email}
        password={password}
        busy={isCloudBusy}
        error={cloudError}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSignIn={() => void runCloudAction(async () => {
          await firebaseSession.signIn({ email, password });
          await firebaseRepository.importLocalLibrary(localRepository);
          setIsCloudEnabled(true);
          setPassword("");
        })}
        onSignUp={() => void runCloudAction(async () => {
          await firebaseSession.signUp({ email, password });
          await firebaseRepository.importLocalLibrary(localRepository);
          setIsCloudEnabled(true);
          setPassword("");
        })}
        onSendVerificationEmail={() => void runCloudAction(async () => {
          await firebaseSession.sendVerificationEmail();
        })}
        onSignOut={() => void runCloudAction(async () => {
          await firebaseSession.signOut();
          setIsCloudEnabled(false);
        })}
        onEnable={() => void runCloudAction(async () => {
          const user = firebaseSession.getCurrentUser();
          if (!user) {
            throw new Error("请先登录后再开启云同步");
          }
          await firebaseRepository.importLocalLibrary(localRepository);
          setIsCloudEnabled(true);
        })}
        onDisable={() => void runCloudAction(async () => setIsCloudEnabled(false))}
      />
      <VocabularyScreen repository={repository} recordingFiles={expoRecordingFiles} />
    </View>
  );
}

type CloudControlsProps = {
  status: CloudSyncStatus | null;
  email: string;
  password: string;
  busy: boolean;
  error: string | null;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onSignIn: () => void;
  onSignUp: () => void;
  onSendVerificationEmail: () => void;
  onSignOut: () => void;
  onEnable: () => void;
  onDisable: () => void;
};

function CloudControls({
  status,
  email,
  password,
  busy,
  error,
  onEmailChange,
  onPasswordChange,
  onSignIn,
  onSignUp,
  onSendVerificationEmail,
  onSignOut,
  onEnable,
  onDisable
}: CloudControlsProps) {
  const signedIn = Boolean(status?.user);
  const emailVerified = status?.user?.emailVerified ?? false;
  const statusText = status?.isEnabled
    ? status.pendingRecordingUploads > 0
      ? `云端模式 · ${status.pendingRecordingUploads} 个录音待上传`
      : "云端模式"
    : signedIn
      ? "已登录 · 云同步已停用"
      : "本地移动模式";

  return (
    <View style={styles.cloudBar}>
      <Text style={styles.cloudStatusText}>{statusText}</Text>
      {signedIn ? (
        <View style={styles.cloudRow}>
          <Text style={styles.cloudEmail} numberOfLines={1}>{status?.user?.email ?? "已登录"}</Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={[styles.cloudButton, busy ? styles.cloudButtonDisabled : null]}
            onPress={status?.isEnabled ? onDisable : onEnable}
          >
            <Text style={styles.cloudButtonText}>{status?.isEnabled ? "停用" : "开启"}</Text>
          </Pressable>
          {!emailVerified ? (
            <Pressable accessibilityRole="button" disabled={busy} style={styles.cloudButton} onPress={onSendVerificationEmail}>
              <Text style={styles.cloudButtonText}>重发验证邮件</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" disabled={busy} style={styles.cloudButton} onPress={onSignOut}>
            <Text style={styles.cloudButtonText}>退出</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.cloudAuthRow}>
          <TextInput
            accessibilityLabel="云同步邮箱"
            style={styles.cloudInput}
            value={email}
            placeholder="邮箱"
            placeholderTextColor={colors.faint}
            onChangeText={onEmailChange}
          />
          <TextInput
            accessibilityLabel="云同步密码"
            secureTextEntry
            style={styles.cloudInput}
            value={password}
            placeholder="密码"
            placeholderTextColor={colors.faint}
            onChangeText={onPasswordChange}
          />
          <Pressable accessibilityRole="button" disabled={busy} style={styles.cloudButton} onPress={onSignIn}>
            <Text style={styles.cloudButtonText}>登录</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy} style={styles.cloudButton} onPress={onSignUp}>
            <Text style={styles.cloudButtonText}>注册</Text>
          </Pressable>
        </View>
      )}
      {error ? <Text style={styles.cloudErrorText}>{error}</Text> : null}
    </View>
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

import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Text, View } from "react-native";
import { createExpoDatabaseAdapter, migrateVocabularyDb, VocabularyRepository } from "./src/data/vocabularyRepository";
import { expoRecordingFiles } from "./src/data/recordingFiles";
import { VocabularyScreen } from "./src/screens/VocabularyScreen";
import { styles } from "./src/theme";

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
  const repository = useMemo(() => new VocabularyRepository(createExpoDatabaseAdapter(db)), [db]);

  return (
    <View style={styles.appRoot}>
      <VocabularyScreen repository={repository} recordingFiles={expoRecordingFiles} />
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

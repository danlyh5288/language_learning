import { Directory, File, Paths } from "expo-file-system";
import type { RecordingFileStore } from "./types";

const RECORDINGS_DIR_NAME = "recordings";

export const expoRecordingFiles: RecordingFileStore = {
  async copyRecordingToLibrary(sourceUri: string, wordId: string): Promise<string> {
    const directory = new Directory(Paths.document, RECORDINGS_DIR_NAME);
    directory.create({ idempotent: true, intermediates: true });

    const source = new File(sourceUri);
    const extension = extensionFromUri(sourceUri);
    const target = new File(directory, `${wordId}-${Date.now()}${extension}`);

    await source.copy(target);
    return target.uri;
  },

  async deleteRecording(uri: string | null | undefined): Promise<void> {
    if (!uri) {
      return;
    }

    try {
      const file = new File(uri);
      if (file.exists) {
        file.delete();
      }
    } catch {
      // Missing temp files should not block saving or deleting vocabulary metadata.
    }
  }
};

function extensionFromUri(uri: string): string {
  const cleanUri = uri.split("?")[0] ?? uri;
  const match = cleanUri.match(/\.[a-z0-9]+$/i);
  return match?.[0] ?? ".m4a";
}

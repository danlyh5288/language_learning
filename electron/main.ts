import { app, BrowserWindow, ipcMain, net, protocol } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createVocabularyStore, type VocabularyStore } from "./storage";
import type { RecordingSaveInput, WordInput, WordListFilters } from "../shared/types";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "recording",
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true
    }
  }
]);

let mainWindow: BrowserWindow | null = null;
let store: VocabularyStore | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1060,
    minHeight: 720,
    title: "发音词库",
    backgroundColor: "#f6f8f7",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  if (app.isPackaged) {
    await mainWindow.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  } else {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

function setupProtocol(vocabularyStore: VocabularyStore): void {
  protocol.handle("recording", async (request) => {
    const url = new URL(request.url);
    const wordId = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const recordingPath = vocabularyStore.getRecordingPath(wordId);

    if (!recordingPath) {
      return new Response("Recording not found", { status: 404 });
    }

    return net.fetch(pathToFileURL(recordingPath).toString());
  });
}

function setupIpc(vocabularyStore: VocabularyStore): void {
  ipcMain.handle("words:list", (_event, filters?: WordListFilters) => vocabularyStore.listWords(filters));
  ipcMain.handle("words:create", (_event, input: WordInput) => vocabularyStore.createWord(input));
  ipcMain.handle("words:update", (_event, id: string, input: WordInput) => vocabularyStore.updateWord(id, input));
  ipcMain.handle("words:delete", (_event, id: string) => vocabularyStore.deleteWord(id));

  ipcMain.handle("tags:list", () => vocabularyStore.listTags());
  ipcMain.handle("tags:create", (_event, name: string) => vocabularyStore.createTag(name));

  ipcMain.handle("recordings:saveForWord", (_event, input: RecordingSaveInput) => vocabularyStore.saveRecording(input));
  ipcMain.handle("recordings:getPlaybackUrl", (_event, wordId: string) => vocabularyStore.getPlaybackUrl(wordId));
}

app.whenReady().then(async () => {
  store = await createVocabularyStore(app.getPath("userData"));
  setupProtocol(store);
  setupIpc(store);
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

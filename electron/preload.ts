import { contextBridge, ipcRenderer } from "electron";
import type { RecordingSaveInput, VocabApi, WordInput, WordListFilters } from "../shared/types";

const api: VocabApi = {
  words: {
    list: (filters?: WordListFilters) => ipcRenderer.invoke("words:list", filters),
    create: (input: WordInput) => ipcRenderer.invoke("words:create", input),
    update: (id: string, input: WordInput) => ipcRenderer.invoke("words:update", id, input),
    delete: (id: string) => ipcRenderer.invoke("words:delete", id)
  },
  tags: {
    list: () => ipcRenderer.invoke("tags:list"),
    create: (name: string) => ipcRenderer.invoke("tags:create", name)
  },
  recordings: {
    saveForWord: (input: RecordingSaveInput) => ipcRenderer.invoke("recordings:saveForWord", input),
    getPlaybackUrl: (wordId: string) => ipcRenderer.invoke("recordings:getPlaybackUrl", wordId)
  }
};

contextBridge.exposeInMainWorld("vocabApi", api);

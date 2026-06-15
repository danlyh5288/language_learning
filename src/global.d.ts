import type { VocabApi } from "../shared/types";

declare global {
  interface Window {
    vocabApi?: VocabApi;
  }
}

export {};

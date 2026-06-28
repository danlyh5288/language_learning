import { UNTAGGED_FILTER_ID, type WordListFilters, type WordRecord } from "./types";

export function filterWords<T extends WordRecord>(words: T[], filters: WordListFilters = {}): T[] {
  return words
    .filter((word) => matchesWordFilters(word, filters))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function matchesWordFilters(word: WordRecord, filters: WordListFilters = {}): boolean {
  const queryText = filters.query?.trim() ?? "";
  const lowerQuery = queryText.toLowerCase();

  if (filters.tagId === UNTAGGED_FILTER_ID && word.tagId !== null) {
    return false;
  }
  if (filters.tagId && filters.tagId !== UNTAGGED_FILTER_ID && word.tagId !== filters.tagId) {
    return false;
  }
  if (queryText.startsWith("#")) {
    const tagQuery = queryText.slice(1).trim().toLowerCase();
    return tagQuery.length === 0 || (word.tagName ?? "").toLowerCase().includes(tagQuery);
  }
  if (!lowerQuery) {
    return true;
  }
  return (
    word.text.toLowerCase().includes(lowerQuery) ||
    word.toneNote.toLowerCase().includes(lowerQuery) ||
    (word.tagName ?? "").toLowerCase().includes(lowerQuery)
  );
}

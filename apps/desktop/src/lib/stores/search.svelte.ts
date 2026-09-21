import type { Message } from "@office-chat/shared";

/** Server-backed message search results for the Ctrl/Cmd+K search overlay. */
export const messageSearch = $state<{ query: string; results: Message[]; loading: boolean }>({
  query: "",
  results: [],
  loading: false,
});

export function startSearch(query: string): void {
  messageSearch.query = query;
  messageSearch.loading = true;
}

export function setSearchResults(query: string, results: Message[]): void {
  // Ignore a stale reply that lost the race with a newer query.
  if (query !== messageSearch.query) return;
  messageSearch.results = results;
  messageSearch.loading = false;
}

export function clearSearch(): void {
  messageSearch.query = "";
  messageSearch.results = [];
  messageSearch.loading = false;
}

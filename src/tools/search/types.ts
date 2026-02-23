/** Unified search result returned by all search backends */
export interface SearchResult {
  url: string;
  title: string;
  content: string;
}

/** A search backend that can perform web searches */
export interface SearchBackend {
  name: string;
  search(query: string, limit: number): Promise<SearchResult[]>;
}

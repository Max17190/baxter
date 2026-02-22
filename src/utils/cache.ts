import { LRUCache } from "lru-cache";

export interface CacheOptions {
  maxSize?: number;
  ttlMs?: number;
}

/** LRU + TTL cache for API responses and computed results */
export function createCache<V extends object>(options: CacheOptions = {}): LRUCache<string, V> {
  return new LRUCache<string, V>({
    max: options.maxSize ?? 500,
    ttl: options.ttlMs ?? 3600_000, // 1 hour default
  });
}

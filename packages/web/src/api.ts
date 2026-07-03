import type { SearchResult } from "@nostril/shared";

const BASE = import.meta.env.VITE_API_URL ?? "";

export async function search(
  q: string,
  source: string,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q, source });
  const res = await fetch(`${BASE}/api/search?${params}`, { signal });
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return res.json();
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

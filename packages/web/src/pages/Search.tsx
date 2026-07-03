import { useEffect, useState } from "preact/hooks";
import { useSearch } from "wouter-preact";
import { search } from "../api.ts";
import { ResultCard } from "../components/ResultCard.tsx";
import type { SearchResult } from "@nostril/shared";

const TABS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "nostr_user", label: "Nostr" },
  { id: "mastodon_account", label: "Mastodon" },
  { id: "mastodon_status", label: "Toots" },
  { id: "rss_item", label: "Articles" },
];

export function SearchPage() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const q = params.get("q") ?? "";
  const source = params.get("source") ?? "all";

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q) {
      setResults([]);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    search(q, source, ac.signal)
      .then(setResults)
      .catch((e) => {
        if (e.name !== "AbortError") console.error(e);
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [q, source]);

  function tabHref(id: string): string {
    const p = new URLSearchParams({ q });
    if (id !== "all") p.set("source", id);
    return `/search?${p}`;
  }

  return (
    <>
      <h2>{q ? `Results for "${q}"` : "Search"}</h2>
      <div class="tabs">
        {TABS.map((t) => (
          <a
            key={t.id}
            class={`tab ${source === t.id ? "active" : ""}`}
            href={tabHref(t.id)}
          >
            {t.label}
          </a>
        ))}
      </div>
      {loading ? <p class="muted">Searching...</p> : null}
      {!loading && q && results.length === 0 ? <p>No results.</p> : null}
      <div class="results">
        {results.map((r) => (
          <ResultCard key={`${r.source}:${r.source_key}`} r={r} />
        ))}
      </div>
    </>
  );
}

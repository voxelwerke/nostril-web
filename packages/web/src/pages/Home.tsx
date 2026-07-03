import { useEffect, useState } from "preact/hooks";
import { useLocation } from "wouter-preact";
import { fetchFeed } from "../api.ts";
import { ResultCard } from "../components/ResultCard.tsx";
import type { SearchResult } from "@nostril/shared";

export function Home() {
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");
  const [feed, setFeed] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    fetchFeed(ac.signal)
      .then(setFeed)
      .catch((e) => {
        if (e.name !== "AbortError") console.error(e);
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, []);

  function submit(e: Event) {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <>
      <h1>nostril search</h1>
      <p class="muted">
        A search index for Nostr, a handful of NZ Mastodon instances, and RSS feeds.
        Posts are kept for the last 4 weeks; accounts and feeds stick around.
      </p>
      <form class="search" onSubmit={submit}>
        <input
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          placeholder="search everything..."
          autofocus
        />
        <button type="submit">Search</button>
      </form>
      <h2>Recent</h2>
      {loading ? <p class="muted">Loading…</p> : null}
      {!loading && feed.length === 0 ? <p class="muted">Nothing recent yet.</p> : null}
      <div class="results">
        {feed.map((r) => (
          <ResultCard key={`${r.source}:${r.source_key}`} r={r} />
        ))}
      </div>
    </>
  );
}

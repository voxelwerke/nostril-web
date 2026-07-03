import { useEffect, useState } from "preact/hooks";
import { fetchFeed } from "../api.ts";
import { ResultCard } from "../components/ResultCard.tsx";
import type { SearchResult } from "@nostril/shared";

export function Home() {
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

  return (
    <>
      <p class="muted">
        A search index for Nostr, a handful of NZ Mastodon instances, and RSS feeds.
        Posts are kept for the last 4 weeks; accounts and feeds stick around.
      </p>
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

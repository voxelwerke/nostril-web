import { useState } from "preact/hooks";
import { useLocation } from "wouter-preact";

export function Home() {
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");

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
    </>
  );
}

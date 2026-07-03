import { useState } from "preact/hooks";
import { useLocation } from "wouter-preact";

export function Header() {
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");

  function submit(e: Event) {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <header>
      <a href="/" class="brand">
        nostril
      </a>
      <form class="search" onSubmit={submit}>
        <input
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          placeholder="search nostr, mastodon, rss..."
        />
        <button type="submit">Search</button>
      </form>
    </header>
  );
}

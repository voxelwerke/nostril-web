import { hexToNpub } from "@nostril/shared";
import type { SearchResult } from "@nostril/shared";

const LABELS: Record<string, string> = {
  nostr_user: "nostr",
  nostr_note: "nostr",
  mastodon_account: "mastodon",
  mastodon_status: "mastodon",
  rss_feed: "rss",
  rss_item: "rss",
};

function linkFor(r: SearchResult): string {
  const meta = (r.meta ?? {}) as Record<string, string>;
  switch (r.source) {
    case "nostr_user":
      return `/nostr/${hexToNpub(r.source_key)}`;
    case "mastodon_account":
      return `/mastodon/${meta.instance}/${meta.acct}`;
    case "rss_feed":
      return `/rss/feeds/${r.source_key}`;
    case "rss_item":
      return r.url || "#";
    case "mastodon_status":
      return r.url || "#";
    default:
      return r.url || "#";
  }
}

export function ResultCard({ r }: { r: SearchResult }) {
  const href = linkFor(r);
  const external = href.startsWith("http");
  return (
    <a
      class="result"
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
    >
      {r.image_url ? (
        <img class="avatar" src={r.image_url} alt="" loading="lazy" />
      ) : null}
      <div class="body">
        <div class="title">
          <span class="badge">{LABELS[r.source] ?? r.source}</span>
          {r.title || r.author || r.source_key.slice(0, 24)}
        </div>
        {r.author && r.title ? <div class="muted">{r.author}</div> : null}
        {r.body ? <div class="snippet">{r.body}</div> : null}
        {r.published_at ? (
          <div class="muted">{new Date(r.published_at).toLocaleDateString()}</div>
        ) : null}
      </div>
    </a>
  );
}

import { hexToNpub } from "@nostril/shared";
import type { SearchResult } from "@nostril/shared";

function fmtTime(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, "0")}${ap}` : `${h}${ap}`;
}

function trunc(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.floor((day(now) - day(d)) / 86400000);
  const t = fmtTime(d);
  if (diff === 0) return `${t} today`;
  if (diff === 1) return `${t} yesterday`;
  return `${diff} days ago`;
}

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
  const label = trunc(r.title || r.author || r.source_key, 50);
  const sub = r.body || (r.author && r.title ? r.author : "");
  return (
    <div class="result">
      {r.image_url ? (
        <img class="avatar" src={r.image_url} alt="" loading="lazy" />
      ) : null}
      <div class="body">
        <div class="line1">
          <a
            class="result-link"
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
          >
            {label}
          </a>
        </div>
        {sub || r.published_at ? (
          <div class="line2">
            {sub}
            {r.published_at ? (
              <>
                {sub ? " · " : ""}
                <span class="when">{fmtWhen(r.published_at)}</span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

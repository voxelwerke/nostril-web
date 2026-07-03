import { useEffect, useState } from "preact/hooks";
import { encodeUriPath } from "@nostril/shared/uri";
import { listLikes } from "../store/db/client.ts";
import type { LikedPost } from "../store/db/types.ts";

function trunc(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export function Likes() {
  const [items, setItems] = useState<LikedPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listLikes()
      .then(setItems)
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <h2>Likes</h2>
      {loading ? <p class="muted">Loading…</p> : null}
      {!loading && items.length === 0 ? (
        <p class="muted">Nothing liked yet.</p>
      ) : null}
      <div class="results">
        {items.map((p) => {
          const label = trunc(p.title || p.body || p.uri, 80);
          const sub = p.body && p.title ? trunc(p.body, 120) : "";
          return (
            <div class="result" key={p.uri}>
              {p.author_image ? (
                <img class="avatar" src={p.author_image} alt="" loading="lazy" />
              ) : null}
              <div class="body">
                <div class="line1">
                  <a class="result-link" href={`/c/${encodeUriPath(p.uri)}`}>
                    {label}
                  </a>
                </div>
                {sub || p.author_name || p.published_at ? (
                  <div class="line2">
                    {p.author_name ? `${p.author_name}` : ""}
                    {p.author_name && p.published_at ? " · " : ""}
                    {p.published_at
                      ? new Date(p.published_at).toLocaleDateString()
                      : ""}
                    {sub ? (
                      <>
                        {(p.author_name || p.published_at) && sub ? " · " : ""}
                        {sub}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

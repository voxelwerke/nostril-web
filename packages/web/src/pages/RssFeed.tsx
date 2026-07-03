import { useEffect, useState } from "preact/hooks";
import { getJson } from "../api.ts";
import { rssItemUri } from "@nostril/shared/uri-hash";
import type { RssFeed as Feed } from "@nostril/shared";
import { PostToolbar } from "../components/PostToolbar.tsx";

interface Item {
  feed_id: number;
  guid: string;
  title: string;
  content_text: string;
  link: string;
  published_at: string;
}

interface Data {
  feed: Feed;
  items: Item[];
}

export function RssFeed({ params }: { params: { id: string } }) {
  const { id } = params;
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [uris, setUris] = useState<Record<string, string>>({});

  useEffect(() => {
    setData(null);
    setError(false);
    setUris({});
    getJson<Data>(`/api/rss/feeds/${id}`)
      .then(setData)
      .catch(() => setError(true));
  }, [id]);

  useEffect(() => {
    if (!data) return;
    let ok = true;
    Promise.all(
      data.items.map(async (it) => [
        it.guid,
        await rssItemUri(it.link ?? null, data.feed.url, it.guid),
      ] as const),
    ).then((pairs) => {
      if (ok) setUris(Object.fromEntries(pairs));
    });
    return () => {
      ok = false;
    };
  }, [data]);

  if (error) return <p>Feed not found.</p>;
  if (!data) return <p class="muted">Loading...</p>;

  const { feed, items } = data;
  return (
    <>
      <h2>{feed.title || feed.url}</h2>
      {feed.site_url ? (
        <a href={feed.site_url} target="_blank" rel="noreferrer">
          {feed.site_url}
        </a>
      ) : null}
      {feed.description ? <p class="muted">{feed.description}</p> : null}
      <div>
        {items.map((item) => {
          const uri = uris[item.guid];
          return (
            <div class="post" key={item.guid}>
              <a href={item.link} target="_blank" rel="noreferrer">
                <strong>{item.title}</strong>
              </a>
              {item.content_text ? (
                <div class="snippet">{item.content_text}</div>
              ) : null}
              <div class="muted">
                {new Date(item.published_at).toLocaleDateString()}
              </div>
              {uri ? <PostToolbar uri={uri} /> : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

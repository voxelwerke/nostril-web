import { useEffect, useState } from "preact/hooks";
import { getJson } from "../api.ts";
import type { RssFeed as Feed } from "@nostril/shared";

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

  useEffect(() => {
    setData(null);
    setError(false);
    getJson<Data>(`/api/rss/feeds/${id}`)
      .then(setData)
      .catch(() => setError(true));
  }, [id]);

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
        {items.map((item) => (
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
          </div>
        ))}
      </div>
    </>
  );
}

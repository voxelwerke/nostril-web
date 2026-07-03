import { useEffect, useState } from "preact/hooks";
import { getJson } from "../api.ts";

interface Item {
  feed_id: number;
  guid: string;
  title: string;
  content: string;
  link: string;
  published_at: string;
}

export function RssItem({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setItem(null);
    setError(false);
    getJson<Item>(`/api/rss/items/${encodeURIComponent(id)}`)
      .then(setItem)
      .catch(() => setError(true));
  }, [id]);

  if (error) return <p>Item not found.</p>;
  if (!item) return <p class="muted">Loading...</p>;

  return (
    <>
      <h2>{item.title}</h2>
      <div class="muted">{new Date(item.published_at).toLocaleString()}</div>
      {item.link ? (
        <p>
          <a href={item.link} target="_blank" rel="noreferrer">
            Read original
          </a>
        </p>
      ) : null}
      {item.content ? (
        <div dangerouslySetInnerHTML={{ __html: item.content }} />
      ) : null}
    </>
  );
}

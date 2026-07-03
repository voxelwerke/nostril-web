import { useEffect, useState } from "preact/hooks";
import { getJson } from "../api.ts";
import type { DocSource } from "@nostril/shared";

interface Content {
  kind: "post" | "entity";
  uri: string;
  source: DocSource;
  title: string | null;
  body: string | null;
  author: string | null;
  url: string | null;
  image_url: string | null;
  published_at: string | null;
}

export function ContentPage({ params }: { params: { uri: string } }) {
  const uri = decodeURIComponent(params.uri);
  const [c, setC] = useState<Content | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setC(null);
    setError(false);
    getJson<Content>(`/api/c/${encodeURIComponent(uri)}`)
      .then(setC)
      .catch(() => setError(true));
  }, [uri]);

  if (error) return <p>Not found.</p>;
  if (!c) return <p class="muted">Loading...</p>;

  const label = c.title || c.author || c.uri;
  return (
    <>
      <div class="muted mono">{c.uri}</div>
      <h2>{label}</h2>
      {c.author && c.title ? <div class="muted">{c.author}</div> : null}
      {c.published_at ? (
        <div class="muted">{new Date(c.published_at).toLocaleString()}</div>
      ) : null}
      {c.url ? (
        <p>
          <a href={c.url} target="_blank" rel="noreferrer">
            Open original
          </a>
        </p>
      ) : null}
      {c.body ? <p class="content-body">{c.body}</p> : null}
    </>
  );
}

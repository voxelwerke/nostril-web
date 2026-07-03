import { useEffect, useState } from "preact/hooks";
import { getJson } from "../api.ts";
import { mUri } from "@nostril/shared";
import type { MastodonAccount as Account } from "@nostril/shared";
import { PostToolbar } from "../components/PostToolbar.tsx";

interface Status {
  id: string;
  content: string;
  content_text: string;
  url: string;
  created_at: string;
}

interface Data {
  account: Account;
  statuses: Status[];
}

export function MastodonAccount({
  params,
}: {
  params: { instance: string; acct: string };
}) {
  const { instance, acct } = params;
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setData(null);
    setError(false);
    getJson<Data>(`/api/mastodon/${instance}/users/${acct}`)
      .then(setData)
      .catch(() => setError(true));
  }, [instance, acct]);

  if (error) return <p>Account not found.</p>;
  if (!data) return <p class="muted">Loading...</p>;

  const { account, statuses } = data;
  return (
    <>
      <div class="profile-info">
        {account.avatar ? <img class="avatar" style="width:64px;height:64px" src={account.avatar} alt="" /> : null}
        <div>
          <h2>{account.display_name || account.acct}</h2>
          <div class="muted">
            @{account.acct}@{instance}
          </div>
          {account.note ? <div dangerouslySetInnerHTML={{ __html: account.note }} /> : null}
        </div>
      </div>
      <div>
        {statuses.map((s) => {
          const authorUri = mUri(account.id, instance);
          return (
            <div class="post" key={s.id}>
              <div dangerouslySetInnerHTML={{ __html: s.content }} />
              <a class="muted" href={s.url} target="_blank" rel="noreferrer">
                {new Date(s.created_at).toLocaleString()}
              </a>
              <PostToolbar
                uri={mUri(s.id, instance)}
                post={{
                  uri: mUri(s.id, instance),
                  author_uri: authorUri,
                  body: s.content_text,
                  published_at: s.created_at,
                  url: s.url,
                }}
                author={{
                  uri: authorUri,
                  name: account.display_name || account.acct,
                  image: account.avatar,
                }}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

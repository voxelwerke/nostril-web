import { useEffect, useState } from "preact/hooks";
import { nUri } from "@nostril/shared";
import { PostToolbar } from "../components/PostToolbar.tsx";

interface Profile {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  nip05?: string;
  pubkey?: string;
}

interface NostrEvent {
  id: string;
  kind: number;
  content: string;
  created_at: number;
}

export function NostrProfile({ params }: { params: { npub: string } }) {
  const { npub } = params;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setProfile(null);
    setEvents([]);
    setLoading(true);

    const es = new EventSource(`/api/nostr/users/${npub}/events`);

    es.addEventListener("event", (e) => {
      const ev = JSON.parse((e as MessageEvent).data) as NostrEvent & {
        pubkey: string;
      };
      if (ev.kind === 0) {
        try {
          setProfile({ ...JSON.parse(ev.content), pubkey: ev.pubkey });
        } catch {
          /* ignore */
        }
        return;
      }
      if (ev.kind === 1) {
        setEvents((prev) =>
          [...prev, ev].sort((a, b) => b.created_at - a.created_at),
        );
      }
    });

    es.addEventListener("done", () => {
      setLoading(false);
      es.close();
    });

    es.onerror = () => {
      setLoading(false);
      es.close();
    };

    return () => es.close();
  }, [npub]);

  const name = profile?.display_name || profile?.name || npub.slice(0, 16) + "...";

  return (
    <>
      {profile?.banner ? <img class="banner" src={profile.banner} alt="" /> : null}
      <div class="profile-info">
        {profile?.picture ? (
          <img
            class="avatar"
            style="width:64px;height:64px"
            src={profile.picture}
            alt=""
          />
        ) : null}
        <div>
          <h2>{name}</h2>
          {profile?.nip05 ? <div class="muted">{profile.nip05}</div> : null}
          {profile?.about ? <p>{profile.about}</p> : null}
        </div>
      </div>

      {loading ? <p class="muted">Loading notes...</p> : null}

      <div>
        {events.map((ev) => {
          const authorUri = profile?.pubkey ? nUri(profile.pubkey) : undefined;
          return (
            <div class="post" key={ev.id}>
              {ev.content}
              <div class="muted">
                {new Date(ev.created_at * 1000).toLocaleString()}
              </div>
              <PostToolbar
                uri={nUri(ev.id)}
                post={{
                  uri: nUri(ev.id),
                  author_uri: authorUri,
                  body: ev.content,
                  published_at: new Date(ev.created_at * 1000).toISOString(),
                }}
                author={
                  authorUri
                    ? { uri: authorUri, name, image: profile?.picture }
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

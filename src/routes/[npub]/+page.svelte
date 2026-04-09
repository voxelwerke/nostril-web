<script lang="ts">
    import { page } from "$app/state";
    import { nip19 } from "nostr-tools";

    let profile = $state<any>(null);
    let events = $state<any[]>([]);
    let friends = $state<{ pubkey: string; npub: string }[]>([]);
    let loading = $state(true);

    const IMG_RE = /https?:\/\/\S+\.(?:jpe?g|png|gif|webp|svg)(?:\?\S*)?/gi;

    $effect(() => {
        const npub = page.params.npub;
        if (!npub?.startsWith("npub")) return;

        profile = null;
        events = [];
        friends = [];
        loading = true;

        const es = new EventSource(`/api/account/${npub}`);

        es.addEventListener("event", (e) => {
            const ev = JSON.parse(e.data);

            // Skip reactions
            if (ev.kind === 7) return;

            if (ev.kind === 0) {
                try {
                    profile = { ...JSON.parse(ev.content), pubkey: ev.pubkey };
                } catch {}
            }

            // Extract follow list
            if (ev.kind === 3) {
                friends = (ev.tags || [])
                    .filter((t: string[]) => t[0] === "p" && t[1]?.length === 64)
                    .map((t: string[]) => ({
                        pubkey: t[1],
                        npub: nip19.npubEncode(t[1]),
                    }));
            }

            events = [...events, ev].sort(
                (a, b) => b.created_at - a.created_at,
            );
        });

        es.addEventListener("done", () => {
            loading = false;
            es.close();
        });

        es.onerror = () => {
            loading = false;
            es.close();
        };

        return () => es.close();
    });

    function kindLabel(kind: number): string {
        switch (kind) {
            case 0: return "profile";
            case 1: return "note";
            case 3: return "follows";
            case 6: return "repost";
            default: return `kind:${kind}`;
        }
    }

    function formatDate(ts: number): string {
        return new Date(ts * 1000).toLocaleString();
    }

    // Filter out kind 7 (reactions) and kind 3 (follows) from the event table
    let displayEvents = $derived(events.filter((ev) => ev.kind !== 3 && ev.kind !== 7));
</script>

{#if profile}
    <div class="profile-header">
        {#if profile.banner}
            <img src={profile.banner} alt="" class="banner" />
        {/if}
        <div class="profile-info">
            {#if profile.picture}
                <img
                    src={profile.picture}
                    alt=""
                    width="64"
                    height="64"
                    style="border-radius: 8px;"
                />
            {/if}
            <div>
                <h1>
                    {profile.display_name ||
                        profile.name ||
                        profile.pubkey?.slice(0, 12)}
                </h1>
                {#if profile.nip05}<p>{profile.nip05}</p>{/if}
                {#if profile.about}<p>{profile.about}</p>{/if}
            </div>
        </div>
    </div>
{:else if !loading}
    <h1>{page.params.npub.slice(0, 16)}...</h1>
{/if}

{#if loading && events.length == 0}
    <p>Loading events...</p>
{/if}

{#if friends.length > 0}
    <details>
        <summary>Following ({friends.length})</summary>
        <ul class="friends">
            {#each friends as f (f.pubkey)}
                <li><a href="/{f.npub}">{f.pubkey.slice(0, 12)}...</a></li>
            {/each}
        </ul>
    </details>
{/if}

<table>
    <thead>
        <tr>
            <th>type</th>
            <th>time</th>
            <th>content</th>
        </tr>
    </thead>
    <tbody>
        {#each displayEvents as ev (ev.id)}
            <tr>
                <td>{kindLabel(ev.kind)}</td>
                <td>{formatDate(ev.created_at)}</td>
                <td>
                    {#each (ev.content ?? "").split(IMG_RE) as segment, i}
                        {segment}
                        {#if i < (ev.content?.match(IMG_RE) ?? []).length}
                            {@const url = ev.content.match(IMG_RE)[i]}
                            <br /><img src={url} alt="" class="inline-img" /><br />
                        {/if}
                    {/each}
                </td>
            </tr>
        {/each}
    </tbody>
</table>

<style>
    .banner {
        width: 100%;
        max-height: 200px;
        object-fit: cover;
    }
    .profile-info {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
        margin: 1rem 0;
    }
    .friends {
        column-count: 3;
        list-style: none;
        padding: 0;
    }
    .friends li {
        padding: 0.1rem 0;
    }
    .inline-img {
        max-width: 300px;
        max-height: 300px;
        border-radius: 4px;
        margin: 0.25rem 0;
    }
    table {
        width: 100%;
    }
    td {
        border-bottom: 1px solid var(--void);
        max-width: 30rem;
        overflow: hidden;
        white-space: pre-wrap;
        word-break: break-word;
    }
</style>

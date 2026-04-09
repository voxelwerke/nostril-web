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

            if (ev.kind === 7) return;

            if (ev.kind === 0) {
                try {
                    profile = { ...JSON.parse(ev.content), pubkey: ev.pubkey };
                } catch {}
            }

            if (ev.kind === 3) {
                friends = (ev.tags || [])
                    .filter(
                        (t: string[]) => t[0] === "p" && t[1]?.length === 64,
                    )
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

    function formatDate(ts: number): string {
        return new Date(ts * 1000).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }

    let displayName = $derived(
        profile?.display_name || profile?.name || page.params.npub.slice(0, 16),
    );

    let shortNpub = $derived(page.params.npub.slice(0, 16) + "...");

    let displayEvents = $derived(
        events.filter((ev) => ev.kind !== 0 && ev.kind !== 3 && ev.kind !== 7),
    );
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
                <h1>{displayName}</h1>
                {#if profile.nip05}<p>{profile.nip05}</p>{/if}
                {#if profile.about}<p>{profile.about}</p>{/if}
            </div>
        </div>
    </div>
{:else if !loading}
    <h1>{shortNpub}</h1>
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

<section class="posts">
    {#each displayEvents as ev (ev.id)}
        <div class="post">
            <img src="about:." alt="" class="avatar" />
            <div class="post-body">
                <cite
                    >{displayName} <span class="npub">{shortNpub}</span>
                    &middot; {formatDate(ev.created_at)}</cite
                >
                <article>
                    {#each (ev.content ?? "").split(IMG_RE) as segment, i}
                        {segment}
                        {#if i < (ev.content?.match(IMG_RE) ?? []).length}
                            {@const url = ev.content.match(IMG_RE)[i]}
                            <br /><img src={url} alt="" class="inline-img" /><br
                            />
                        {/if}
                    {/each}
                </article>
            </div>
        </div>
    {/each}
</section>

<style>
    .banner {
        width: 100%;
        max-height: 200px;
        object-fit: cover;
    }
    .profile-header {
        margin-bottom: 1.5rem;
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
    .posts {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .post {
        display: flex;
        flex-direction: row;
        gap: 1rem;
    }
    .avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        flex-shrink: 0;
    }
    .post-body {
        min-width: 0;
    }
    cite {
        font-style: normal;
        font-weight: bold;
    }
    .npub {
        font-weight: normal;
        opacity: 0.5;
    }
    article {
        margin-top: 0.25rem;
        white-space: pre-wrap;
        word-break: break-word;
    }
    .inline-img {
        max-width: 300px;
        max-height: 300px;
        border-radius: 4px;
        margin: 0.25rem 0;
    }
</style>

<script lang="ts">
    import { page } from "$app/state";

    let profile = $state<any>(null);
    let events = $state<any[]>([]);
    let loading = $state(true);

    $effect(() => {
        const npub = page.params.npub;
        if (!npub?.startsWith("npub")) return;

        profile = null;
        events = [];
        loading = true;

        const es = new EventSource(`/api/account/${npub}`);

        es.addEventListener("event", (e) => {
            const ev = JSON.parse(e.data);
            if (ev.kind === 0) {
                try {
                    profile = { ...JSON.parse(ev.content), pubkey: ev.pubkey };
                } catch {}
            }
            events = [...events, ev].sort((a, b) => b.created_at - a.created_at);
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
            case 7: return "reaction";
            default: return `kind:${kind}`;
        }
    }

    function formatDate(ts: number): string {
        return new Date(ts * 1000).toLocaleString();
    }
</script>

{#if profile}
    <div class="profile-header">
        {#if profile.banner}
            <img src={profile.banner} alt="" class="banner" />
        {/if}
        <div class="profile-info">
            {#if profile.picture}
                <img src={profile.picture} alt="" width="64" height="64" style="border-radius: 8px;" />
            {/if}
            <div>
                <h1>{profile.display_name || profile.name || profile.pubkey?.slice(0, 12)}</h1>
                {#if profile.nip05}<p>{profile.nip05}</p>{/if}
                {#if profile.about}<p>{profile.about}</p>{/if}
            </div>
        </div>
    </div>
{:else if !loading}
    <h1>{page.params.npub.slice(0, 16)}...</h1>
{/if}

{#if loading}
    <p>Loading events...</p>
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
        {#each events as ev (ev.id)}
            <tr>
                <td>{kindLabel(ev.kind)}</td>
                <td>{formatDate(ev.created_at)}</td>
                <td title={ev.content}>{ev.content?.slice(0, 120) ?? ""}</td>
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
    table { width: 100%; }
    td {
        border-bottom: 1px solid var(--void);
        max-width: 30rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>

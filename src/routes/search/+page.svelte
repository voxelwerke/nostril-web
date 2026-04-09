<script lang="ts">
    import { page } from "$app/state";
    import { goto } from "$app/navigation";
    import { nip19 } from "nostr-tools";

    // The URL is the source of truth for 'q'
    let q = $state(page.url.searchParams.get("q") ?? "");

    // Use a derived resource or just handle the fetch reactively
    // For simplicity in a single file, we'll use a local state for results
    let results = $state<any[]>([]);
    let searching = $state(false);

    async function performSearch(query: string) {
        if (!query.trim()) {
            results = [];
            return;
        }
        searching = true;
        try {
            const res = await fetch(
                `/api/search/accounts?q=${encodeURIComponent(query)}`,
            );
            results = await res.json();
        } finally {
            searching = false;
        }
    }

    // React to URL changes automatically without manual $effect logic
    $effect(() => {
        const queryParam = page.url.searchParams.get("q") ?? "";
        q = queryParam;
        performSearch(queryParam);
    });

    function handleSubmit(e: Event) {
        e.preventDefault();
        // Update the URL; the $effect above will handle the actual fetch
        const url = new URL(page.url);
        if (q) {
            url.searchParams.set("q", q);
        } else {
            url.searchParams.delete("q");
        }
        goto(url.toString(), { keepFocus: true, replaceState: true });
    }
</script>

<main>
    <h1>Search</h1>

    <form onsubmit={handleSubmit}>
        <input
            bind:value={q}
            name="q"
            placeholder="search accounts..."
            autofocus
        />
        <button type="submit" disabled={searching}>
            {searching ? "..." : "Go"}
        </button>
    </form>

    {#if results.length > 0}
        <table>
            <thead>
                <tr>
                    <th>pic</th>
                    <th>name</th>
                    <th>nip05</th>
                    <th>followers</th>
                    <th>following</th>
                    <th>about</th>
                </tr>
            </thead>
            <tbody>
                {#each results as u (u.pubkey)}
                    <tr>
                        <td>
                            {#if u.picture}
                                <img
                                    src={u.picture}
                                    width="32"
                                    height="32"
                                    alt=""
                                    style="border-radius: 4px;"
                                />
                            {/if}
                        </td>
                        <td
                            ><a href="/{nip19.npubEncode(u.pubkey)}">{u.display_name ||
                                u.name ||
                                u.pubkey.slice(0, 8)}</a></td
                        >
                        <td>{u.nip05 ?? ""}</td>
                        <td>{u.follower_count}</td>
                        <td>{u.following_count}</td>
                        <td title={u.about}>{u.about?.slice(0, 80) ?? ""}</td>
                    </tr>
                {/each}
            </tbody>
        </table>
    {:else if q && !searching}
        <p>No accounts found.</p>
    {/if}
</main>

<style>
    table {
        width: 100%;
    }
    td {
        border-bottom: 1px solid var(--void);
        min-width: 0;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        max-width: 10rem;
    }
</style>

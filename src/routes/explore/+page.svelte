<script lang="ts">
  let query = $state("");

  const notes = [
    {
      id: 1,
      name: "fiatjaf",
      handle: "fiatjaf@nostr.com",
      content: "nostr is the social protocol that doesn't want to be owned by anyone. that's the whole point.",
      time: "2m",
      likes: 42,
      reposts: 11,
    },
    {
      id: 2,
      name: "jack",
      handle: "jack@nostr.social",
      content: "why are we still building centralized chat apps in 2025",
      time: "14m",
      likes: 128,
      reposts: 34,
    },
    {
      id: 3,
      name: "jb55",
      handle: "jb55@jb55.com",
      content: "damus shipped another update. nostr clients keep getting better every week.",
      time: "1h",
      likes: 77,
      reposts: 9,
    },
    {
      id: 4,
      name: "pablof7z",
      handle: "pablof7z@nostr1.com",
      content: "NIP-90 is underrated. the data vending machine model unlocks a whole new class of nostr apps.",
      time: "2h",
      likes: 53,
      reposts: 14,
    },
    {
      id: 5,
      name: "odell",
      handle: "odell@odell.fyi",
      content: "decentralized social is not a feature. it's the foundation.",
      time: "3h",
      likes: 211,
      reposts: 62,
    },
    {
      id: 6,
      name: "kieran",
      handle: "kieran@snort.social",
      content: "snort.social just crossed 50k monthly active users. the nostr ecosystem is growing fast.",
      time: "5h",
      likes: 95,
      reposts: 23,
    },
  ];

  const topics = ["#nostr", "#bitcoin", "#zaps", "#decentralized", "#privacy", "#openprotocol", "#damus"];

  let filtered = $derived(
    query.trim()
      ? notes.filter(
          (n) =>
            n.content.toLowerCase().includes(query.toLowerCase()) ||
            n.name.toLowerCase().includes(query.toLowerCase())
        )
      : notes
  );
</script>

<main>
  <nav>
    <a href="/">← Nostril!</a>
    <h2>Explore</h2>
  </nav>

  <div class="search-wrap">
    <input
      type="search"
      placeholder="Search notes, people…"
      bind:value={query}
    />
  </div>

  <section class="topics">
    {#each topics as topic}
      <button
        class="topic"
        onclick={() => (query = topic.slice(1))}
      >{topic}</button>
    {/each}
  </section>

  <section class="feed">
    {#if filtered.length === 0}
      <p class="empty">No notes found.</p>
    {:else}
      {#each filtered as note (note.id)}
        <article class="note">
          <div class="avatar">{note.name[0].toUpperCase()}</div>
          <div class="body">
            <header>
              <span class="name">{note.name}</span>
              <span class="handle">{note.handle}</span>
              <span class="time">{note.time}</span>
            </header>
            <p>{note.content}</p>
            <footer>
              <span class="action">♡ {note.likes}</span>
              <span class="action">↺ {note.reposts}</span>
              <span class="action zap">⚡ zap</span>
            </footer>
          </div>
        </article>
      {/each}
    {/if}
  </section>
</main>

<style>
  nav {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    margin-bottom: 1.5rem;

    a {
      color: var(--laser);
      text-decoration: none;
      font-size: 0.9rem;
      white-space: nowrap;
    }

    h2 {
      margin: 0;
    }
  }

  .search-wrap {
    margin-bottom: 1rem;
  }

  .topics {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .topic {
    background: var(--void);
    color: var(--acid);
    border: 1px solid color-mix(in srgb, var(--acid) 30%, transparent);
    border-radius: 999px;
    padding: 0.2rem 0.75rem;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.15s;

    &:hover {
      background: color-mix(in srgb, var(--acid) 15%, transparent);
    }
  }

  .feed {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .note {
    display: flex;
    gap: 0.75rem;
    padding: 1rem 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);

    &:last-child {
      border-bottom: none;
    }
  }

  .avatar {
    flex-shrink: 0;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--chill), var(--laser));
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 1rem;
    color: var(--read);
  }

  .body {
    flex: 1;
    min-width: 0;

    p {
      margin: 0.25rem 0 0.5rem;
      line-height: 1.5;
    }
  }

  header {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    flex-wrap: wrap;
  }

  .name {
    font-weight: 700;
    color: var(--read);
  }

  .handle {
    font-size: 0.8rem;
    opacity: 0.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .time {
    font-size: 0.8rem;
    opacity: 0.4;
    margin-left: auto;
    white-space: nowrap;
  }

  footer {
    display: flex;
    gap: 1.25rem;
  }

  .action {
    font-size: 0.85rem;
    opacity: 0.5;
    cursor: pointer;
    transition: opacity 0.15s;

    &:hover {
      opacity: 1;
    }
  }

  .zap {
    color: var(--acid);
  }

  .empty {
    opacity: 0.4;
    text-align: center;
    padding: 3rem 0;
  }
</style>

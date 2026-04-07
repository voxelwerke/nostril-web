<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  interface NostrEvent {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    content: string;
    tags: string[][];
    sig: string;
  }

  const RELAY = 'wss://relay.damus.io';
  const MAX = 500;

  let events = $state<NostrEvent[]>([]);
  let status = $state<'connecting' | 'open' | 'error' | 'closed'>('connecting');
  let total = $state(0);
  let ws: WebSocket | null = null;

  function connect() {
    ws = new WebSocket(RELAY);

    ws.addEventListener('open', () => {
      status = 'open';
      ws!.send(JSON.stringify(['REQ', 'feed', { kinds: [1], limit: 100 }]));
    });

    ws.addEventListener('message', (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (Array.isArray(msg) && msg[0] === 'EVENT' && msg[2]?.kind === 1) {
          const ev = msg[2] as NostrEvent;
          total++;
          events = [ev, ...events].slice(0, MAX);
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.addEventListener('error', () => { status = 'error'; });
    ws.addEventListener('close', () => { status = 'closed'; });
  }

  onMount(connect);
  onDestroy(() => ws?.close());

  function age(ts: number): string {
    const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }

  function clean(content: string): string {
    return content.replace(/[\n\r\t]+/g, ' ').trim();
  }
</script>

<svelte:head>
  <title>nostril://browser</title>
</svelte:head>

<div class="shell">
  <header>
    <span class="site">nostril://browser</span>
    <span class="sep">|</span>
    <span class="relay">{RELAY}</span>
    <span class="sep">|</span>
    <span class="st" class:open={status === 'open'} class:err={status === 'error' || status === 'closed'}>{status}</span>
    <span class="cnt">{total} events</span>
  </header>
  <div class="col-head">
    <span class="c-pk">pubkey</span>
    <span class="c-age">age</span>
    <span class="c-body">content</span>
  </div>
  <div class="feed">
    {#if events.length === 0}
      <div class="row dim">
        {#if status === 'connecting'}connecting to {RELAY}…{:else if status === 'open'}subscribed — waiting for events…{:else}{status}{/if}
      </div>
    {/if}
    {#each events as ev (ev.id)}
      <div class="row">
        <span class="c-pk">{ev.pubkey.slice(0, 8)}</span>
        <span class="c-age">{age(ev.created_at)}</span>
        <span class="c-body">{clean(ev.content)}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  :global(body) {
    background: #000 !important;
    overflow: hidden;
    margin: 0;
    padding: 0;
  }

  .shell {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: #000;
    color: #b0b0b0;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    line-height: 1.35;
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.75ch;
    padding: 2px 6px;
    background: #0d0d0d;
    border-bottom: 1px solid #1f1f1f;
    flex-shrink: 0;
    white-space: nowrap;
    overflow: hidden;
  }

  .site  { color: #e4ff30; font-weight: bold; letter-spacing: 0.03em; }
  .relay { color: #3a3a3a; font-size: 11px; }
  .sep   { color: #222; }
  .cnt   { color: #3a3a3a; margin-left: auto; }

  .st       { color: #555; }
  .st.open  { color: #4caf50; }
  .st.err   { color: #e44; }

  .col-head {
    display: flex;
    gap: 1ch;
    padding: 1px 6px;
    background: #060606;
    border-bottom: 1px solid #161616;
    color: #2a2a2a;
    font-family: 'Courier New', Courier, monospace;
    font-size: 10px;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .feed {
    flex: 1;
    overflow-y: scroll;
    overflow-x: hidden;
  }

  .feed::-webkit-scrollbar       { width: 3px; }
  .feed::-webkit-scrollbar-track { background: #000; }
  .feed::-webkit-scrollbar-thumb { background: #1e1e1e; }

  .row {
    display: flex;
    gap: 1ch;
    padding: 0 6px;
    border-bottom: 1px solid #0a0a0a;
    min-height: 15px;
    align-items: baseline;
    white-space: nowrap;
    overflow: hidden;
  }

  .row:hover { background: #0d0d0d; }
  .row.dim   { color: #282828; font-style: italic; }

  .c-pk {
    color: #e4ff30;
    flex-shrink: 0;
    width: 8ch;
    overflow: hidden;
  }

  .c-age {
    color: #444;
    flex-shrink: 0;
    width: 4ch;
    text-align: right;
  }

  .c-body {
    color: #b0b0b0;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .col-head .c-pk  { color: #2a2a2a; width: 8ch; }
  .col-head .c-age { color: #2a2a2a; width: 4ch; text-align: right; }
  .col-head .c-body { color: #2a2a2a; }
</style>

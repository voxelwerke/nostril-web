<script lang="ts">
	import '@fontsource-variable/bricolage-grotesque';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { goto } from '$app/navigation';

	let { children } = $props();

	let q = $state('');

	function search(e: SubmitEvent) {
		e.preventDefault();
		if (q.trim()) goto(`/search?q=${encodeURIComponent(q)}`);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header>
	<a href="/">nostril</a>
	<form onsubmit={search}>
		<input bind:value={q} placeholder="search accounts..." />
		<button type="submit">Search</button>
	</form>
</header>

{@render children()}

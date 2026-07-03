import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalUrl,
  hashCanonical,
  rUri,
  rssItemUri,
} from "./uri-hash.ts";
import { mUri, nUri, parseUri } from "./uri.ts";

test("canonicalUrl normalizes host, scheme, fragment, trailing slash", () => {
  assert.equal(
    canonicalUrl("HTTP://Example.com/path/#frag"),
    "https://example.com/path",
  );
  assert.equal(canonicalUrl("https://x.com/a/"), "https://x.com/a");
  assert.equal(canonicalUrl("https://x.com/"), "https://x.com/");
});

test("rUri is stable for the same canonical url", async () => {
  const a = await rUri(canonicalUrl("https://example.com/post"));
  const b = await rUri(canonicalUrl("https://example.com/post/"));
  assert.equal(a, b);
  assert.match(a, /^r:[0-9a-f]{32}$/);
});

test("nUri lowercases hex ids", () => {
  const id = "A".repeat(64);
  assert.equal(nUri(id), `n:${"a".repeat(64)}`);
});

test("mUri lowercases host", () => {
  assert.equal(mUri("123", "Mastodon.NZ"), "m:123@mastodon.nz");
});

test("rssItemUri uses link when present", async () => {
  const u = await rssItemUri("https://blog.test/a", "https://feed.test/rss", "g1");
  assert.equal(u, await rUri(canonicalUrl("https://blog.test/a")));
});

test("rssItemUri falls back to feed url + guid", async () => {
  const u = await rssItemUri(null, "https://feed.test/rss", "g1");
  assert.equal(u, await rUri(`${canonicalUrl("https://feed.test/rss")}\0g1`));
});

test("parseUri round-trips builders", async () => {
  assert.deepEqual(parseUri(nUri("ab".repeat(32))), {
    scheme: "n",
    id: "ab".repeat(32),
  });
  assert.deepEqual(parseUri(mUri("99", "mastodon.nz")), {
    scheme: "m",
    id: "99",
    host: "mastodon.nz",
  });
  const h = await hashCanonical("x");
  assert.deepEqual(parseUri(`r:${h}`), { scheme: "r", hash: h });
});

test("hashCanonical is 32 hex chars", async () => {
  assert.match(await hashCanonical("hello"), /^[0-9a-f]{32}$/);
});

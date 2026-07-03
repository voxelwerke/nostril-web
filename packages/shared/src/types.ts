export type EntitySource = "nostr_user" | "mastodon_account" | "rss_feed";
export type PostSource = "nostr_note" | "mastodon_status" | "rss_item";
export type DocSource = EntitySource | PostSource;

export interface SearchResult {
  uri: string | null;
  source: DocSource;
  source_key: string;
  title: string | null;
  body: string | null;
  author: string | null;
  url: string | null;
  image_url: string | null;
  published_at: string | null;
  meta: Record<string, unknown> | null;
  rank: number;
}

export interface NostrUser {
  pubkey: string;
  name: string | null;
  display_name: string | null;
  about: string | null;
  picture: string | null;
  banner: string | null;
  website: string | null;
  nip05: string | null;
  lud16: string | null;
  follower_count: number;
  following_count: number;
}

export interface MastodonAccount {
  instance: string;
  id: string;
  acct: string;
  display_name: string | null;
  note: string | null;
  avatar: string | null;
  url: string | null;
  followers_count: number;
  following_count: number;
}

export interface RssFeed {
  id: number;
  url: string;
  title: string | null;
  site_url: string | null;
  description: string | null;
}

export interface RssItem {
  feed_id: number;
  guid: string;
  title: string | null;
  content: string | null;
  link: string | null;
  published_at: string;
}

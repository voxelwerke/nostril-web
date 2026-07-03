import { createHash } from "node:crypto";

export function canonicalUrl(raw: string): string {
  const u = new URL(raw.trim());
  if (u.protocol === "http:") u.protocol = "https:";
  u.hostname = u.hostname.toLowerCase();
  u.hash = "";
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }
  return u.toString();
}

export function hashCanonical(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 32);
}

export function rUri(canonical: string): string {
  return `r:${hashCanonical(canonical)}`;
}

export function rssItemUri(
  link: string | null,
  feedUrl: string,
  guid: string,
): string {
  if (link) return rUri(canonicalUrl(link));
  return rUri(`${canonicalUrl(feedUrl)}\0${guid}`);
}

export function rssFeedUri(feedUrl: string): string {
  return rUri(canonicalUrl(feedUrl));
}

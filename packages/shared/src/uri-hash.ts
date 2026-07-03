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

export async function hashCanonical(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function rUri(canonical: string): Promise<string> {
  return `r:${await hashCanonical(canonical)}`;
}

export async function rssItemUri(
  link: string | null,
  feedUrl: string,
  guid: string,
): Promise<string> {
  if (link) return rUri(canonicalUrl(link));
  return rUri(`${canonicalUrl(feedUrl)}\0${guid}`);
}

export async function rssFeedUri(feedUrl: string): Promise<string> {
  return rUri(canonicalUrl(feedUrl));
}

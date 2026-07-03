export type UriScheme = "n" | "m" | "r";

export function nUri(id: string): string {
  return `n:${id.toLowerCase()}`;
}

export function mUri(id: string, host: string): string {
  return `m:${id}@${host.toLowerCase()}`;
}

export function encodeUriPath(uri: string): string {
  return encodeURIComponent(uri);
}

export function decodeUriPath(encoded: string): string {
  return decodeURIComponent(encoded);
}

export type ParsedUri =
  | { scheme: "n"; id: string }
  | { scheme: "m"; id: string; host: string }
  | { scheme: "r"; hash: string };

export function parseUri(s: string): ParsedUri | null {
  const m = s.match(/^(n|m|r):(.+)$/);
  if (!m) return null;
  const scheme = m[1] as UriScheme;
  const rest = m[2]!;
  if (scheme === "n") return { scheme: "n", id: rest };
  if (scheme === "r") return { scheme: "r", hash: rest };
  const at = rest.lastIndexOf("@");
  if (at < 1) return null;
  return { scheme: "m", id: rest.slice(0, at), host: rest.slice(at + 1) };
}

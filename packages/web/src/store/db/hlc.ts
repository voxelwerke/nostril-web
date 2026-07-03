import { siteId } from "./site.ts";

// Seconds since epoch in the high bits, site_id in the low 24.
// Millis << 24 overflows SQLite's 64-bit INTEGER by ~2026.
export function nowHlc(): number {
  return (Math.floor(Date.now() / 1000) << 24) | siteId();
}

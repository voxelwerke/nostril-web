const KEY = "nostril.site_id";

let cached: number | null = null;

export function siteId(): number {
  if (cached !== null) return cached;
  let raw = localStorage.getItem(KEY);
  if (!raw) {
    raw = String(Math.floor(Math.random() * 0x1000000));
    localStorage.setItem(KEY, raw);
  }
  cached = Number(raw) & 0xffffff;
  return cached;
}

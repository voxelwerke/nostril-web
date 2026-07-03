import { nip19 } from "nostr-tools";

export function npubToHex(npub: string): string | null {
  try {
    const { type, data } = nip19.decode(npub);
    if (type !== "npub") return null;
    return data as string;
  } catch {
    return null;
  }
}

export function hexToNpub(hex: string): string {
  return nip19.npubEncode(hex);
}

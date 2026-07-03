import { signal } from "@preact/signals";

// null = not yet initialized, true = persistent OPFS, false = in-memory only
export const storageOk = signal<boolean | null>(null);

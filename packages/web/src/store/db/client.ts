import { nowHlc } from "./hlc.ts";
import { storageOk } from "./status.ts";
import type { AuthorSnap, LikedPost, PostSnap, ToggleTable } from "./types.ts";

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function rpc(type: string, payload?: Record<string, unknown>): Promise<unknown> {
  if (!worker) return Promise.reject(new Error("db not initialized"));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, type, payload });
  });
}

export async function initDb(): Promise<void> {
  if (worker) return;
  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent) => {
    const { id, ok, result, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (ok) p.resolve(result);
    else p.reject(new Error(error));
  };
  const res = (await rpc("init")) as { persistent: boolean };
  storageOk.value = res.persistent;
}

export async function getActive(table: ToggleTable, targetId: string): Promise<boolean> {
  const row = (await rpc("get", { table, targetId })) as { active: number } | null;
  return row?.active === 1;
}

export function setActive(table: ToggleTable, targetId: string, active: boolean): void {
  void rpc("set", { table, targetId, active: active ? 1 : 0, hlc: nowHlc() });
}

export async function getReaction(targetId: string): Promise<number> {
  const row = (await rpc("getReaction", { targetId })) as { value: number } | null;
  return row?.value ?? 0;
}

export function setReaction(targetId: string, value: number): void {
  void rpc("setReaction", { targetId, value, hlc: nowHlc() });
}

export function upsertPost(post: PostSnap): void {
  void rpc("upsertPost", { post, hlc: nowHlc() });
}

export function upsertAuthor(author: AuthorSnap): void {
  void rpc("upsertAuthor", { author, hlc: nowHlc() });
}

export async function listLikes(): Promise<LikedPost[]> {
  return (await rpc("listLikes")) as LikedPost[];
}

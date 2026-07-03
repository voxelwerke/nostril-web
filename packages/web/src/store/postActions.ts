import { signal, type Signal } from "@preact/signals";
import {
  getActive,
  getReaction,
  setActive,
  setReaction,
  upsertAuthor,
  upsertPost,
} from "./db/client.ts";
import { REACTION } from "./db/types.ts";
import type { AuthorSnap, PostSnap, ToggleTable } from "./db/types.ts";

export type Action = "like" | "follow" | "repost" | "dislike" | "block" | "report";

export interface Flags {
  like: boolean;
  follow: boolean;
  repost: boolean;
  dislike: boolean;
  block: boolean;
  report: boolean;
}

export interface ToggleCtx {
  post?: PostSnap;
  author?: AuthorSnap;
}

const store = new Map<string, Signal<Flags>>();
const authors = new Map<string, string>();
const hydrated = new Set<string>();

function empty(): Flags {
  return {
    like: false,
    follow: false,
    repost: false,
    dislike: false,
    block: false,
    report: false,
  };
}

async function hydrate(uri: string, s: Signal<Flags>, authorUri?: string) {
  const reaction = await getReaction(uri);
  const [follow, block] = authorUri
    ? await Promise.all([getActive("follows", authorUri), getActive("blocks", authorUri)])
    : [false, false];
  s.value = {
    ...s.value,
    like: reaction === REACTION.like,
    dislike: reaction === REACTION.dislike,
    follow,
    block,
  };
}

export function getFlags(uri: string, authorUri?: string): Signal<Flags> {
  let s = store.get(uri);
  if (!s) {
    s = signal(empty());
    store.set(uri, s);
  }
  if (authorUri) authors.set(uri, authorUri);
  if (!hydrated.has(uri)) {
    hydrated.add(uri);
    void hydrate(uri, s, authorUri ?? authors.get(uri));
  }
  return s;
}

const AUTHOR_TABLE: Partial<Record<Action, ToggleTable>> = {
  follow: "follows",
  block: "blocks",
};

function persist(uri: string, before: Flags, after: Flags, ctx?: ToggleCtx) {
  const authorUri = ctx?.author?.uri ?? authors.get(uri);
  if (ctx?.post) upsertPost(ctx.post);
  if (ctx?.author) {
    authors.set(uri, ctx.author.uri);
    upsertAuthor(ctx.author);
  }

  if (before.like !== after.like || before.dislike !== after.dislike) {
    const value = after.like
      ? REACTION.like
      : after.dislike
        ? REACTION.dislike
        : REACTION.none;
    setReaction(uri, value);
  }

  if (authorUri) {
    for (const [action, table] of Object.entries(AUTHOR_TABLE) as [Action, ToggleTable][]) {
      if (before[action] !== after[action]) setActive(table, authorUri, after[action]);
    }
  }
}

export function toggle(uri: string, action: Action, ctx?: ToggleCtx): void {
  if (action === "repost") return;

  const s = getFlags(uri, ctx?.author?.uri);
  const before = s.value;
  const f = { ...before };
  const on = !f[action];
  f[action] = on;

  switch (action) {
    case "like":
      if (on) {
        f.dislike = f.block = f.report = false;
      } else {
        f.follow = f.repost = false;
      }
      break;
    case "follow":
      if (!on) f.repost = false;
      break;
    case "dislike":
      if (on) {
        f.like = f.follow = f.repost = false;
      } else {
        f.block = f.report = false;
      }
      break;
    case "block":
      if (!on) f.report = false;
      break;
  }

  s.value = f;
  if (action !== "report") persist(uri, before, f, ctx);
}

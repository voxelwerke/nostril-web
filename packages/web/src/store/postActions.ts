import { signal, type Signal } from "@preact/signals";

export type Action = "like" | "follow" | "repost" | "dislike" | "block" | "report";

export interface Flags {
  like: boolean;
  follow: boolean;
  repost: boolean;
  dislike: boolean;
  block: boolean;
  report: boolean;
}

const store = new Map<string, Signal<Flags>>();

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

export function getFlags(uri: string): Signal<Flags> {
  let s = store.get(uri);
  if (!s) {
    s = signal(empty());
    store.set(uri, s);
  }
  return s;
}

export function toggle(uri: string, action: Action): void {
  const s = getFlags(uri);
  const f = { ...s.value };
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
}

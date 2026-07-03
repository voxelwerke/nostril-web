import { type Action, getFlags, toggle } from "../store/postActions.ts";
import type { AuthorSnap, PostSnap } from "../store/db/types.ts";

export function PostToolbar({
  uri,
  post,
  author,
}: {
  uri: string;
  post?: PostSnap;
  author?: AuthorSnap;
}) {
  const f = getFlags(uri, author?.uri).value;
  const ctx = { post, author };

  const btn = (action: Action, on: boolean) => (
    <button type="button" aria-pressed={on} onClick={() => toggle(uri, action, ctx)}>
      {action}
    </button>
  );

  return (
    <menu type="toolbar">
      {f.follow ? btn("repost", f.repost) : null}
      {f.like ? btn("follow", f.follow) : null}
      {btn("like", f.like)}
      {btn("dislike", f.dislike)}
      {f.dislike ? btn("block", f.block) : null}
      {f.block ? btn("report", f.report) : null}
    </menu>
  );
}

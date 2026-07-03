import { type Action, getFlags, toggle } from "../store/postActions.ts";

export function PostToolbar({ uri }: { uri: string }) {
  const f = getFlags(uri).value;

  const btn = (action: Action, on: boolean) => (
    <button type="button" aria-pressed={on} onClick={() => toggle(uri, action)}>
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

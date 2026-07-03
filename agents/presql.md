# presql-sync: how the merge works

No op log. No CRDT library. Multi-writer sqlite that merges by attaching
two files together and running one upsert per table. That's the whole system.

presql-sync is the name for this pattern as used across nostril: a client
app running sqlite locally, syncing against a server-held sqlite file per
user, with no server-side merge logic beyond "run the same upsert."

## The rule

Every syncable table gets:

- a stable primary key
- an `hlc` column (or `updated_at` + `site_id` if you want it legible)
- no hard deletes — state changes are column values, not row removal

```sql
CREATE TABLE follows (
  target_id TEXT PRIMARY KEY,
  active    INTEGER NOT NULL,   -- 1/0, unfollow is a row not a DELETE
  hlc       INTEGER NOT NULL
);

CREATE TABLE stars (
  target_id TEXT PRIMARY KEY,
  active    INTEGER NOT NULL,
  hlc       INTEGER NOT NULL
);

CREATE TABLE notes (
  note_id TEXT PRIMARY KEY,
  body    TEXT,
  hlc     INTEGER NOT NULL
);
```

`hlc` = `(wall_clock_millis << 24) | site_id_low_bits`. Pure wall clock ties
when two devices write in the same millisecond, so the site_id tiebreak has
to live in the same comparable integer. Compute client-side at write time.

## The merge

Given any two sqlite files with this shape:

```sql
ATTACH 'other.db' AS other;

INSERT INTO main.follows (target_id, active, hlc)
SELECT target_id, active, hlc FROM other.follows
ON CONFLICT(target_id) DO UPDATE SET
  active = excluded.active,
  hlc    = excluded.hlc
WHERE excluded.hlc > follows.hlc;
```

Same statement shape, every table, mechanical. Newer hlc wins, full stop.

## N-way

Fold pairwise. Merge A+B, then merge that result with C, etc. `>` comparison
is associative and commutative so merge order doesn't matter — you don't need
to coordinate who merges with whom first.

## What this buys you

- the sqlite file is always the complete, portable, current state — no
  replay step, no derived view, no separate export format. it IS the export.
- merge logic is one upsert statement per table, no library, no wasm
  extension, no VFS weirdness to debug.
- works identically whether "the other side" is another device or the server
  — server is just another peer with a copy of the file.

## What this costs you (accepted, not a bug)

- LWW is lossy on true concurrent conflict. Race an unfollow against a
  follow on two devices at the same instant, one write vanishes with no
  trace. Fine here — toggle state, nobody audits it, and note bodies are
  single-author personal annotations where clobber-on-concurrent-edit is a
  non-event.
- no history. If you ever need "show me what changed and when" as a real
  feature (not just current state), this schema doesn't give it to you —
  that requires an op log, which is a different design, not an upgrade to
  this one.
- if a table's semantics stop being pure LWW (e.g. want add-wins on
  concurrent follow/unfollow instead of last-wins), that changes the WHERE
  clause per table, but it's still one statement, not a rewrite.
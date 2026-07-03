import { Router } from "express";
import { getPool } from "@nostril/shared/db";
import type { MastodonAccount } from "@nostril/shared";

const router = Router();
const pool = getPool();

router.get("/:instance/users/:acct", async (req, res) => {
  const { instance, acct } = req.params;

  const account = await pool.query<MastodonAccount>(
    "SELECT * FROM mastodon_accounts WHERE instance = $1 AND acct = $2 LIMIT 1",
    [instance, acct],
  );
  if (account.rows.length === 0) {
    res.status(404).json({ error: "account not found" });
    return;
  }
  const acc = account.rows[0]!;

  const statuses = await pool.query(
    `SELECT id, content, content_text, url, created_at, raw
     FROM mastodon_statuses
     WHERE instance = $1 AND account_id = $2
     ORDER BY created_at DESC LIMIT 40`,
    [instance, acc.id],
  );

  res.json({ account: acc, statuses: statuses.rows });
});

export default router;

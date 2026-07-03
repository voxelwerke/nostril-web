import { Router } from "express";
import { getDb } from "@nostril/shared/db";
import type { MastodonAccount } from "@nostril/shared";

const router = Router();
const db = getDb();

router.get("/:instance/users/:acct", async (req, res) => {
  const { instance, acct } = req.params;

  const acc = await db.oneOrNone<MastodonAccount>(
    "SELECT * FROM mastodon_accounts WHERE instance = $<instance> AND acct = $<acct> LIMIT 1",
    { instance, acct },
  );
  if (!acc) {
    res.status(404).json({ error: "account not found" });
    return;
  }

  const statuses = await db.any(
    `SELECT id, content, content_text, url, created_at, raw
     FROM mastodon_statuses
     WHERE instance = $<instance> AND account_id = $<accountId>
     ORDER BY created_at DESC LIMIT 40`,
    { instance, accountId: acc.id },
  );

  res.json({ account: acc, statuses });
});

export default router;

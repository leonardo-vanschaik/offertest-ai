-- Agent checkout sessions (ACP), agent carts (UCP), and idempotency keys, shared by every Workers instance.
-- at: last write (ms). Records are deleted 24 hours after it.
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  at INTEGER NOT NULL DEFAULT 0
);

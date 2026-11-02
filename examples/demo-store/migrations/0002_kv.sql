-- Agent checkout sessions (ACP), agent carts (UCP), and idempotency keys, shared by every Workers instance.
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

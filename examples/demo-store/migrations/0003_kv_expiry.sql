-- Add "at": when each record was last written (ms). Records expire 24 hours after it.
-- A rebuild, not ALTER TABLE, so it works on both table shapes: from migration 0002, and the one the store
-- creates by itself (which already has "at"). Every old row gets 0 and expires at once: it may hold contact data.
CREATE TABLE kv_new (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO kv_new (key, value) SELECT key, value FROM kv;
DROP TABLE kv;
ALTER TABLE kv_new RENAME TO kv;

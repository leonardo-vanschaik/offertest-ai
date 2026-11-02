-- When each record was last written (ms). Records expire 24 hours after it.
-- Rows from before this column get 0, so they expire at once: they may hold full contact data.
ALTER TABLE kv ADD COLUMN at INTEGER NOT NULL DEFAULT 0;

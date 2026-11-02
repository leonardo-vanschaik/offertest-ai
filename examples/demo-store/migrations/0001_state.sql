-- Alder Trail Co. store state on Cloudflare D1: one row (key 'store') holds the whole state JSON.
CREATE TABLE IF NOT EXISTS state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Moment D1 schema (spec §5.4). Apply: npm run db:init
-- Idempotent: IF NOT EXISTS added so it can be re-run safely.
-- checkins.status values: pending | sent | answered | expired | failed (§7.3).

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY, auth_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS records (
  device_id TEXT NOT NULL, store TEXT NOT NULL, id TEXT NOT NULL,
  updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
  iv TEXT, ct TEXT, server_seq INTEGER NOT NULL,
  PRIMARY KEY (device_id, store, id));
CREATE INDEX IF NOT EXISTS records_seq ON records (device_id, server_seq);
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY, device_id TEXT NOT NULL,
  p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS push_subs_device ON push_subs (device_id);
CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY, device_id TEXT NOT NULL,
  due_at INTEGER NOT NULL, kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0, sent_at INTEGER);
CREATE INDEX IF NOT EXISTS checkins_due ON checkins (status, due_at);
CREATE TABLE IF NOT EXISTS vapid_cache (audience TEXT PRIMARY KEY, jwt TEXT NOT NULL, exp INTEGER NOT NULL);

/* DD-036 */ -- Addition to §5.4: tiny key/value table; remembers the last daily housekeeping date (§7.3 step 4).
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);

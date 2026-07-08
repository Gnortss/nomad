-- Per-trip AI chat state.
-- trip_chat_log: provider-neutral display transcript (what the panel renders).
-- trip_chat_context: raw Anthropic messages, one per row; disposable — pruned
-- oldest-first by WHOLE turns (the turn column marks them) so the retained
-- history always starts at a plain user message and tool_use/tool_result
-- pairs are never split.
CREATE TABLE trip_chat_log (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (trip_id, seq)
);
CREATE TABLE trip_chat_context (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  turn INTEGER NOT NULL,
  message TEXT NOT NULL,
  PRIMARY KEY (trip_id, seq)
);
-- Turn lock (CAS token + heartbeat timestamp) and the new-trip description
-- seed the first chat turn kicks off from.
ALTER TABLE trips ADD COLUMN chat_turn_token TEXT;
ALTER TABLE trips ADD COLUMN chat_turn_claimed_at INTEGER;
ALTER TABLE trips ADD COLUMN chat_seed TEXT;
ALTER TABLE trips ADD COLUMN chat_seed_consumed INTEGER NOT NULL DEFAULT 0;

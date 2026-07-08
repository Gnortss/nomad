// Model is a constant so switching (e.g. to claude-opus-4-8) is a one-line change.
export const PLANNER_MODEL = "claude-sonnet-5";
// Cheap tier for the one-shot new-trip extraction (title, destination, profile).
export const EXTRACTOR_MODEL = "claude-haiku-4-5-20251001";
// Generous: we always stream, and a multi-day upsert_days payload plus adaptive
// thinking after a long research phase can overrun a tighter cap mid-tool-call.
export const MAX_TOKENS_PER_TURN = 32000;
// Incremental editing spends a round per upsert_days on top of research rounds.
export const MAX_LOOP_ITERATIONS = 40;
export const MAX_WEB_SEARCHES = 25;

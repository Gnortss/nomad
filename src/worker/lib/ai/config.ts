// Model is a constant so switching (e.g. to claude-opus-4-8) is a one-line change.
export const PLANNER_MODEL = "claude-sonnet-5";
// Generous: we always stream, and a 10-day submit_plan payload plus adaptive
// thinking after a long research phase can overrun a tighter cap mid-tool-call.
export const MAX_TOKENS_PER_TURN = 32000;
export const MAX_LOOP_ITERATIONS = 25;
export const MAX_WEB_SEARCHES = 25;

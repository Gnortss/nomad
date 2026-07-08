-- Cached Google Place Details (New), keyed by place_id and shared across trips.
-- 30-day freshness enforced in code (Google's caching policy ceiling).
-- Numbered 0005: 0003/0004 are taken by the pending feat/ai-planning-v2 branch.
CREATE TABLE place_details (
  place_id   TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);

-- Monthly Google API call counters ('YYYY-MM' + SKU). The place-info endpoint
-- stops calling Google at 90% of the SKU's free monthly tier.
CREATE TABLE api_usage (
  month TEXT NOT NULL,
  sku   TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (month, sku)
);

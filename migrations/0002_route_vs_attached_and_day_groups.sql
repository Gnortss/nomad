-- Route vs attached: a stop can belong to a day without being a waypoint on
-- the day's driving route. Existing rows are route stops (default 1).
ALTER TABLE day_stops ADD COLUMN in_route INTEGER NOT NULL DEFAULT 1;
-- Day-scoped groups: NULL day_id keeps today's trip-wide behavior.
ALTER TABLE groups ADD COLUMN day_id TEXT REFERENCES days(id) ON DELETE SET NULL;

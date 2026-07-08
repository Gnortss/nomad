-- Trip constraint profile: vehicle ('car'|'ev' app-level; text so 'bike' can be
-- added later without migration), EV range, routing modifiers, and the map
-- center extracted from the new-trip description (shown before any points exist).
ALTER TABLE trips ADD COLUMN vehicle TEXT NOT NULL DEFAULT 'car';
ALTER TABLE trips ADD COLUMN ev_range_km INTEGER;
ALTER TABLE trips ADD COLUMN avoid_tolls INTEGER NOT NULL DEFAULT 0;
ALTER TABLE trips ADD COLUMN allow_ferries INTEGER NOT NULL DEFAULT 1;
ALTER TABLE trips ADD COLUMN map_lat REAL;
ALTER TABLE trips ADD COLUMN map_lng REAL;
-- Per-day overrides: NULL = inherit the trip default.
ALTER TABLE days ADD COLUMN avoid_tolls INTEGER;
ALTER TABLE days ADD COLUMN allow_ferries INTEGER;

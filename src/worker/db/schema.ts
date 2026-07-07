import { sqliteTable, text, real, integer, primaryKey, index, unique } from "drizzle-orm/sqlite-core";
import { drizzle } from "drizzle-orm/d1";
import type { Env } from "../index";

// better-auth owns user/session/account/verification (added in Task 3); trips.userId is a plain
// text column referencing user.id at the app level (no DB-level FK, so app tables migrate standalone).
export const trips = sqliteTable("trips", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  startDate: text("start_date"),
  vehicleNotes: text("vehicle_notes"),
  fuelLPer100km: real("fuel_l_per_100km"),
  fuelPricePerL: real("fuel_price_per_l"),
  currency: text("currency").notNull().default("EUR"),
  budgetTotal: real("budget_total"),
  shareToken: text("share_token").unique(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => ({ userIdx: index("idx_trips_user").on(t.userId) }));

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color"),
}, (t) => ({ tripIdx: index("idx_groups_trip").on(t.tripId) }));

export const points = sqliteTable("points", {
  id: text("id").primaryKey(),
  tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  coordSource: text("coord_source").notNull().default("user"),
  coordFetchedAt: integer("coord_fetched_at"),
  googlePlaceId: text("google_place_id"),
  type: text("type").notNull().default("poi"),
  notes: text("notes"),
  links: text("links"), // JSON array of {label, url}
  estCost: real("est_cost"),
  costBasis: text("cost_basis"),
  bookingStatus: text("booking_status").notNull().default("idea"),
  groupId: text("group_id").references(() => groups.id, { onDelete: "set null" }),
  createdAt: integer("created_at").notNull(),
}, (t) => ({ tripIdx: index("idx_points_trip").on(t.tripId) }));

export const days = sqliteTable("days", {
  id: text("id").primaryKey(),
  tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title"),
  departureTime: text("departure_time"),
  targetArrivalTime: text("target_arrival_time"),
  notes: text("notes"),
}, (t) => ({ tripPos: unique("uq_days_trip_position").on(t.tripId, t.position) }));

export const dayStops = sqliteTable("day_stops", {
  dayId: text("day_id").notNull().references(() => days.id, { onDelete: "cascade" }),
  pointId: text("point_id").notNull().references(() => points.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.dayId, t.pointId] }),
  orderIdx: index("idx_day_stops_order").on(t.dayId, t.position),
}));

export const dayRoutes = sqliteTable("day_routes", {
  dayId: text("day_id").primaryKey().references(() => days.id, { onDelete: "cascade" }),
  waypointsHash: text("waypoints_hash").notNull(),
  polyline: text("polyline").notNull(),
  distanceM: integer("distance_m").notNull(),
  durationS: integer("duration_s").notNull(),
  computedAt: integer("computed_at").notNull(),
});

export const schema = { trips, groups, points, days, dayStops, dayRoutes };
export function getDb(env: Env) {
  return drizzle(env.DB, { schema });
}

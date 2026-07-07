CREATE TABLE `day_routes` (
	`day_id` text PRIMARY KEY NOT NULL,
	`waypoints_hash` text NOT NULL,
	`polyline` text NOT NULL,
	`distance_m` integer NOT NULL,
	`duration_s` integer NOT NULL,
	`computed_at` integer NOT NULL,
	FOREIGN KEY (`day_id`) REFERENCES `days`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `day_stops` (
	`day_id` text NOT NULL,
	`point_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`day_id`, `point_id`),
	FOREIGN KEY (`day_id`) REFERENCES `days`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`point_id`) REFERENCES `points`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_day_stops_order` ON `day_stops` (`day_id`,`position`);--> statement-breakpoint
CREATE TABLE `days` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text,
	`departure_time` text,
	`target_arrival_time` text,
	`notes` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_days_trip_position` ON `days` (`trip_id`,`position`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_groups_trip` ON `groups` (`trip_id`);--> statement-breakpoint
CREATE TABLE `points` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`name` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`coord_source` text DEFAULT 'user' NOT NULL,
	`coord_fetched_at` integer,
	`google_place_id` text,
	`type` text DEFAULT 'poi' NOT NULL,
	`notes` text,
	`links` text,
	`est_cost` real,
	`cost_basis` text,
	`booking_status` text DEFAULT 'idea' NOT NULL,
	`group_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_points_trip` ON `points` (`trip_id`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`start_date` text,
	`vehicle_notes` text,
	`fuel_l_per_100km` real,
	`fuel_price_per_l` real,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`budget_total` real,
	`share_token` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trips_share_token_unique` ON `trips` (`share_token`);--> statement-breakpoint
CREATE INDEX `idx_trips_user` ON `trips` (`user_id`);
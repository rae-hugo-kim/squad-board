CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name_ko` text NOT NULL,
	`name_en` text NOT NULL,
	`role_group` text NOT NULL,
	`abilities` text DEFAULT '[]' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_slug_unique` ON `agents` (`slug`);--> statement-breakpoint
CREATE TABLE `maps` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name_ko` text NOT NULL,
	`name_en` text NOT NULL,
	`sites` text DEFAULT '["A","B"]' NOT NULL,
	`in_pool` integer DEFAULT true NOT NULL,
	`image_path` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maps_slug_unique` ON `maps` (`slug`);--> statement-breakpoint
CREATE TABLE `member_map_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`map_id` text NOT NULL,
	`agent1_id` text,
	`agent2_id` text,
	`agent3_id` text,
	`attack_position` text DEFAULT '' NOT NULL,
	`defense_position` text DEFAULT '' NOT NULL,
	`confidence` integer DEFAULT 3 NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`map_id`) REFERENCES `maps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent1_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`agent2_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`agent3_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mmp_member_map_uq` ON `member_map_preferences` (`member_id`,`map_id`);--> statement-breakpoint
CREATE INDEX `mmp_map_idx` ON `member_map_preferences` (`map_id`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`nickname` text NOT NULL,
	`color` text DEFAULT '#7b8cff' NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`role_preference` text DEFAULT '[]' NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`dpi` integer,
	`sens` real,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_nickname_uq` ON `members` (`nickname`);
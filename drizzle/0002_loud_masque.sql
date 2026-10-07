CREATE TABLE `session_match_tactics` (
	`match_id` text NOT NULL,
	`tactic_id` text NOT NULL,
	`slot_bindings` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `session_matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tactic_id`) REFERENCES `tactics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `smt_match_tactic_uq` ON `session_match_tactics` (`match_id`,`tactic_id`);--> statement-breakpoint
CREATE INDEX `smt_tactic_idx` ON `session_match_tactics` (`tactic_id`);--> statement-breakpoint
CREATE TABLE `tactic_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`stage_id` text NOT NULL,
	`kind` text NOT NULL,
	`x` real DEFAULT 0 NOT NULL,
	`y` real DEFAULT 0 NOT NULL,
	`points` text DEFAULT '[]' NOT NULL,
	`radius` real,
	`angle` real,
	`rotation` real DEFAULT 0 NOT NULL,
	`color` text,
	`label` text DEFAULT '' NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`slot_no` integer,
	`team` text,
	`caster_agent_id` text,
	`ability_key` text,
	`linked_object_id` text,
	`external_url` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`stage_id`) REFERENCES `tactic_stages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`caster_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `to_stage_idx` ON `tactic_objects` (`stage_id`);--> statement-breakpoint
CREATE TABLE `tactic_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`tactic_id` text NOT NULL,
	`slot_no` integer NOT NULL,
	`role_group` text,
	`agent_id` text,
	`description` text DEFAULT '' NOT NULL,
	`position_hint` text DEFAULT '' NOT NULL,
	`fixed_member_id` text,
	FOREIGN KEY (`tactic_id`) REFERENCES `tactics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`fixed_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tslot_tactic_no_uq` ON `tactic_slots` (`tactic_id`,`slot_no`);--> statement-breakpoint
CREATE TABLE `tactic_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`tactic_id` text NOT NULL,
	`seq` integer NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`tactic_id`) REFERENCES `tactics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ts_tactic_idx` ON `tactic_stages` (`tactic_id`);--> statement-breakpoint
CREATE TABLE `tactics` (
	`id` text PRIMARY KEY NOT NULL,
	`map_id` text NOT NULL,
	`side` text NOT NULL,
	`round_type` text DEFAULT 'any' NOT NULL,
	`name` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`author_id` text,
	`layer_hue` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`map_id`) REFERENCES `maps`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`author_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tactics_map_idx` ON `tactics` (`map_id`);--> statement-breakpoint
ALTER TABLE `members` ADD `crosshair_code` text DEFAULT '' NOT NULL;
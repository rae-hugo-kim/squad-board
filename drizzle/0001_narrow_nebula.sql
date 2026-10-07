CREATE TABLE `session_match_players` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`member_id` text NOT NULL,
	`agent_id` text,
	`position` text DEFAULT '' NOT NULL,
	`kills` integer,
	`deaths` integer,
	`assists` integer,
	`memo` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `session_matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `smp_match_member_uq` ON `session_match_players` (`match_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `smp_member_idx` ON `session_match_players` (`member_id`);--> statement-breakpoint
CREATE TABLE `session_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`seq` integer NOT NULL,
	`map_id` text NOT NULL,
	`result` text,
	`score_ally` integer,
	`score_enemy` integer,
	`memo` text DEFAULT '' NOT NULL,
	`is_confirmed` integer DEFAULT false NOT NULL,
	`confirmed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`map_id`) REFERENCES `maps`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `sm_session_idx` ON `session_matches` (`session_id`);--> statement-breakpoint
CREATE INDEX `sm_map_idx` ON `session_matches` (`map_id`);--> statement-breakpoint
CREATE TABLE `session_participants` (
	`session_id` text NOT NULL,
	`member_id` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sp_session_member_uq` ON `session_participants` (`session_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `sp_member_idx` ON `session_participants` (`member_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sessions_date_idx` ON `sessions` (`date`);
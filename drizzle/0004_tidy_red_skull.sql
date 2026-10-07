ALTER TABLE `maps` ADD `units_per_board` real;--> statement-breakpoint
ALTER TABLE `tactics` ADD `is_shared` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tactics` ADD `priority` integer DEFAULT 0 NOT NULL;
ALTER TABLE `agents` ADD `icon_url` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `portrait_url` text;--> statement-breakpoint
ALTER TABLE `maps` ADD `splash_url` text;--> statement-breakpoint
ALTER TABLE `maps` ADD `list_icon_url` text;--> statement-breakpoint
ALTER TABLE `maps` ADD `callouts` text DEFAULT '[]' NOT NULL;
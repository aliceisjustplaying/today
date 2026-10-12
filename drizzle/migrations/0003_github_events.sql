CREATE TABLE `github_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`repo` text NOT NULL,
	`login` text NOT NULL,
	`avatar_url` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `github_events_at` ON `github_events` (`at`);--> statement-breakpoint
CREATE TABLE `github_users` (
	`login` text PRIMARY KEY NOT NULL,
	`name` text,
	`fetched_at` integer NOT NULL
);

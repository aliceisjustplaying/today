CREATE TABLE `body_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`eaten` integer DEFAULT false NOT NULL,
	`showered` integer DEFAULT false NOT NULL,
	`shaved` integer DEFAULT false NOT NULL,
	`dressed` integer DEFAULT false NOT NULL,
	`packed` integer DEFAULT false NOT NULL,
	`running_late` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`source_app` text NOT NULL,
	`source_meta` text,
	`summary` text NOT NULL,
	`proposed_action` text NOT NULL,
	`urgency` text NOT NULL,
	`confidence` text NOT NULL,
	`status` text DEFAULT 'candidate' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE TABLE `oauth_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`user_sub` text NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`scope` text,
	`expires_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prefs` (
	`id` integer PRIMARY KEY NOT NULL,
	`home_address` text,
	`transport_default` text DEFAULT 'transit' NOT NULL,
	`transport_rescue` text,
	`rescue_rule` text,
	`timezone` text DEFAULT 'Europe/London' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_sub` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);

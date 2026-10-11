CREATE TABLE `prep_checks` (
	`day` text NOT NULL,
	`step_id` integer NOT NULL,
	`checked_at` integer NOT NULL,
	PRIMARY KEY(`day`, `step_id`),
	FOREIGN KEY (`step_id`) REFERENCES `prep_steps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `prep_days` (
	`day` text PRIMARY KEY NOT NULL,
	`running_late` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prep_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text NOT NULL,
	`minutes` integer NOT NULL,
	`position` integer NOT NULL,
	`removed_at` integer
);

--> statement-breakpoint
INSERT INTO `prep_steps` (`id`, `label`, `minutes`, `position`) VALUES
	(1, 'ate', 15, 0),
	(2, 'showered', 15, 1),
	(3, 'shaved', 10, 2),
	(4, 'dressed', 5, 3),
	(5, 'packed', 10, 4);
--> statement-breakpoint
WITH `bs` AS (
	SELECT *, strftime('%Y', `updated_at`, 'unixepoch') AS `y` FROM `body_state` WHERE `id` = 1
), `london` AS (
	SELECT *, date(
		`updated_at` + CASE
			WHEN `updated_at` >= CAST(strftime('%s', date(`y` || '-03-31', '-6 days', 'weekday 0')) AS INTEGER) + 3600
			 AND `updated_at` < CAST(strftime('%s', date(`y` || '-10-31', '-6 days', 'weekday 0')) AS INTEGER) + 3600
			THEN 3600 ELSE 0 END,
		'unixepoch'
	) AS `day` FROM `bs`
)
INSERT INTO `prep_checks` (`day`, `step_id`, `checked_at`)
SELECT `day`, 1, `updated_at` FROM `london` WHERE `eaten`
UNION ALL SELECT `day`, 2, `updated_at` FROM `london` WHERE `showered`
UNION ALL SELECT `day`, 3, `updated_at` FROM `london` WHERE `shaved`
UNION ALL SELECT `day`, 4, `updated_at` FROM `london` WHERE `dressed`
UNION ALL SELECT `day`, 5, `updated_at` FROM `london` WHERE `packed`;
--> statement-breakpoint
WITH `bs` AS (
	SELECT *, strftime('%Y', `updated_at`, 'unixepoch') AS `y` FROM `body_state` WHERE `id` = 1
)
INSERT INTO `prep_days` (`day`, `running_late`, `updated_at`)
SELECT date(
	`updated_at` + CASE
		WHEN `updated_at` >= CAST(strftime('%s', date(`y` || '-03-31', '-6 days', 'weekday 0')) AS INTEGER) + 3600
		 AND `updated_at` < CAST(strftime('%s', date(`y` || '-10-31', '-6 days', 'weekday 0')) AS INTEGER) + 3600
		THEN 3600 ELSE 0 END,
	'unixepoch'
), `running_late`, `updated_at` FROM `bs` WHERE `running_late`;

CREATE TABLE `user_consents` (
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`version` text NOT NULL,
	`accepted_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `kind`)
);

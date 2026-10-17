ALTER TABLE `guilds` ADD `left_at` integer;--> statement-breakpoint
-- Servers the bot already left: start their 90 days now, when this migration runs, so nothing is purged before 90 days after this release.
-- left_at holds milliseconds since the epoch (Drizzle timestamp_ms); julianday works in every SQLite version.
UPDATE `guilds` SET `left_at` = CAST((julianday('now') - 2440587.5) * 86400000 AS integer) WHERE `is_active` = 0 AND `left_at` IS NULL;
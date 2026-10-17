ALTER TABLE "guilds" ADD COLUMN "left_at" timestamp with time zone;--> statement-breakpoint
-- Servers the bot already left: start their 90 days now, when this migration runs, so nothing is purged before 90 days after this release.
UPDATE "guilds" SET "left_at" = now() WHERE "is_active" = false AND "left_at" IS NULL;
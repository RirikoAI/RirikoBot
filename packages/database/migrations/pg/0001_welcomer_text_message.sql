ALTER TABLE "guild_farewell" ADD COLUMN "text_message_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_farewell" ADD COLUMN "text_message" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_welcomer" ADD COLUMN "text_message_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_welcomer" ADD COLUMN "text_message" text DEFAULT '' NOT NULL;
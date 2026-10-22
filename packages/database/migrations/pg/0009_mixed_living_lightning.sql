CREATE TABLE "starboard_posts" (
	"message_id" varchar(32) PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"author_id" varchar(32) NOT NULL,
	"starboard_message_id" varchar(32),
	"star_count" integer DEFAULT 0 NOT NULL,
	"removed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "starboard_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"channel_id" varchar(32),
	"emoji" varchar(64) DEFAULT '⭐' NOT NULL,
	"threshold" integer DEFAULT 3 NOT NULL,
	"allow_self_star" boolean DEFAULT false NOT NULL,
	"ignored_channel_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_pg_starboard_posts_guild" ON "starboard_posts" USING btree ("guild_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pg_starboard_posts_starboard_message" ON "starboard_posts" USING btree ("starboard_message_id");
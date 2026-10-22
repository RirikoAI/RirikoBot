CREATE TABLE "event_log_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"message_channel_id" varchar(32),
	"member_channel_id" varchar(32),
	"server_channel_id" varchar(32),
	"voice_channel_id" varchar(32),
	"ignored_channel_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ignore_bots" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

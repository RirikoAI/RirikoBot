CREATE TABLE "level_role_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"rewards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"keep_previous_roles" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

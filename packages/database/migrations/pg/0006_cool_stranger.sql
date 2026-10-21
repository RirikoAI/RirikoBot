CREATE TABLE "ticket_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"category_id" varchar(32),
	"staff_role_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transcript_channel_id" varchar(32),
	"max_open_per_user" integer DEFAULT 1 NOT NULL,
	"welcome_message" text,
	"next_number" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"number" integer NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"opener_id" varchar(32) NOT NULL,
	"subject" text,
	"status" text DEFAULT 'open' NOT NULL,
	"claimed_by" varchar(32),
	"closed_by" varchar(32),
	"close_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pg_tickets_guild_number" ON "tickets" USING btree ("guild_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pg_tickets_channel" ON "tickets" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_pg_tickets_guild_opener_status" ON "tickets" USING btree ("guild_id","opener_id","status");
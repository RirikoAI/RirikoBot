CREATE TABLE "user_consents" (
	"user_id" varchar(32) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"version" varchar(32) NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_consents_user_id_kind_pk" PRIMARY KEY("user_id","kind")
);

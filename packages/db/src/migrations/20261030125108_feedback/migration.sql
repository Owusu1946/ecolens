CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"useful" boolean NOT NULL,
	"comment" text,
	"user_id" text NOT NULL,
	"org_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_target_type_target_id_user_id_unique" UNIQUE("target_type","target_id","user_id"),
	CONSTRAINT "feedback_target_type" CHECK ("target_type" in ('report', 'alert'))
);
--> statement-breakpoint
CREATE INDEX "feedback_target_type_created_at_index" ON "feedback" ("target_type","created_at");
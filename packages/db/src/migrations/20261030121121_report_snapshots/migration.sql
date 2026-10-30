ALTER TABLE "reports" ADD COLUMN "snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "html_key" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "is_sensitive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "is_simulated" boolean DEFAULT false NOT NULL;
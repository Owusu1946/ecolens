CREATE TYPE "verification_status" AS ENUM('open', 'fulfilled', 'withdrawn');--> statement-breakpoint
CREATE TABLE "verification_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"alert_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"instructions" text NOT NULL,
	"due_at" timestamp with time zone,
	"status" "verification_status" DEFAULT 'open'::"verification_status" NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"requested_by_org_id" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fulfilled_by_report_id" uuid,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "verification_requests_institution_id_status_index" ON "verification_requests" ("institution_id","status");--> statement-breakpoint
CREATE INDEX "verification_requests_alert_id_index" ON "verification_requests" ("alert_id");--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_alert_id_alerts_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id");--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_institution_id_institutions_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id");--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_wUHwpclQtUmw_fkey" FOREIGN KEY ("fulfilled_by_report_id") REFERENCES "field_reports"("id");
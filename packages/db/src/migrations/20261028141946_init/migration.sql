CREATE TYPE "alert_status" AS ENUM('new', 'in_review', 'confirmed', 'rejected', 'unresolved');--> statement-breakpoint
CREATE TYPE "boundary_kind" AS ENUM('basin', 'mining_concession', 'protected_area', 'forest_reserve', 'district', 'region');--> statement-breakpoint
CREATE TYPE "confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "data_mode" AS ENUM('live', 'prepared', 'simulated');--> statement-breakpoint
CREATE TYPE "evidence_kind" AS ENUM('observation', 'field_report', 'imagery', 'document', 'note');--> statement-breakpoint
CREATE TYPE "field_assessment" AS ENUM('supports_alert', 'contradicts_alert', 'inconclusive');--> statement-breakpoint
CREATE TYPE "incident_action_kind" AS ENUM('site_inspection', 'sampling', 'enforcement_notice', 'suspension', 'arrest_or_seizure', 'remediation', 'public_notice', 'referral', 'decision_not_to_act', 'other');--> statement-breakpoint
CREATE TYPE "incident_status" AS ENUM('open', 'assigned', 'in_progress', 'action_recorded', 'closed');--> statement-breakpoint
CREATE TYPE "institution_kind" AS ENUM('platform', 'steering', 'epa', 'minerals_commission', 'water_resources_commission', 'district_assembly', 'regional_council', 'research', 'community', 'data_provider');--> statement-breakpoint
CREATE TYPE "lens" AS ENUM('water', 'forest_land', 'air');--> statement-breakpoint
CREATE TYPE "report_kind" AS ENUM('incident_assessment', 'alert_summary', 'period_summary');--> statement-breakpoint
CREATE TYPE "severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "source_kind" AS ENUM('satellite', 'sensor', 'agency_dataset', 'regulatory_record', 'field_observation', 'model');--> statement-breakpoint
CREATE TYPE "validation_outcome" AS ENUM('confirmed', 'rejected', 'unresolved');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_org_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text,
	"reason" text,
	"entity_version" bigint,
	"client_mutation_id" uuid UNIQUE,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"source_id" uuid NOT NULL,
	"site_id" uuid,
	"lens" "lens" NOT NULL,
	"indicator" text NOT NULL,
	"value" double precision,
	"unit" text,
	"observed_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"location" geometry(Geometry,4326) NOT NULL,
	"confidence" "confidence",
	"quality_note" text,
	"external_id" text,
	"raw" jsonb,
	"is_simulated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "observations_source_id_external_id_unique" UNIQUE("source_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "anomaly_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"lens" "lens" NOT NULL,
	"indicator" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"params" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anomaly_rules_key_version_unique" UNIQUE("key","version")
);
--> statement-breakpoint
CREATE TABLE "boundaries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"kind" "boundary_kind" NOT NULL,
	"name" text NOT NULL,
	"reference" text,
	"holder" text,
	"legal_status" text,
	"source_id" uuid NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"area" geometry(MultiPolygon,4326) NOT NULL,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"key" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"kind" "source_kind" NOT NULL,
	"mode" "data_mode" NOT NULL,
	"steward_institution_id" uuid,
	"description" text NOT NULL,
	"methodology" text,
	"known_limitations" text NOT NULL,
	"spatial_resolution" text,
	"update_frequency" text,
	"licence" text,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institutions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"clerk_org_id" text UNIQUE,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"kind" "institution_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "river_reaches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"river" text NOT NULL,
	"basin" text NOT NULL,
	"name" text,
	"course" geometry(LineString,4326) NOT NULL,
	"source_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"name" text NOT NULL,
	"lens" "lens" NOT NULL,
	"basin" text,
	"district" text,
	"description" text,
	"location" geometry(Point,4326) NOT NULL,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	"is_simulated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"kind" "report_kind" NOT NULL,
	"title" text NOT NULL,
	"alert_id" uuid,
	"incident_id" uuid,
	"period_start" date,
	"period_end" date,
	"object_key" text,
	"generated_by_user_id" text NOT NULL,
	"generated_by_org_id" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_by_user_id" text,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "alert_evidence" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"alert_id" uuid NOT NULL,
	"kind" "evidence_kind" NOT NULL,
	"observation_id" uuid,
	"field_report_id" uuid,
	"object_key" text,
	"caption" text,
	"added_by_user_id" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"number" integer UNIQUE GENERATED ALWAYS AS IDENTITY (sequence name "alerts_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lens" "lens" NOT NULL,
	"indicator" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"rule_id" uuid,
	"site_id" uuid,
	"location" geometry(Geometry,4326) NOT NULL,
	"confidence" "confidence" NOT NULL,
	"status" "alert_status" DEFAULT 'new'::"alert_status" NOT NULL,
	"coverage" text NOT NULL,
	"limitations" text NOT NULL,
	"first_observed_at" timestamp with time zone NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"validated_at" timestamp with time zone,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	"is_simulated" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_report_photos" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"field_report_id" uuid NOT NULL,
	"object_key" text NOT NULL UNIQUE,
	"content_type" text NOT NULL,
	"bytes" bigint,
	"width" integer,
	"height" integer,
	"taken_at" timestamp with time zone,
	"location" geometry(Point,4326),
	"uploaded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "field_reports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"alert_id" uuid,
	"site_id" uuid,
	"author_user_id" text NOT NULL,
	"author_org_id" text NOT NULL,
	"location" geometry(Point,4326) NOT NULL,
	"gps_accuracy_m" double precision,
	"observation" text NOT NULL,
	"activity_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"assessment" "field_assessment",
	"client_created_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_sensitive" boolean DEFAULT true NOT NULL,
	"is_simulated" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_actions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"incident_id" uuid NOT NULL,
	"kind" "incident_action_kind" NOT NULL,
	"description" text NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"recorded_by_user_id" text NOT NULL,
	"recorded_by_org_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_assignments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"incident_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"instructions" text,
	"due_at" timestamp with time zone,
	"assigned_by_user_id" text NOT NULL,
	"assigned_by_org_id" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"number" integer UNIQUE GENERATED ALWAYS AS IDENTITY (sequence name "incidents_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"alert_id" uuid NOT NULL UNIQUE,
	"title" text NOT NULL,
	"severity" "severity" NOT NULL,
	"status" "incident_status" DEFAULT 'open'::"incident_status" NOT NULL,
	"responsible_institution_id" uuid,
	"opened_by_user_id" text NOT NULL,
	"opened_by_org_id" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closure_summary" text,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_closure_has_summary" CHECK ("status" <> 'closed' OR ("closed_at" IS NOT NULL AND "closure_summary" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "validations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"alert_id" uuid NOT NULL,
	"outcome" "validation_outcome" NOT NULL,
	"rationale" text NOT NULL,
	"confidence" "confidence" NOT NULL,
	"decided_by_user_id" text NOT NULL,
	"decided_by_org_id" text NOT NULL,
	"decided_by_role" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_events_entity_type_entity_id_occurred_at_index" ON "audit_events" ("entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_occurred_at_index" ON "audit_events" ("occurred_at");--> statement-breakpoint
CREATE INDEX "observations_site_id_indicator_observed_at_index" ON "observations" ("site_id","indicator","observed_at");--> statement-breakpoint
CREATE INDEX "observations_observed_at_index" ON "observations" ("observed_at");--> statement-breakpoint
CREATE INDEX "observations_location_index" ON "observations" USING gist ("location");--> statement-breakpoint
CREATE INDEX "boundaries_area_index" ON "boundaries" USING gist ("area");--> statement-breakpoint
CREATE INDEX "boundaries_kind_index" ON "boundaries" ("kind");--> statement-breakpoint
CREATE INDEX "river_reaches_course_index" ON "river_reaches" USING gist ("course");--> statement-breakpoint
CREATE INDEX "sites_location_index" ON "sites" USING gist ("location");--> statement-breakpoint
CREATE INDEX "reports_incident_id_index" ON "reports" ("incident_id");--> statement-breakpoint
CREATE INDEX "reports_generated_at_index" ON "reports" ("generated_at");--> statement-breakpoint
CREATE INDEX "alert_evidence_alert_id_index" ON "alert_evidence" ("alert_id");--> statement-breakpoint
CREATE INDEX "alerts_status_detected_at_index" ON "alerts" ("status","detected_at");--> statement-breakpoint
CREATE INDEX "alerts_site_id_index" ON "alerts" ("site_id");--> statement-breakpoint
CREATE INDEX "alerts_location_index" ON "alerts" USING gist ("location");--> statement-breakpoint
CREATE INDEX "field_report_photos_field_report_id_index" ON "field_report_photos" ("field_report_id");--> statement-breakpoint
CREATE INDEX "field_reports_alert_id_index" ON "field_reports" ("alert_id");--> statement-breakpoint
CREATE INDEX "field_reports_client_created_at_index" ON "field_reports" ("client_created_at");--> statement-breakpoint
CREATE INDEX "field_reports_location_index" ON "field_reports" USING gist ("location");--> statement-breakpoint
CREATE INDEX "incident_actions_incident_id_taken_at_index" ON "incident_actions" ("incident_id","taken_at");--> statement-breakpoint
CREATE INDEX "incident_assignments_incident_id_assigned_at_index" ON "incident_assignments" ("incident_id","assigned_at");--> statement-breakpoint
CREATE INDEX "incidents_status_opened_at_index" ON "incidents" ("status","opened_at");--> statement-breakpoint
CREATE INDEX "incidents_responsible_institution_id_index" ON "incidents" ("responsible_institution_id");--> statement-breakpoint
CREATE INDEX "validations_alert_id_decided_at_index" ON "validations" ("alert_id","decided_at");--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_source_id_data_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id");--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_site_id_sites_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id");--> statement-breakpoint
ALTER TABLE "boundaries" ADD CONSTRAINT "boundaries_source_id_data_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id");--> statement-breakpoint
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_steward_institution_id_institutions_id_fkey" FOREIGN KEY ("steward_institution_id") REFERENCES "institutions"("id");--> statement-breakpoint
ALTER TABLE "river_reaches" ADD CONSTRAINT "river_reaches_source_id_data_sources_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_alert_id_alerts_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_incident_id_incidents_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id");--> statement-breakpoint
ALTER TABLE "alert_evidence" ADD CONSTRAINT "alert_evidence_alert_id_alerts_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alert_evidence" ADD CONSTRAINT "alert_evidence_observation_id_observations_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "observations"("id");--> statement-breakpoint
ALTER TABLE "alert_evidence" ADD CONSTRAINT "alert_evidence_field_report_id_field_reports_id_fkey" FOREIGN KEY ("field_report_id") REFERENCES "field_reports"("id");--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_rule_id_anomaly_rules_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "anomaly_rules"("id");--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_site_id_sites_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id");--> statement-breakpoint
ALTER TABLE "field_report_photos" ADD CONSTRAINT "field_report_photos_field_report_id_field_reports_id_fkey" FOREIGN KEY ("field_report_id") REFERENCES "field_reports"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "field_reports" ADD CONSTRAINT "field_reports_alert_id_alerts_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id");--> statement-breakpoint
ALTER TABLE "field_reports" ADD CONSTRAINT "field_reports_site_id_sites_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id");--> statement-breakpoint
ALTER TABLE "incident_actions" ADD CONSTRAINT "incident_actions_incident_id_incidents_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id");--> statement-breakpoint
ALTER TABLE "incident_assignments" ADD CONSTRAINT "incident_assignments_incident_id_incidents_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id");--> statement-breakpoint
ALTER TABLE "incident_assignments" ADD CONSTRAINT "incident_assignments_institution_id_institutions_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id");--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_alert_id_alerts_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id");--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_responsible_institution_id_institutions_id_fkey" FOREIGN KEY ("responsible_institution_id") REFERENCES "institutions"("id");--> statement-breakpoint
ALTER TABLE "validations" ADD CONSTRAINT "validations_alert_id_alerts_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id");
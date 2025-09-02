ALTER TABLE "v2tx_categories" ADD COLUMN "sort" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "v2tx_categories" ADD COLUMN "created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "v2tx_categories" ADD COLUMN "updated_at" timestamp with time zone;

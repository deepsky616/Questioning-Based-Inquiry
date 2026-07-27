ALTER TABLE "unit_designs"
ADD COLUMN "selected_achievements" JSONB NOT NULL DEFAULT '[]'::jsonb;

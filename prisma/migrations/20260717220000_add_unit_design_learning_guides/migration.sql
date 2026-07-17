-- Optional student-facing explanations for a unit design.
-- Existing designs remain unchanged when this column is null.
ALTER TABLE "unit_designs" ADD COLUMN "learning_guides" JSONB;

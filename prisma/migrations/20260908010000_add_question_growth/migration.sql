CREATE TABLE "question_growth" (
  "question_id" TEXT NOT NULL,
  "original_content" TEXT NOT NULL,
  "revised_content" TEXT NOT NULL,
  "reflection" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "question_growth_pkey" PRIMARY KEY ("question_id"),
  CONSTRAINT "question_growth_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "question_growth_updated_at_idx" ON "question_growth"("updated_at");
REVOKE ALL PRIVILEGES ON TABLE "question_growth" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON TABLE "question_growth" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON TABLE "question_growth" FROM authenticated;
  END IF;
END $$;
ALTER TABLE "question_growth" ENABLE ROW LEVEL SECURITY;

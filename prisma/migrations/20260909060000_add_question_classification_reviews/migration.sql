CREATE TABLE "question_classification_reviews" (
  "id" TEXT NOT NULL,
  "question_id" TEXT NOT NULL,
  "reviewer_id" TEXT,
  "previous_closure" TEXT NOT NULL,
  "previous_cognitive" TEXT NOT NULL,
  "closure" TEXT NOT NULL,
  "cognitive" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "question_classification_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "question_classification_reviews_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "question_classification_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "question_classification_reviews_question_id_created_at_id_idx" ON "question_classification_reviews"("question_id", "created_at", "id");
REVOKE ALL PRIVILEGES ON TABLE "question_classification_reviews" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL PRIVILEGES ON TABLE "question_classification_reviews" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL PRIVILEGES ON TABLE "question_classification_reviews" FROM authenticated;
  END IF;
END $$;
ALTER TABLE "question_classification_reviews" ENABLE ROW LEVEL SECURITY;

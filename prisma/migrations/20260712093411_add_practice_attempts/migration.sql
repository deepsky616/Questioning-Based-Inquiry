-- CreateTable
CREATE TABLE "practice_attempts" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "item_id" TEXT,
    "quiz_type" TEXT,
    "correct" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practice_attempts_item_id_created_at_idx" ON "practice_attempts"("item_id", "created_at");

-- CreateIndex
CREATE INDEX "practice_attempts_student_id_created_at_idx" ON "practice_attempts"("student_id", "created_at");

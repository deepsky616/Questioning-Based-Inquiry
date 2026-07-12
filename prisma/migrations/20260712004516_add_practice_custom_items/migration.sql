-- CreateTable
CREATE TABLE "practice_custom_items" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "content" TEXT,
    "closure" TEXT,
    "cognitive" TEXT,
    "explanation" TEXT,
    "source" TEXT,
    "target" TEXT,
    "hint" TEXT,
    "example" TEXT,
    "title" TEXT,
    "passage" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_custom_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "practice_custom_items_teacher_id_mode_idx" ON "practice_custom_items"("teacher_id", "mode");

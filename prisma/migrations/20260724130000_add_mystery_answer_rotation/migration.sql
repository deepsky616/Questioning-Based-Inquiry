CREATE TABLE "mystery_answer_uses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "selection_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mystery_answer_uses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uniq_mystery_answer_selection"
ON "mystery_answer_uses"("user_id", "selection_key");

CREATE INDEX "mystery_answer_uses_user_id_created_at_idx"
ON "mystery_answer_uses"("user_id", "created_at");

CREATE INDEX "mystery_answer_uses_item_id_created_at_idx"
ON "mystery_answer_uses"("item_id", "created_at");

ALTER TABLE "mystery_answer_uses"
ADD CONSTRAINT "mystery_answer_uses_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

REVOKE ALL PRIVILEGES ON TABLE "mystery_answer_uses" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "mystery_answer_uses" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "mystery_answer_uses" FROM authenticated';
  END IF;
END
$$;

ALTER TABLE "mystery_answer_uses" ENABLE ROW LEVEL SECURITY;

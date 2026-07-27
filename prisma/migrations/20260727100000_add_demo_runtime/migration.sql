ALTER TABLE "users"
ADD COLUMN "is_demo" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "demo_ai_daily_usages" (
  "user_id" TEXT NOT NULL,
  "usage_date" TEXT NOT NULL,
  "request_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "demo_ai_daily_usages_pkey" PRIMARY KEY ("user_id", "usage_date")
);

ALTER TABLE "demo_ai_daily_usages"
ADD CONSTRAINT "demo_ai_daily_usages_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "demo_ai_daily_usages" ENABLE ROW LEVEL SECURITY;

-- CreateTable
CREATE TABLE "game_runs" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "owner_id" TEXT,
    "creation_request_id" TEXT NOT NULL,
    "creation_request_fingerprint" TEXT NOT NULL,
    "room_lifetime_key" TEXT,
    "participants" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "state" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "score_date" TEXT,
    "completed_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_activities" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "request_id" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "valid_question_count" INTEGER NOT NULL DEFAULT 0,
    "score_value" INTEGER NOT NULL DEFAULT 0,
    "response_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_activities_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "point_logs" ADD COLUMN "game_run_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "game_runs_room_lifetime_key_key" ON "game_runs"("room_lifetime_key");
CREATE UNIQUE INDEX "uniq_game_run_creation_request" ON "game_runs"("owner_id", "creation_request_id");
CREATE INDEX "game_runs_owner_id_status_updated_at_idx" ON "game_runs"("owner_id", "status", "updated_at");
CREATE INDEX "game_runs_status_expires_at_idx" ON "game_runs"("status", "expires_at");
CREATE INDEX "game_runs_mode_score_date_idx" ON "game_runs"("mode", "score_date");
CREATE UNIQUE INDEX "uniq_game_activity_request" ON "game_activities"("run_id", "request_id");
CREATE UNIQUE INDEX "uniq_game_activity_sequence" ON "game_activities"("run_id", "sequence");
CREATE INDEX "game_activities_actor_id_created_at_idx" ON "game_activities"("actor_id", "created_at");
CREATE INDEX "game_activities_run_id_type_idx" ON "game_activities"("run_id", "type");
CREATE UNIQUE INDEX "uniq_point_per_game_run" ON "point_logs"("student_id", "game_run_id", "bonus_type");

-- AddForeignKey
ALTER TABLE "game_runs" ADD CONSTRAINT "game_runs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "game_activities" ADD CONSTRAINT "game_activities_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "game_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "game_activities" ADD CONSTRAINT "game_activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "point_logs" ADD CONSTRAINT "point_logs_game_run_id_fkey" FOREIGN KEY ("game_run_id") REFERENCES "game_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep server-owned evidence unavailable through the Data API.
REVOKE ALL PRIVILEGES ON TABLE "game_runs", "game_activities" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "game_runs", "game_activities" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "game_runs", "game_activities" FROM authenticated';
  END IF;
END
$$;

ALTER TABLE "game_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "game_activities" ENABLE ROW LEVEL SECURITY;

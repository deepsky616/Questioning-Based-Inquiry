-- CreateIndex
CREATE INDEX "game_runs_owner_id_status_expires_at_idx" ON "game_runs"("owner_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "point_logs_game_run_id_idx" ON "point_logs"("game_run_id");

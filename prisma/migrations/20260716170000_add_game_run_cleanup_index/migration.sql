-- CreateIndex
CREATE INDEX "game_runs_status_updated_at_id_idx" ON "game_runs"("status", "updated_at", "id");

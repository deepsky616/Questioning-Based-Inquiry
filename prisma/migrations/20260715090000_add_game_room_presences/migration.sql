-- CreateTable
CREATE TABLE "game_room_presences" (
    "room_code" TEXT NOT NULL,
    "room_created_at" BIGINT NOT NULL,
    "user_id" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_room_presences_pkey" PRIMARY KEY ("room_code", "room_created_at", "user_id")
);

-- CreateIndex
CREATE INDEX "game_room_presences_last_seen_at_idx" ON "game_room_presences"("last_seen_at");

-- AddForeignKey
ALTER TABLE "game_room_presences" ADD CONSTRAINT "game_room_presences_room_code_fkey" FOREIGN KEY ("room_code") REFERENCES "game_rooms"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep this server-owned table unavailable through the Data API.
REVOKE ALL PRIVILEGES ON TABLE "game_room_presences" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "game_room_presences" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "game_room_presences" FROM authenticated';
  END IF;
END
$$;

ALTER TABLE "game_room_presences" ENABLE ROW LEVEL SECURITY;

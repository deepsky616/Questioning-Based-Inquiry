-- CreateTable
CREATE TABLE "game_room_create_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_room_create_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_room_create_attempts_user_id_created_at_idx" ON "game_room_create_attempts"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "game_room_create_attempts" ADD CONSTRAINT "game_room_create_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep this server-owned table unavailable through the Data API.
REVOKE ALL PRIVILEGES ON TABLE "game_room_create_attempts" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "game_room_create_attempts" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "game_room_create_attempts" FROM authenticated';
  END IF;
END
$$;

ALTER TABLE "game_room_create_attempts" ENABLE ROW LEVEL SECURITY;

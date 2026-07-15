import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "prisma/migrations/20260715100000_add_game_room_create_attempts/migration.sql";
const schema = readFileSync("prisma/schema.prisma", "utf8");
const schemaCheck = readFileSync("scripts/check-db-schema.mjs", "utf8");

describe("질문놀이 방 생성 제한 스키마", () => {
  it("사용자별 생성 시도를 별도 표와 시간 색인으로 보존한다", () => {
    expect(schema).toContain("model GameRoomCreateAttempt");
    expect(schema).toContain("@@index([userId, createdAt])");
    expect(schema).toContain('@@map("game_room_create_attempts")');
    expect(existsSync(migrationPath)).toBe(true);

    const migration = existsSync(migrationPath)
      ? readFileSync(migrationPath, "utf8")
      : "";
    expect(migration).toContain('CREATE TABLE "game_room_create_attempts"');
    expect(migration).toContain(
      'REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE',
    );
    expect(migration).toContain(
      'CREATE INDEX "game_room_create_attempts_user_id_created_at_idx"',
    );
  });

  it("외부 자료 접근을 막고 배포 확인 목록에 포함한다", () => {
    const migration = existsSync(migrationPath)
      ? readFileSync(migrationPath, "utf8")
      : "";
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE "game_room_create_attempts" FROM PUBLIC',
    );
    expect(migration).toContain(
      'ALTER TABLE "game_room_create_attempts" ENABLE ROW LEVEL SECURITY',
    );
    expect(schemaCheck).toContain('"game_room_create_attempts"');
  });
});

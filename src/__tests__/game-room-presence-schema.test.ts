import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "prisma/migrations/20260715090000_add_game_room_presences/migration.sql",
  "utf8",
);
const schemaCheck = readFileSync("scripts/check-db-schema.mjs", "utf8");

describe("질문놀이 접속 상태 스키마", () => {
  it("방 수명과 사용자를 묶은 기본키 및 방 삭제 연동 삭제를 정의한다", () => {
    expect(schema).toContain("model GameRoomPresence");
    expect(schema).toContain("roomCreatedAt BigInt");
    expect(schema).toContain("@@id([roomCode, roomCreatedAt, userId])");
    expect(schema).toContain("@@index([lastSeenAt])");
    expect(schema).toContain("onDelete: Cascade");

    expect(migration).toContain('CREATE TABLE "game_room_presences"');
    expect(migration).toContain(
      'PRIMARY KEY ("room_code", "room_created_at", "user_id")',
    );
    expect(migration).toContain(
      'REFERENCES "game_rooms"("code") ON DELETE CASCADE ON UPDATE CASCADE',
    );
  });

  it("자료 접근 역할을 차단하고 행 보안을 켜며 배포 확인 목록에 넣는다", () => {
    expect(migration).toContain(
      'REVOKE ALL PRIVILEGES ON TABLE "game_room_presences" FROM PUBLIC',
    );
    expect(migration).toContain(
      'ALTER TABLE "game_room_presences" ENABLE ROW LEVEL SECURITY',
    );
    expect(schemaCheck).toContain('"game_room_presences"');
  });

  it("기존 자료를 변경하거나 옮기는 구문을 포함하지 않는다", () => {
    expect(migration).not.toMatch(
      /^\s*(?:INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|TRUNCATE\s+)/im,
    );
    expect(migration).not.toContain("ALTER TABLE \"game_rooms\"");
  });
});

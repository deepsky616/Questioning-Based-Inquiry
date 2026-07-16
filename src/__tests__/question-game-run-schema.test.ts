import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("질문놀이 서버 실행 자료 구조", () => {
  it("기존 자료를 바꾸지 않는 실행, 활동, 점수 연결 구조를 둔다", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

    expect(schema).toContain("model GameRun {");
    expect(schema).toContain("model GameActivity {");
    expect(schema).toContain("gameRunId");
    expect(schema).toContain("@@unique([ownerId, creationRequestId]");
    expect(schema).toContain("@@unique([runId, requestId]");
    expect(schema).toContain("@@unique([runId, sequence]");
    expect(schema).toContain("@@unique([studentId, gameRunId, bonusType]");
  });

  it("마이그레이션은 추가 작업만 수행한다", () => {
    const appliedSql = readFileSync(
      join(process.cwd(), "prisma/migrations/20260716150000_add_question_game_runs/migration.sql"),
      "utf8",
    );
    const indexMigrationPath = join(
      process.cwd(),
      "prisma/migrations/20260716160000_add_question_game_run_query_indexes/migration.sql",
    );
    expect(existsSync(indexMigrationPath)).toBe(true);
    const indexSql = readFileSync(indexMigrationPath, "utf8");
    const indexStatements = indexSql
      .split(";")
      .map((statement) => statement.replace(/^--.*$/gm, "").trim())
      .filter(Boolean);
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

    expect(createHash("sha256").update(appliedSql).digest("hex")).toBe(
      "e51f1e5a40fca0ccb4d43872493ecc0c4379743e9217af82128958f98d958694",
    );
    expect(createHash("sha256").update(indexSql).digest("hex")).toBe(
      "513a93d13b9672528f15157735cbad05147e7dee5f14b5a33d63032615b40ecf",
    );
    expect(indexSql).toContain(
      'CREATE INDEX "game_runs_owner_id_status_expires_at_idx" ON "game_runs"("owner_id", "status", "expires_at")',
    );
    expect(indexSql).toContain(
      'CREATE INDEX "point_logs_game_run_id_idx" ON "point_logs"("game_run_id")',
    );
    expect(indexStatements).toEqual([
      'CREATE INDEX "game_runs_owner_id_status_expires_at_idx" ON "game_runs"("owner_id", "status", "expires_at")',
      'CREATE INDEX "point_logs_game_run_id_idx" ON "point_logs"("game_run_id")',
    ]);
    expect(schema).toContain("@@index([ownerId, status, expiresAt])");
    expect(schema).toContain("@@index([gameRunId])");
  });

  it("오래된 실행 정리 순서에 맞는 색인을 별도 마이그레이션으로 추가한다", () => {
    const migrationPath = join(
      process.cwd(),
      "prisma/migrations/20260716170000_add_game_run_cleanup_index/migration.sql",
    );
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");
    const statements = sql
      .split(";")
      .map((statement) => statement.replace(/^--.*$/gm, "").trim())
      .filter(Boolean);
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

    expect(createHash("sha256").update(sql).digest("hex")).toBe(
      "4d47d39f8f2fbe5c766c9d3429ccd3bf3ba62a1afbb65eb29971101c875ec0e6",
    );
    expect(statements).toEqual([
      'CREATE INDEX "game_runs_status_updated_at_id_idx" ON "game_runs"("status", "updated_at", "id")',
    ]);
    expect(schema).toContain("@@index([status, updatedAt, id])");
  });
});

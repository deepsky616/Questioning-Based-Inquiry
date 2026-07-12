import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };
const dbCheckScript = readFileSync("scripts/check-db-schema.mjs", "utf8");
const diffGuardPath = "scripts/check-prisma-diff.mjs";
const diffGuardScript = existsSync(diffGuardPath) ? readFileSync(diffGuardPath, "utf8") : "";
const vercelConfigPath = "vercel.json";
const vercelConfig = existsSync(vercelConfigPath)
  ? JSON.parse(readFileSync(vercelConfigPath, "utf8")) as { buildCommand?: string }
  : null;

describe("Prisma deployment guards", () => {
  it("runs schema guards after prisma generate and before the production build", () => {
    expect(packageJson.scripts?.["db:diff:check"]).toBe("node scripts/check-prisma-diff.mjs");
    // generate가 가드보다 먼저여야 한다 — db:check가 PrismaClient를 쓰므로
    // Vercel(의존성 캐시)에서는 generate 전에 실행되면 초기화 에러로 빌드가 죽는다
    expect(packageJson.scripts?.build).toBe(
      "prisma generate && npm run db:diff:check && npm run db:check && npm run db:security:check && next build",
    );
    expect(vercelConfig?.buildCommand).toBe("npm run build");
  });

  it("checks every core table used by teacher and student pages", () => {
    [
      "users",
      "teacher_classes",
      "password_reset_tokens",
      "question_sessions",
      "questions",
      "comments",
      "question_likes",
      "point_logs",
      "app_notifications",
      "game_rooms",
      "question_game_customs",
      "question_game_visibilities",
      "question_game_orders",
      "curriculum_areas",
      "unit_designs",
      "translations",
      "session_analyses",
      "system_configs",
    ].forEach((tableName) => {
      expect(dbCheckScript).toContain(`"${tableName}"`);
    });
  });

  it("loads local env files so guarded builds work outside Vercel", () => {
    expect(dbCheckScript).toContain("loadLocalEnv");
    expect(dbCheckScript).toContain(".env.local");
    expect(diffGuardScript).toContain("loadLocalEnv");
    expect(diffGuardScript).toContain(".env.local");
  });

  it("limits Prisma diff runtime so Vercel builds cannot hang indefinitely", () => {
    expect(diffGuardScript).toContain("PRISMA_DIFF_TIMEOUT_MS");
    expect(diffGuardScript).toContain("timeout: PRISMA_DIFF_TIMEOUT_MS");
    expect(diffGuardScript).toContain("Prisma diff check timed out");
  });

  it("skips the live Prisma diff on Vercel where network diff can stall builds", () => {
    expect(diffGuardScript).toContain("shouldSkipPrismaDiffCheck");
    expect(diffGuardScript).toContain("process.env.VERCEL");
    expect(diffGuardScript).toContain("FORCE_PRISMA_DIFF_CHECK");
    expect(diffGuardScript).toContain("Skipping Prisma diff guard on Vercel");
  });

  it("keeps a migration baseline so schema history and drift detection work", () => {
    // 2026-07 프로덕션에서 db push 드리프트로 2만 2천 건의 런타임 오류가 발생했다
    // (app_notifications 테이블·enum 부재). 스키마 변경은 migrate dev로 이력을 남긴다.
    expect(existsSync("prisma/migrations/migration_lock.toml")).toBe(true);
    expect(existsSync("prisma/migrations/20260712000000_init/migration.sql")).toBe(true);
    expect(readFileSync("prisma/migrations/20260712000000_init/migration.sql", "utf8")).toContain('CREATE TABLE "users"');
    expect(packageJson.scripts?.["db:migrate"]).toContain("migrate dev");
    expect(packageJson.scripts?.["db:migrate:deploy"]).toContain("migrate deploy");
  });

  it("fails deployment when Prisma diff contains destructive operations", async () => {
    expect(existsSync(diffGuardPath)).toBe(true);
    const { findDestructivePrismaDiffLines } = await import("../../scripts/check-prisma-diff.mjs");

    const dangerousDiff = [
      "-- AlterTable",
      "ALTER TABLE \"users\" DROP COLUMN \"role\",",
      "ADD COLUMN \"role\" \"UserRole\" NOT NULL;",
      "-- DropTable",
      "DROP TABLE \"app_notifications\";",
    ].join("\n");

    expect(findDestructivePrismaDiffLines(dangerousDiff)).toEqual([
      "ALTER TABLE \"users\" DROP COLUMN \"role\",",
      "DROP TABLE \"app_notifications\";",
    ]);
  });
});

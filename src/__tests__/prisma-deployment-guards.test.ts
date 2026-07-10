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
  it("runs schema guards before the production build", () => {
    expect(packageJson.scripts?.["db:diff:check"]).toBe("node scripts/check-prisma-diff.mjs");
    expect(packageJson.scripts?.build).toBe(
      "npm run db:diff:check && npm run db:check && prisma generate && next build",
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

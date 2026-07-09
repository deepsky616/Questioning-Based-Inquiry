import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };
const dbCheckPath = "scripts/check-db-schema.mjs";
const dbCheckScript = existsSync(dbCheckPath) ? readFileSync(dbCheckPath, "utf8") : "";

describe("Prisma domain model hardening", () => {
  it("uses Prisma enums for core role and status values instead of open strings", () => {
    expect(schema).toContain("enum UserRole");
    expect(schema).toContain("enum PointStatus");
    expect(schema).toContain("enum SessionTargetType");
    expect(schema).toContain("enum AnalysisScope");

    expect(schema).toMatch(/role\s+UserRole\s+@map\("role"\)/);
    expect(schema).toMatch(/status\s+PointStatus\s+@default\(APPROVED\)\s+@map\("status"\)/);
    expect(schema).toMatch(/targetType\s+SessionTargetType\s+@default\(ALL\)\s+@map\("target_type"\)/);
    expect(schema).toMatch(/scope\s+AnalysisScope\s+@map\("scope"\)/);
  });

  it("stores live question game rooms in a dedicated model instead of SystemConfig", () => {
    expect(schema).toContain("model GameRoom");
    expect(schema).toContain("@@map(\"game_rooms\")");
  });

  it("provides an explicit deployment schema check for the new Prisma tables", () => {
    expect(packageJson.scripts?.["db:check"]).toBe("node scripts/check-db-schema.mjs");
    expect(existsSync(dbCheckPath)).toBe(true);
    expect(dbCheckScript).toContain("game_rooms");
    expect(dbCheckScript).toContain("question_game_customs");
    expect(dbCheckScript).toContain("question_game_visibilities");
    expect(dbCheckScript).toContain("question_game_orders");
    expect(dbCheckScript).toContain("DATABASE_URL");
  });

  it("moves teacher question game settings out of SystemConfig into dedicated tables", () => {
    expect(schema).toContain("model QuestionGameCustom");
    expect(schema).toContain("@@map(\"question_game_customs\")");
    expect(schema).toContain("model QuestionGameVisibility");
    expect(schema).toContain("@@map(\"question_game_visibilities\")");
    expect(schema).toContain("model QuestionGameOrder");
    expect(schema).toContain("@@map(\"question_game_orders\")");
  });
});

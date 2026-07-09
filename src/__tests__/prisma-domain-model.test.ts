import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const schema = readFileSync("prisma/schema.prisma", "utf8");

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
});

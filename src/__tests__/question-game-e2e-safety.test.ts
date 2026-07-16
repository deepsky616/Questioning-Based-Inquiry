import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const helperPath = "e2e/helpers/question-game-room.ts";
const runHelperPath = "e2e/helpers/question-game-run.ts";
const specPath = "e2e/question-games-reliability.spec.ts";

function readSource(path: string) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

describe("question game browser safety boundary", () => {
  it("keeps the database-free browser helper and reliability spec", () => {
    expect(existsSync(helperPath)).toBe(true);
    expect(existsSync(runHelperPath)).toBe(true);
    expect(existsSync(specPath)).toBe(true);

    const source = [helperPath, runHelperPath, specPath].map(readSource).join("\n");
    expect(source).not.toMatch(/@prisma\/client|PrismaClient|DATABASE_URL/);
    expect(source).not.toMatch(/(?:from|import\()\s*["'][^"']*test-db/);
    expect(source).not.toMatch(/prepareTest|cleanupTestArtifacts|\bprisma\b/i);
  });

  it("uses signed sessions and the real pure room boundary", () => {
    const helper = readSource(helperPath);

    expect(helper).toContain('from "next-auth/jwt"');
    expect(helper).toContain("encode(");
    expect(helper).toContain('salt: "authjs.session-token"');
    expect(helper).toContain("applyQuestionGameRoomCommand");
    expect(helper).toContain("leaveQuestionGameRoom");
    expect(helper).toContain("restartQuestionGameRoom");
    expect(helper).toContain("toPublicGameRoom");
    expect(helper).toContain("context.route(");
    expect(helper).toContain("createBrowserQuestionGameRunStore");
  });

  it("forbids arbitrary sleeps and requires split reliability flows", () => {
    const helper = readSource(helperPath);
    const spec = readSource(specPath);
    const source = `${helper}\n${spec}`;

    expect(source).not.toContain("waitForTimeout(");
    expect(helper).toContain("expectSvgStrokeContrast");
    expect(helper).toContain("expectNoBoxOverlap");
    expect(helper).toContain("element.x1.baseVal.value");
    expect(helper).toContain("context.close().catch");
    expect(spec).toContain("두 명");
    expect(spec).toContain("여덟 명");
    expect(spec).toContain("미스터리");
    expect(spec).toContain("짝 찾기");
    expect(spec).toContain("사다리");
    expect(spec).toContain("화면 대비");
  });
});

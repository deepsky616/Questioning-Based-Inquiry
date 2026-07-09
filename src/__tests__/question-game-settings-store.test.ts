import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const storePath = "src/lib/question-game-settings-store.ts";
const store = existsSync(storePath) ? readFileSync(storePath, "utf8") : "";
const studentRoute = readFileSync("src/app/api/question-games/route.ts", "utf8");
const teacherRoute = readFileSync("src/app/api/teacher/question-games/route.ts", "utf8");
const teacherItemRoute = readFileSync("src/app/api/teacher/question-games/[id]/route.ts", "utf8");
const orderRoute = readFileSync("src/app/api/teacher/question-games/order/route.ts", "utf8");

describe("question game settings store", () => {
  it("centralizes teacher question game settings in a dedicated store", () => {
    expect(existsSync(storePath)).toBe(true);
    expect(store).toContain("prisma.questionGameCustom");
    expect(store).toContain("prisma.questionGameVisibility");
    expect(store).toContain("prisma.questionGameOrder");
    expect(store).not.toContain("systemConfig");
  });

  it("keeps question game setting routes off SystemConfig", () => {
    for (const source of [studentRoute, teacherRoute, teacherItemRoute, orderRoute]) {
      expect(source).not.toContain("systemConfig");
    }

    expect(studentRoute).toContain("loadQuestionGameSettingsForTeachers");
    expect(teacherRoute).toContain("loadQuestionGameSettings");
    expect(teacherItemRoute).toContain("saveQuestionGameVisibility");
    expect(orderRoute).toContain("saveQuestionGameOrder");
  });
});

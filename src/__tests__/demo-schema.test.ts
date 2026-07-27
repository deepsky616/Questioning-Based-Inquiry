import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("시연 실행 자료 구조", () => {
  it("기존 사용자는 일반 사용자이며 하루 인공지능 사용량을 별도 저장한다", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");

    expect(schema).toContain('isDemo Boolean @default(false) @map("is_demo")');
    expect(schema).toContain("model DemoAiDailyUsage");
    expect(schema).toContain(
      '@@id([userId, usageDate], map: "demo_ai_daily_usages_pkey")',
    );
  });

  it("변경문은 추가형이며 새 표의 행 보안을 켠다", () => {
    const migration = readFileSync(
      "prisma/migrations/20260727100000_add_demo_runtime/migration.sql",
      "utf8",
    );

    expect(migration).toContain(
      'ADD COLUMN "is_demo" BOOLEAN NOT NULL DEFAULT false',
    );
    expect(migration).toContain('CREATE TABLE "demo_ai_daily_usages"');
    expect(migration).toContain(
      'ALTER TABLE "demo_ai_daily_usages" ENABLE ROW LEVEL SECURITY',
    );
    expect(migration).not.toContain("DROP TABLE");
    expect(migration).not.toContain("DELETE FROM");
  });
});

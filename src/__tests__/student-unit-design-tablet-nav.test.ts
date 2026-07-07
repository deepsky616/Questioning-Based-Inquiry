import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/student/UnitDesignView.tsx", "utf8");
const koMessages = readFileSync("messages/ko.json", "utf8");
const enMessages = readFileSync("messages/en.json", "utf8");

describe("학생 수업 탐구 질문 태블릿 이동성", () => {
  it("본문 상단에 선택 수업 요약과 목록 바로가기를 제공한다", () => {
    expect(source).toContain("tablet-session-toolbar");
    expect(source).toContain("unit-design-session-list");
    expect(source).toContain("unit-design-detail-panel");
    expect(source).toContain("href=\"#unit-design-session-list\"");
    expect(source).toContain("t(\"backToList\")");
  });

  it("선택 수업의 이전·다음 이동 버튼과 현재 위치를 제공한다", () => {
    expect(source).toContain("selectedSessionIndex");
    expect(source).toContain("selectSessionByOffset");
    expect(source).toContain("t(\"prevSession\")");
    expect(source).toContain("t(\"nextSession\")");
    expect(source).toContain("t(\"sessionPosition\"");
  });

  it("새 안내 문구는 한국어와 영어 번역을 모두 가진다", () => {
    for (const key of ["backToList", "prevSession", "nextSession", "sessionPosition"]) {
      expect(koMessages).toContain(`"${key}"`);
      expect(enMessages).toContain(`"${key}"`);
    }
  });
});

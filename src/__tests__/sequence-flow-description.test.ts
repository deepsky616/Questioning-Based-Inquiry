import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/teacher/QuestionSequenceEditor.tsx", "utf8");

describe("단원 설계 기준 설명 위치", () => {
  it("선택한 기준 설명을 기준 선택 영역 바로 아래에 보여준다", () => {
    expect(source).toContain("flow-help-inline");
    expect(source).toMatch(/<Select value=\{flowId\} onValueChange=\{setFlowId\}>[\s\S]*flow-help-inline/);
  });

  it("기준 설명을 아래쪽의 별도 도움 패널로 분리하지 않는다", () => {
    expect(source).not.toContain("선택한 탐구 흐름 설명");
  });
});

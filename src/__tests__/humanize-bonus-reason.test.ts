import { describe, it, expect } from "vitest";
import { humanizeBonusReason } from "@/lib/activity-bonus-policy";

// AI 추천 포인트 근거에 내부 id(cuid)가 노출되던 결함의 재발 방지 가드
describe("humanizeBonusReason — 근거 문장의 내부 id를 내용 인용으로 치환", () => {
  const contentById = new Map([
    ["cmpuifl5y000ppm1wglmpzj1a", "식물은 왜 초록색일까요?"],
    ["cmqqqqqqq000ppm1wglmpzj2b", "아주 긴 질문 내용입니다 삼십 자를 넘기기 위해 계속 길게 씁니다 끝까지"],
  ]);

  it("근거 속 질문 id를 따옴표 인용문으로 바꾼다", () => {
    const out = humanizeBonusReason(
      "황지우 학생의 질문(cmpuifl5y000ppm1wglmpzj1a)과 의미가 거의 같습니다.",
      contentById,
    );
    expect(out).toBe("황지우 학생의 질문(“식물은 왜 초록색일까요?”)과 의미가 거의 같습니다.");
    expect(out).not.toContain("cmpuifl5y");
  });

  it("긴 내용은 30자에서 말줄임하고, 여러 id도 모두 치환한다", () => {
    const out = humanizeBonusReason(
      "cmpuifl5y000ppm1wglmpzj1a 그리고 cmqqqqqqq000ppm1wglmpzj2b 둘 다 유사.",
      contentById,
    );
    expect(out).toContain("“식물은 왜 초록색일까요?”");
    expect(out).toContain("…”");
    expect(out).not.toMatch(/cm[a-z0-9]{20,}/);
  });

  it("id가 없는 근거는 그대로 둔다", () => {
    const reason = "주제와 직접 관련된 좋은 질문입니다.";
    expect(humanizeBonusReason(reason, contentById)).toBe(reason);
  });
});

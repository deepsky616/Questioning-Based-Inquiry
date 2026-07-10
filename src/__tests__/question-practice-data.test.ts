import { describe, it, expect } from "vitest";
import {
  PRACTICE_QUIZ_BANK,
  PRACTICE_TRANSFORM_BANK,
  PRACTICE_CREATE_TOPICS,
  drawFromDeck,
  isTargetAchieved,
} from "@/lib/question-practice-data";

describe("질문 연습 문항 은행 — 데이터 유효성", () => {
  it("모든 은행의 id는 중복이 없다", () => {
    for (const bank of [PRACTICE_QUIZ_BANK, PRACTICE_TRANSFORM_BANK, PRACTICE_CREATE_TOPICS]) {
      const ids = bank.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("분류 문항은 유형별로 고르게 있고 전부 해설을 갖는다", () => {
    const byCognitive = { factual: 0, conceptual: 0, controversial: 0 };
    const byClosure = { closed: 0, open: 0 };
    for (const q of PRACTICE_QUIZ_BANK) {
      byCognitive[q.cognitive]++;
      byClosure[q.closure]++;
      expect(q.explanation.length).toBeGreaterThan(10);
    }
    // 세 유형 모두 충분히 — 한 유형만 연습되는 편향 방지 (확장 은행 기준)
    expect(byCognitive.factual).toBeGreaterThanOrEqual(15);
    expect(byCognitive.conceptual).toBeGreaterThanOrEqual(15);
    expect(byCognitive.controversial).toBeGreaterThanOrEqual(15);
    expect(byClosure.closed).toBeGreaterThanOrEqual(15);
    expect(byClosure.open).toBeGreaterThanOrEqual(15);
    // 셔플백 한 바퀴가 충분히 길도록 전체 규모도 지킨다
    expect(PRACTICE_QUIZ_BANK.length).toBeGreaterThanOrEqual(60);
  });

  it("문항·예시는 classify API 상한(200자) 안이다", () => {
    for (const q of PRACTICE_QUIZ_BANK) expect(q.content.length).toBeLessThanOrEqual(200);
    for (const item of PRACTICE_TRANSFORM_BANK) {
      expect(item.source.length).toBeLessThanOrEqual(200);
      expect(item.example.length).toBeLessThanOrEqual(200);
      expect(item.hint.length).toBeGreaterThan(5);
    }
  });

  it("전환 문항은 세 가지 목표 유형을 모두 포함한다", () => {
    const targets = new Set(PRACTICE_TRANSFORM_BANK.map((x) => x.target));
    expect(targets).toEqual(new Set(["open", "conceptual", "controversial"]));
  });
});

describe("drawFromDeck — 셔플백 출제 (한 바퀴 안에 중복 없음)", () => {
  it("은행을 전부 소진할 때까지 같은 문항이 다시 나오지 않는다", () => {
    const seen = new Set<string>();
    let draw = drawFromDeck(PRACTICE_QUIZ_BANK, []);
    seen.add(draw.item.id);
    for (let i = 1; i < PRACTICE_QUIZ_BANK.length; i++) {
      draw = drawFromDeck(PRACTICE_QUIZ_BANK, draw.remaining, draw.item.id);
      expect(seen.has(draw.item.id)).toBe(false);
      seen.add(draw.item.id);
    }
    expect(seen.size).toBe(PRACTICE_QUIZ_BANK.length);
    expect(draw.remaining).toHaveLength(0);
  });

  it("소진 후 다시 채울 때 직전 문항이 곧바로 반복되지 않는다", () => {
    for (let i = 0; i < 30; i++) {
      const next = drawFromDeck(PRACTICE_QUIZ_BANK, [], "q01");
      expect(next.item.id).not.toBe("q01");
    }
  });

  it("은행 크기가 1이면 같은 항목이라도 반환한다", () => {
    const single = [{ id: "only" }];
    expect(drawFromDeck(single, [], "only").item.id).toBe("only");
  });
});

describe("isTargetAchieved — 목표 달성 판정", () => {
  it("닫힌→열린: closure가 open이면 성공", () => {
    expect(isTargetAchieved("open", { closure: "open", cognitive: "factual" })).toBe(true);
    expect(isTargetAchieved("open", { closure: "closed", cognitive: "conceptual" })).toBe(false);
  });

  it("사실적→개념적: 개념적이면 성공, 더 깊은 논쟁적도 인정한다", () => {
    expect(isTargetAchieved("conceptual", { closure: "open", cognitive: "conceptual" })).toBe(true);
    expect(isTargetAchieved("conceptual", { closure: "open", cognitive: "controversial" })).toBe(true);
    expect(isTargetAchieved("conceptual", { closure: "closed", cognitive: "factual" })).toBe(false);
  });

  it("논쟁적 목표는 논쟁적일 때만 성공", () => {
    expect(isTargetAchieved("controversial", { closure: "open", cognitive: "controversial" })).toBe(true);
    expect(isTargetAchieved("controversial", { closure: "open", cognitive: "conceptual" })).toBe(false);
  });
});

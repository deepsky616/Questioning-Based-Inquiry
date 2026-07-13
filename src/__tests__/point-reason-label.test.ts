import { describe, expect, it } from "vitest";
import {
  normalizePointReasonForDisplay,
  practiceCreatePointReason,
  practiceQuizPointReason,
  practiceTransformPointReason,
} from "@/lib/point-reason-label";

describe("포인트 사유 표시 문구", () => {
  it("질문 연습 분류 포인트의 내부 문항 코드와 영어 분류 코드를 한국어로 바꾼다", () => {
    expect(normalizePointReasonForDisplay("질문 연습: 분류 정답 (q56/cognitive)")).toBe(
      "질문 연습: 사실적·개념적·논쟁적 질문 분류 정답",
    );
    expect(normalizePointReasonForDisplay("질문 연습: 분류 정답 (q12/closure)")).toBe(
      "질문 연습: 닫힌 질문·열린 질문 분류 정답",
    );
  });

  it("질문 바꾸기와 만들기 포인트의 내부 문항 코드를 숨긴다", () => {
    expect(normalizePointReasonForDisplay("질문 연습: 질문 바꾸기 성공 (t01)")).toBe(
      "질문 연습: 질문 바꾸기 성공",
    );
    expect(normalizePointReasonForDisplay("질문 연습: 질문 만들기 성공 (c01/conceptual)")).toBe(
      "질문 연습: 개념적 질문 만들기 성공",
    );
  });

  it("새로 저장할 질문 연습 포인트 사유를 한국어 문장으로 만든다", () => {
    expect(practiceQuizPointReason("cognitive")).toBe("질문 연습: 사실적·개념적·논쟁적 질문 분류 정답");
    expect(practiceTransformPointReason("open")).toBe("질문 연습: 열린 질문으로 바꾸기 성공");
    expect(practiceCreatePointReason("controversial", true)).toBe(
      "질문 연습: 논쟁적 질문 만들기 성공 (인공지능 출제)",
    );
  });
});

"use client";

import { summarizeQuestionTypes } from "@/lib/stats-calc";
import { matchesCognitiveCategory } from "@/lib/question-labels";

export type ClosureFilter = "all" | "closed" | "open";
export type CognitiveFilter = "all" | "factual" | "conceptual" | "controversial";

/** 분류1(폐쇄/개방)·분류2(사실/개념/논쟁) 필터를 적용한다 (학생/교사 공용) */
export function applyClassificationFilter<T extends { closure: string; cognitive: string }>(
  questions: T[],
  closure: ClosureFilter,
  cognitive: CognitiveFilter,
): T[] {
  return questions.filter(
    (q) =>
      (closure === "all" || q.closure === closure) &&
      (cognitive === "all" || matchesCognitiveCategory(q.cognitive, cognitive)),
  );
}

/**
 * 질문 분류 통계 현황 카드 — 막대(클릭 시 필터) + 분류 필터 칩.
 * 교사 질문조회의 통계 현황을 학생 페이지에서도 동일하게 쓰기 위한 공용 컴포넌트.
 */
export function QuestionClassificationStats({
  questions,
  filterClosure,
  filterCognitive,
  onFilterClosure,
  onFilterCognitive,
}: {
  questions: { closure: string; cognitive: string }[];
  filterClosure: ClosureFilter;
  filterCognitive: CognitiveFilter;
  onFilterClosure: (v: ClosureFilter) => void;
  onFilterCognitive: (v: CognitiveFilter) => void;
}) {
  const s = summarizeQuestionTypes(questions);
  const pct = (n: number) => (s.total ? Math.round((n / s.total) * 100) : 0);

  const bar = (name: string, value: number, color: string, active: boolean, onClick: () => void) => (
    <button
      key={name}
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 mb-1.5 w-full text-left rounded px-1.5 py-0.5 transition-colors ${active ? "ring-2 ring-indigo-400 bg-indigo-50/60" : "hover:bg-muted/60"}`}
    >
      <span className="w-12 shrink-0 text-xs text-muted-foreground">{name}</span>
      <div className="flex-1 h-3.5 rounded bg-muted overflow-hidden">
        <div style={{ width: `${pct(value)}%`, background: color, height: "100%" }} />
      </div>
      <span className="w-16 shrink-0 text-right text-xs font-semibold text-foreground">{value} ({pct(value)}%)</span>
    </button>
  );

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${active ? "border-indigo-500 bg-indigo-500 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
    >
      {label}
    </button>
  );

  const toggleClosure = (v: "closed" | "open") => onFilterClosure(filterClosure === v ? "all" : v);
  const toggleCognitive = (v: "factual" | "conceptual" | "controversial") =>
    onFilterCognitive(filterCognitive === v ? "all" : v);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <p className="text-sm font-bold text-foreground">
        📊 질문 분류 통계 현황 <span className="text-xs font-normal text-muted-foreground">· 총 {s.total}개</span>
      </p>

      {/* 막대 (클릭 시 필터) */}
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-2">
        <div>
          <p className="text-xs text-muted-foreground font-semibold mb-2">분류1 — 폐쇄형 / 개방형 <span className="font-normal text-gray-400">(클릭해 필터)</span></p>
          {bar("폐쇄형", s.closure.closed, "#3b82f6", filterClosure === "closed", () => toggleClosure("closed"))}
          {bar("개방형", s.closure.open, "#10b981", filterClosure === "open", () => toggleClosure("open"))}
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-semibold mb-2">분류2 — 사실 / 개념 / 논쟁 <span className="font-normal text-gray-400">(클릭해 필터)</span></p>
          {bar("사실적", s.cognitive.factual, "#94a3b8", filterCognitive === "factual", () => toggleCognitive("factual"))}
          {bar("개념적", s.cognitive.conceptual, "#a855f7", filterCognitive === "conceptual", () => toggleCognitive("conceptual"))}
          {bar("논쟁적", s.cognitive.controversial, "#f97316", filterCognitive === "controversial", () => toggleCognitive("controversial"))}
        </div>
      </div>

      {/* 분류 필터 칩 */}
      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t">
        <span className="text-xs text-muted-foreground mr-0.5">분류1</span>
        {chip(filterClosure === "all", "전체", () => onFilterClosure("all"))}
        {chip(filterClosure === "closed", "폐쇄형", () => onFilterClosure("closed"))}
        {chip(filterClosure === "open", "개방형", () => onFilterClosure("open"))}
        <span className="text-xs text-muted-foreground mx-1">분류2</span>
        {chip(filterCognitive === "all", "전체", () => onFilterCognitive("all"))}
        {chip(filterCognitive === "factual", "사실적", () => onFilterCognitive("factual"))}
        {chip(filterCognitive === "conceptual", "개념적", () => onFilterCognitive("conceptual"))}
        {chip(filterCognitive === "controversial", "논쟁적", () => onFilterCognitive("controversial"))}
        {(filterClosure !== "all" || filterCognitive !== "all") && (
          <button type="button" onClick={() => { onFilterClosure("all"); onFilterCognitive("all"); }} className="ml-1 text-xs font-medium text-indigo-600">초기화</button>
        )}
      </div>
    </div>
  );
}

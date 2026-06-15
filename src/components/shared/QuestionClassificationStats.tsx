"use client";

import { summarizeQuestionTypes } from "@/lib/stats-calc";
import { matchesCognitiveCategory } from "@/lib/question-labels";

export type ClosureFilter = "all" | "closed" | "open";
export type CognitiveFilter = "all" | "factual" | "conceptual" | "controversial";

export type SortField = "like" | "comment";
export type SortDir = "desc" | "asc";

/**
 * 전체 질문 목록 정렬 컨트롤 — 기준(좋아요순/댓글순) + 방향(많은순↓/적은순↑).
 * 학생/교사 공용. 기본값은 좋아요 많은 순(like/desc).
 */
export function QuestionSortControl({
  field,
  dir,
  onChange,
}: {
  field: SortField;
  dir: SortDir;
  onChange: (field: SortField, dir: SortDir) => void;
}) {
  const seg = (active: boolean, label: string, onClick: () => void, first: boolean) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium transition-colors ${first ? "" : "border-l"} ${
        active ? "bg-rose-500 text-white" : "bg-background text-muted-foreground hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">정렬</span>
      <div className="flex rounded-md border overflow-hidden">
        {seg(field === "like", "좋아요순", () => onChange("like", dir), true)}
        {seg(field === "comment", "댓글순", () => onChange("comment", dir), false)}
      </div>
      <div className="flex rounded-md border overflow-hidden">
        {seg(dir === "desc", "많은 순 ↓", () => onChange(field, "desc"), true)}
        {seg(dir === "asc", "적은 순 ↑", () => onChange(field, "asc"), false)}
      </div>
    </div>
  );
}

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
 * 질문 분류 통계 현황 카드 — 비율 막대(표시 전용).
 * 필터는 ClassificationChips가 전담하며, 막대는 분포를 한눈에 보여주는 역할만 한다.
 */
export function QuestionClassificationStats({
  questions,
}: {
  questions: { closure: string; cognitive: string }[];
}) {
  const s = summarizeQuestionTypes(questions);
  const pct = (n: number) => (s.total ? Math.round((n / s.total) * 100) : 0);

  const bar = (name: string, value: number, color: string) => (
    <div key={name} className="flex items-center gap-2 mb-1.5 w-full px-1.5 py-0.5">
      <span className="w-12 shrink-0 text-xs text-muted-foreground">{name}</span>
      <div className="flex-1 h-3.5 rounded bg-muted overflow-hidden">
        <div style={{ width: `${pct(value)}%`, background: color, height: "100%" }} />
      </div>
      <span className="w-16 shrink-0 text-right text-xs font-semibold text-foreground">{value} ({pct(value)}%)</span>
    </div>
  );

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <p className="text-sm font-bold text-foreground">
        📊 질문 분류 통계 현황 <span className="text-xs font-normal text-muted-foreground">· 총 {s.total}개</span>
      </p>

      {/* 비율 막대 (표시 전용) */}
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-2">
        <div>
          <p className="text-xs text-muted-foreground font-semibold mb-2">분류1 — 폐쇄형 / 개방형</p>
          {bar("폐쇄형", s.closure.closed, "#3b82f6")}
          {bar("개방형", s.closure.open, "#10b981")}
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-semibold mb-2">분류2 — 사실 / 개념 / 논쟁</p>
          {bar("사실적", s.cognitive.factual, "#94a3b8")}
          {bar("개념적", s.cognitive.conceptual, "#a855f7")}
          {bar("논쟁적", s.cognitive.controversial, "#f97316")}
        </div>
      </div>
    </div>
  );
}

/**
 * 분류1/분류2 필터 칩 — 전체 질문 목록 헤더에서 사용한다(학생/교사 공용).
 */
export function ClassificationChips({
  filterClosure,
  filterCognitive,
  onFilterClosure,
  onFilterCognitive,
}: {
  filterClosure: ClosureFilter;
  filterCognitive: CognitiveFilter;
  onFilterClosure: (v: ClosureFilter) => void;
  onFilterCognitive: (v: CognitiveFilter) => void;
}) {
  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${active ? "border-indigo-500 bg-indigo-500 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
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
  );
}

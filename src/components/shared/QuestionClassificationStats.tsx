"use client";

import { useTranslations } from "next-intl";
import { summarizeQuestionTypes } from "@/lib/stats-calc";
import { matchesCognitiveCategory } from "@/lib/question-labels";
import { ClassificationDonut } from "@/components/shared/ClassificationDonut";

export type ClosureFilter = "all" | "closed" | "open";
export type CognitiveFilter = "all" | "factual" | "conceptual" | "controversial";

export type SortField = "student" | "like" | "comment";
export type SortDir = "desc" | "asc";

/** 학년 → 반 → 번호 순으로 비교한다(숫자 우선). 학생/교사 공용 */
export function compareByStudent(
  a: { grade?: string; className?: string; studentNumber?: string },
  b: { grade?: string; className?: string; studentNumber?: string },
): number {
  const num = (v?: string) => {
    const n = parseInt(v ?? "", 10);
    return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
  };
  return (
    num(a.grade) - num(b.grade) ||
    num(a.className) - num(b.className) ||
    num(a.studentNumber) - num(b.studentNumber)
  );
}

/**
 * 전체 질문 목록 정렬 컨트롤 — 기준(학생순/좋아요순/댓글순) + 방향.
 * 학생/교사 공용. 방향 레이블은 기준에 따라 달라진다(학생순=번호 오름/내림, 그 외=많은/적은).
 */
export function QuestionSortControl({
  field,
  dir,
  onChange,
  showStudent = true,
}: {
  field: SortField;
  dir: SortDir;
  onChange: (field: SortField, dir: SortDir) => void;
  showStudent?: boolean;
}) {
  const tq = useTranslations("qstats");
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

  const ascLabel = field === "student" ? tq("ascNumber") : tq("ascLess");
  const descLabel = field === "student" ? tq("descReverse") : tq("descMore");

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">{tq("sortLabel")}</span>
      <div className="flex rounded-md border overflow-hidden">
        {showStudent && seg(field === "student", tq("sortStudent"), () => onChange("student", field === "student" ? dir : "asc"), true)}
        {seg(field === "like", tq("sortLike"), () => onChange("like", field === "like" ? dir : "desc"), !showStudent)}
        {seg(field === "comment", tq("sortComment"), () => onChange("comment", field === "comment" ? dir : "desc"), false)}
      </div>
      <div className="flex rounded-md border overflow-hidden">
        {seg(dir === "desc", descLabel, () => onChange(field, "desc"), true)}
        {seg(dir === "asc", ascLabel, () => onChange(field, "asc"), false)}
      </div>
    </div>
  );
}

/** 분류1(닫힌/열린)·분류2(사실/개념/논쟁) 필터를 적용한다 (학생/교사 공용) */
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
  const t = useTranslations("classification");
  const tq = useTranslations("qstats");
  const s = summarizeQuestionTypes(questions);
  const pct = (n: number) => (s.total ? Math.round((n / s.total) * 100) : 0);

  const bar = (name: string, value: number, color: string, desc: string) => (
    <div key={name} className="mb-2 w-full px-1.5">
      <div className="flex items-center gap-2 py-0.5">
        <span className="w-14 shrink-0 break-keep leading-tight text-xs text-muted-foreground">{name}</span>
        <div className="flex-1 h-3.5 rounded bg-muted overflow-hidden">
          <div style={{ width: `${pct(value)}%`, background: color, height: "100%" }} />
        </div>
        <span className="w-16 shrink-0 text-right text-xs font-semibold text-foreground">{value} ({pct(value)}%)</span>
      </div>
      <p className="pl-14 text-[11px] leading-tight text-muted-foreground">{desc}</p>
    </div>
  );

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <p className="text-sm font-bold text-foreground">
        {tq("statsTitle")} <span className="text-xs font-normal text-muted-foreground">{tq("countSuffix", { count: s.total })}</span>
      </p>

      {/* 도넛 + 비율 막대 + 분류 설명 (표시 전용, 학생 대시보드 설명과 통일) */}
      <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
        <div>
          <p className="text-xs text-muted-foreground font-semibold mb-2">{t("category1")} — {t("closure")}</p>
          <div className="flex items-center gap-3">
            <ClassificationDonut
              size={108}
              slices={[
                { name: t("closed.label"), value: s.closure.closed, fill: "#3b82f6" },
                { name: t("open.label"), value: s.closure.open, fill: "#10b981" },
              ]}
            />
            <div className="flex-1 min-w-0">
              {bar(t("closed.label"), s.closure.closed, "#3b82f6", t("closed.desc"))}
              {bar(t("open.label"), s.closure.open, "#10b981", t("open.desc"))}
            </div>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-semibold mb-2">{t("category2")} — {t("cognitive")}</p>
          <div className="flex items-center gap-3">
            <ClassificationDonut
              size={108}
              slices={[
                { name: t("factual.label"), value: s.cognitive.factual, fill: "#94a3b8" },
                { name: t("conceptual.label"), value: s.cognitive.conceptual, fill: "#a855f7" },
                { name: t("controversial.label"), value: s.cognitive.controversial, fill: "#f97316" },
              ]}
            />
            <div className="flex-1 min-w-0">
              {bar(t("factual.label"), s.cognitive.factual, "#94a3b8", t("factual.desc"))}
              {bar(t("conceptual.label"), s.cognitive.conceptual, "#a855f7", t("conceptual.desc"))}
              {bar(t("controversial.label"), s.cognitive.controversial, "#f97316", t("controversial.desc"))}
            </div>
          </div>
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
  const t = useTranslations("classification");
  const tc = useTranslations("common");
  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-xs break-keep transition-colors ${active ? "border-indigo-500 bg-indigo-500 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground mr-0.5">{t("category1")}</span>
      {chip(filterClosure === "all", tc("all"), () => onFilterClosure("all"))}
      {chip(filterClosure === "closed", t("closed.label"), () => onFilterClosure("closed"))}
      {chip(filterClosure === "open", t("open.label"), () => onFilterClosure("open"))}
      <span className="text-xs text-muted-foreground mx-1">{t("category2")}</span>
      {chip(filterCognitive === "all", tc("all"), () => onFilterCognitive("all"))}
      {chip(filterCognitive === "factual", t("factual.label"), () => onFilterCognitive("factual"))}
      {chip(filterCognitive === "conceptual", t("conceptual.label"), () => onFilterCognitive("conceptual"))}
      {chip(filterCognitive === "controversial", t("controversial.label"), () => onFilterCognitive("controversial"))}
      {(filterClosure !== "all" || filterCognitive !== "all") && (
        <button type="button" onClick={() => { onFilterClosure("all"); onFilterCognitive("all"); }} className="ml-1 text-xs font-medium text-indigo-600">{tc("reset")}</button>
      )}
    </div>
  );
}

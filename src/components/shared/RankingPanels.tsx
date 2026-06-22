"use client";

import { useTranslations } from "next-intl";

import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/shared/EmptyState";

type IndivScope = "class" | "school" | "all";
type ClassScope = "school" | "all";

interface RankedStudent {
  id: string;
  name: string;
  school: string | null;
  grade: string | null;
  className: string | null;
  studentNumber: string | null;
  totalPoints: number;
}

interface IndivData {
  scope: IndivScope;
  students: RankedStudent[];
  total: number;
  me: {
    id: string;
    name: string;
    school: string | null;
    grade: string | null;
    className: string | null;
    studentNumber: string | null;
    totalPoints: number;
    rank: number | null;
  };
}

interface RankedClass {
  school: string;
  grade: string;
  className: string;
  avgPoints: number;
  memberCount: number;
  rank: number;
}

interface ClassData {
  scope: ClassScope;
  classes: RankedClass[];
  myClass: RankedClass | null;
  total: number;
}

function ScopeTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md border overflow-hidden">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${i > 0 ? "border-l" : ""} ${
            value === o.value ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function medal(rank: number): string {
  return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}`;
}

/** 개인 포인트 순위 패널 (우리반/교내/전체). highlightSelf=true면 본인 행 강조·스크롤. */
export function RankingPanel({
  gradeParam,
  classNameParam,
  highlightSelf = false,
  defaultScope = "class",
  showStudentNumber = false,
}: {
  gradeParam?: string;
  classNameParam?: string;
  highlightSelf?: boolean;
  defaultScope?: IndivScope;
  showStudentNumber?: boolean;
}) {
  const t = useTranslations("ranking");
  const [scope, setScope] = useState<IndivScope>(defaultScope);
  const [data, setData] = useState<IndivData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const selfRef = useRef<HTMLTableRowElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams({ scope });
    if (gradeParam) params.set("grade", gradeParam);
    if (classNameParam) params.set("className", classNameParam);
    fetch(`/api/points/leaderboard?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [scope, gradeParam, classNameParam]);

  useEffect(() => {
    // 페이지 전체가 아니라 순위 목록 컨테이너 안에서만 본인 행이 보이도록 스크롤한다
    // (scrollIntoView는 페이지가 통째로 이 패널로 점프하는 문제가 있어 사용하지 않는다)
    if (highlightSelf && selfRef.current && containerRef.current) {
      const c = containerRef.current;
      const cRect = c.getBoundingClientRect();
      const rRect = selfRef.current.getBoundingClientRect();
      c.scrollTop += rRect.top - cRect.top - cRect.height / 2 + rRect.height / 2;
    }
  }, [data, highlightSelf]);

  const sub = (s: { school: string | null; grade: string | null; className: string | null; studentNumber: string | null }) =>
    [
      s.school,
      s.grade && t("gradeLabel", { grade: s.grade }),
      s.className && t("classLabel", { className: s.className }),
      showStudentNumber && s.studentNumber ? t("numberLabel", { n: s.studentNumber }) : null,
    ]
      .filter(Boolean)
      .join(" ");

  const selfInList = data?.students.some((s) => s.id === data.me.id);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-bold text-foreground">{t("title")} <span className="text-xs font-normal text-muted-foreground">{t("totalCount", { count: data?.total ?? 0 })}</span></p>
        <ScopeTabs
          value={scope}
          onChange={setScope}
          options={[
            { value: "class", label: t("scopeClass") },
            { value: "school", label: t("scopeSchool") },
            { value: "all", label: t("scopeAll") },
          ]}
        />
      </div>
      {highlightSelf && data?.me?.rank != null && (
        <p className="text-xs text-muted-foreground">
          {t("myRankLabel")}<span className="font-bold text-indigo-600">{t("rankValue", { rank: data.me.rank })}</span> · {t("pointValue", { points: data.me.totalPoints })}
        </p>
      )}
      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
      ) : !data || data.students.length === 0 ? (
        <EmptyState icon="🏆" title={t("noRanking")} />
      ) : (
        <div ref={containerRef} className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-xs text-muted-foreground border-b">
                <th className="w-12 py-1.5 text-center font-medium">{t("colRank")}</th>
                <th className="py-1.5 text-left font-medium">{t("colName")}</th>
                <th className="py-1.5 text-right font-medium pr-1">{t("colPoints")}</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((s, i) => {
                const isMe = highlightSelf && s.id === data.me.id;
                return (
                  <tr
                    key={s.id}
                    ref={isMe ? selfRef : undefined}
                    className={`border-b last:border-0 ${isMe ? "bg-indigo-50 dark:bg-indigo-500/15 ring-1 ring-indigo-400" : ""}`}
                  >
                    <td className="py-1.5 text-center font-semibold">{medal(i + 1)}</td>
                    <td className="py-1.5">
                      <span className="font-medium text-foreground">{s.name}</span>
                      {isMe && <span className="ml-1 text-xs text-indigo-600">{t("me")}</span>}
                      {sub(s) && <span className="ml-1.5 text-xs text-muted-foreground">{sub(s)}</span>}
                    </td>
                    <td className="py-1.5 text-right font-bold text-rose-500 pr-1">{s.totalPoints}</td>
                  </tr>
                );
              })}
              {highlightSelf && !selfInList && data.me.rank != null && (
                <tr ref={selfRef} className="border-t-2 bg-indigo-50 dark:bg-indigo-500/15 ring-1 ring-indigo-400">
                  <td className="py-1.5 text-center font-semibold">{data.me.rank}</td>
                  <td className="py-1.5">
                    <span className="font-medium text-foreground">{data.me.name}</span>
                    <span className="ml-1 text-xs text-indigo-600">{t("me")}</span>
                  </td>
                  <td className="py-1.5 text-right font-bold text-rose-500 pr-1">{data.me.totalPoints}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface ClassRankRow {
  id: string;
  name: string;
  studentNumber: string | null;
  totalPoints: number;
  classRank: number;
  schoolRank: number;
  allRank: number;
  isMe: boolean;
}
interface ClassRankData {
  klass: { school: string | null; grade: string; className: string } | null;
  students: ClassRankRow[];
  total: number;
}

/**
 * 학생 순위 패널 — 같은 학교·학년·반 학생만 출석번호순으로,
 * 우리반/교내/전체 순위를 숫자로 표시한다(다른 학급 학생은 보이지 않음).
 */
export function StudentRankPanel({
  gradeParam,
  classNameParam,
  highlightSelf = false,
}: {
  gradeParam?: string;
  classNameParam?: string;
  highlightSelf?: boolean;
}) {
  const t = useTranslations("ranking");
  const [data, setData] = useState<ClassRankData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const selfRef = useRef<HTMLTableRowElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (gradeParam) params.set("grade", gradeParam);
    if (classNameParam) params.set("className", classNameParam);
    fetch(`/api/points/class-ranks?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [gradeParam, classNameParam]);

  useEffect(() => {
    if (highlightSelf && selfRef.current && containerRef.current) {
      const c = containerRef.current;
      const cRect = c.getBoundingClientRect();
      const rRect = selfRef.current.getBoundingClientRect();
      c.scrollTop += rRect.top - cRect.top - cRect.height / 2 + rRect.height / 2;
    }
  }, [data, highlightSelf]);

  const klassLabel = data?.klass ? t("klassLabelFull", { grade: data.klass.grade, className: data.klass.className }) : "";

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <p className="text-sm font-bold text-foreground">
        {t("title")}
        {klassLabel && <span className="text-xs font-normal text-muted-foreground">{t("classByline", { klass: klassLabel, count: data?.total ?? 0 })}</span>}
      </p>
      <p className="text-xs text-muted-foreground">{t("studentRankHint")}</p>
      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
      ) : !data || data.students.length === 0 ? (
        <EmptyState icon="🏆" title={t("noRanking")} />
      ) : (
        <div ref={containerRef} className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-xs text-muted-foreground border-b">
                <th className="w-12 py-1.5 text-center font-medium">{t("colNumber")}</th>
                <th className="py-1.5 text-left font-medium">{t("colName")}</th>
                <th className="py-1.5 text-right font-medium pr-1">{t("colPoints")}</th>
                <th className="py-1.5 text-center font-medium">{t("colClass")}</th>
                <th className="py-1.5 text-center font-medium">{t("colSchool")}</th>
                <th className="py-1.5 text-center font-medium">{t("colAll")}</th>
              </tr>
            </thead>
            <tbody>
              {data.students.map((s) => (
                <tr
                  key={s.id}
                  ref={s.isMe ? selfRef : undefined}
                  className={`border-b last:border-0 ${s.isMe ? "bg-indigo-50 dark:bg-indigo-500/15 ring-1 ring-indigo-400" : ""}`}
                >
                  <td className="py-1.5 text-center font-semibold text-foreground">{s.studentNumber ?? "-"}</td>
                  <td className="py-1.5 text-left">
                    <span className="font-medium text-foreground">{s.name}</span>
                    {s.isMe && <span className="ml-1 text-xs text-indigo-600">{t("me")}</span>}
                  </td>
                  <td className="py-1.5 text-right font-bold text-rose-500 pr-1">{s.totalPoints}</td>
                  <td className="py-1.5 text-center text-indigo-600 dark:text-indigo-400 font-bold">{s.classRank}</td>
                  <td className="py-1.5 text-center text-foreground">{s.schoolRank}</td>
                  <td className="py-1.5 text-center text-foreground">{s.allRank}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** 반 순위 패널 (교내/전체). 평균 포인트 기준. 본인 반(또는 지정 학급) 강조·스크롤. */
export function ClassRankingPanel({
  gradeParam,
  classNameParam,
  highlightSelf = false,
  defaultScope = "school",
}: {
  gradeParam?: string;
  classNameParam?: string;
  highlightSelf?: boolean;
  defaultScope?: ClassScope;
}) {
  const t = useTranslations("ranking");
  const [scope, setScope] = useState<ClassScope>(defaultScope);
  const [data, setData] = useState<ClassData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const selfRef = useRef<HTMLTableRowElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams({ scope });
    if (gradeParam) params.set("grade", gradeParam);
    if (classNameParam) params.set("className", classNameParam);
    fetch(`/api/points/class-leaderboard?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [scope, gradeParam, classNameParam]);

  useEffect(() => {
    // 페이지 전체가 아니라 순위 목록 컨테이너 안에서만 본인 행이 보이도록 스크롤한다
    // (scrollIntoView는 페이지가 통째로 이 패널로 점프하는 문제가 있어 사용하지 않는다)
    if (highlightSelf && selfRef.current && containerRef.current) {
      const c = containerRef.current;
      const cRect = c.getBoundingClientRect();
      const rRect = selfRef.current.getBoundingClientRect();
      c.scrollTop += rRect.top - cRect.top - cRect.height / 2 + rRect.height / 2;
    }
  }, [data, highlightSelf]);

  const isSameClass = (c: RankedClass) =>
    data?.myClass != null &&
    c.school === data.myClass.school &&
    c.grade === data.myClass.grade &&
    c.className === data.myClass.className;

  const classLabel = (c: RankedClass) =>
    scope === "all" ? t("classNameAll", { school: c.school, grade: c.grade, className: c.className }) : t("classNameShort", { grade: c.grade, className: c.className });

  const myClassInList = data?.classes.some((c) => isSameClass(c));

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-bold text-foreground">{t("classRankTitle")} <span className="text-xs font-normal text-muted-foreground">{t("classRankSub", { count: data?.total ?? 0 })}</span></p>
        <ScopeTabs
          value={scope}
          onChange={setScope}
          options={[
            { value: "school", label: t("scopeSchool") },
            { value: "all", label: t("scopeAll") },
          ]}
        />
      </div>
      {data?.myClass && (
        <p className="text-xs text-muted-foreground">
          {t("myClassLabel")}<span className="font-bold text-indigo-600">{t("rankValue", { rank: data.myClass.rank })}</span> · {t("avgValue", { avg: data.myClass.avgPoints })}
        </p>
      )}
      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</div>
      ) : !data || data.classes.length === 0 ? (
        <EmptyState icon="🏆" title={t("noRanking")} />
      ) : (
        <div ref={containerRef} className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-xs text-muted-foreground border-b">
                <th className="w-12 py-1.5 text-center font-medium">{t("colRank")}</th>
                <th className="py-1.5 text-left font-medium">{t("colClassName")}</th>
                <th className="w-12 py-1.5 text-right font-medium">{t("colCount")}</th>
                <th className="py-1.5 text-right font-medium pr-1">{t("colAvg")}</th>
              </tr>
            </thead>
            <tbody>
              {data.classes.map((c) => {
                const mine = highlightSelf && isSameClass(c);
                return (
                  <tr
                    key={`${c.school}-${c.grade}-${c.className}`}
                    ref={mine ? selfRef : undefined}
                    className={`border-b last:border-0 ${mine ? "bg-indigo-50 dark:bg-indigo-500/15 ring-1 ring-indigo-400" : ""}`}
                  >
                    <td className="py-1.5 text-center font-semibold">{medal(c.rank)}</td>
                    <td className="py-1.5">
                      <span className="font-medium text-foreground">{classLabel(c)}</span>
                      {mine && <span className="ml-1 text-xs text-indigo-600">{t("myClassTag")}</span>}
                    </td>
                    <td className="py-1.5 text-right text-xs text-muted-foreground">{t("memberCount", { count: c.memberCount })}</td>
                    <td className="py-1.5 text-right font-bold text-rose-500 pr-1">{c.avgPoints}</td>
                  </tr>
                );
              })}
              {highlightSelf && !myClassInList && data.myClass && (
                <tr ref={selfRef} className="border-t-2 bg-indigo-50 dark:bg-indigo-500/15 ring-1 ring-indigo-400">
                  <td className="py-1.5 text-center font-semibold">{data.myClass.rank}</td>
                  <td className="py-1.5">
                    <span className="font-medium text-foreground">{classLabel(data.myClass)}</span>
                    <span className="ml-1 text-xs text-indigo-600">{t("myClassTag")}</span>
                  </td>
                  <td className="py-1.5 text-right text-xs text-muted-foreground">{t("memberCount", { count: data.myClass.memberCount })}</td>
                  <td className="py-1.5 text-right font-bold text-rose-500 pr-1">{data.myClass.avgPoints}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

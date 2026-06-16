"use client";

import { useEffect, useRef, useState } from "react";

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
}: {
  gradeParam?: string;
  classNameParam?: string;
  highlightSelf?: boolean;
  defaultScope?: IndivScope;
}) {
  const [scope, setScope] = useState<IndivScope>(defaultScope);
  const [data, setData] = useState<IndivData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const selfRef = useRef<HTMLTableRowElement>(null);

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
    if (highlightSelf && selfRef.current) {
      selfRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [data, highlightSelf]);

  const sub = (s: { school: string | null; grade: string | null; className: string | null; studentNumber: string | null }) => {
    if (scope === "all") return [s.school, s.grade && `${s.grade}학년`, s.className && `${s.className}반`].filter(Boolean).join(" ");
    if (scope === "school") return [s.grade && `${s.grade}학년`, s.className && `${s.className}반`].filter(Boolean).join(" ");
    return s.studentNumber ? `${s.studentNumber}번` : "";
  };

  const selfInList = data?.students.some((s) => s.id === data.me.id);

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-bold text-foreground">🏆 학생 순위 <span className="text-xs font-normal text-muted-foreground">· 총 {data?.total ?? 0}명</span></p>
        <ScopeTabs
          value={scope}
          onChange={setScope}
          options={[
            { value: "class", label: "우리반" },
            { value: "school", label: "교내" },
            { value: "all", label: "전체" },
          ]}
        />
      </div>
      {highlightSelf && data?.me?.rank != null && (
        <p className="text-xs text-muted-foreground">
          내 순위: <span className="font-bold text-indigo-600">{data.me.rank}위</span> · {data.me.totalPoints}점
        </p>
      )}
      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</div>
      ) : !data || data.students.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">표시할 순위가 없습니다</div>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-xs text-muted-foreground border-b">
                <th className="w-12 py-1.5 text-center font-medium">순위</th>
                <th className="py-1.5 text-left font-medium">이름</th>
                <th className="py-1.5 text-right font-medium pr-1">포인트</th>
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
                      {isMe && <span className="ml-1 text-xs text-indigo-600">(나)</span>}
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
                    <span className="ml-1 text-xs text-indigo-600">(나)</span>
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
  const [scope, setScope] = useState<ClassScope>(defaultScope);
  const [data, setData] = useState<ClassData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const selfRef = useRef<HTMLTableRowElement>(null);

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
    if (highlightSelf && selfRef.current) {
      selfRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [data, highlightSelf]);

  const isSameClass = (c: RankedClass) =>
    data?.myClass != null &&
    c.school === data.myClass.school &&
    c.grade === data.myClass.grade &&
    c.className === data.myClass.className;

  const classLabel = (c: RankedClass) =>
    scope === "all" ? `${c.school} ${c.grade}학년 ${c.className}반` : `${c.grade}학년 ${c.className}반`;

  const myClassInList = data?.classes.some((c) => isSameClass(c));

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-bold text-foreground">🏫 반 순위 <span className="text-xs font-normal text-muted-foreground">· 1인당 평균 · 총 {data?.total ?? 0}개 반</span></p>
        <ScopeTabs
          value={scope}
          onChange={setScope}
          options={[
            { value: "school", label: "교내" },
            { value: "all", label: "전체" },
          ]}
        />
      </div>
      {data?.myClass && (
        <p className="text-xs text-muted-foreground">
          우리 반: <span className="font-bold text-indigo-600">{data.myClass.rank}위</span> · 평균 {data.myClass.avgPoints}점
        </p>
      )}
      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</div>
      ) : !data || data.classes.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">표시할 순위가 없습니다</div>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-xs text-muted-foreground border-b">
                <th className="w-12 py-1.5 text-center font-medium">순위</th>
                <th className="py-1.5 text-left font-medium">반</th>
                <th className="w-12 py-1.5 text-right font-medium">인원</th>
                <th className="py-1.5 text-right font-medium pr-1">평균</th>
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
                      {mine && <span className="ml-1 text-xs text-indigo-600">(우리 반)</span>}
                    </td>
                    <td className="py-1.5 text-right text-xs text-muted-foreground">{c.memberCount}명</td>
                    <td className="py-1.5 text-right font-bold text-rose-500 pr-1">{c.avgPoints}</td>
                  </tr>
                );
              })}
              {highlightSelf && !myClassInList && data.myClass && (
                <tr ref={selfRef} className="border-t-2 bg-indigo-50 dark:bg-indigo-500/15 ring-1 ring-indigo-400">
                  <td className="py-1.5 text-center font-semibold">{data.myClass.rank}</td>
                  <td className="py-1.5">
                    <span className="font-medium text-foreground">{classLabel(data.myClass)}</span>
                    <span className="ml-1 text-xs text-indigo-600">(우리 반)</span>
                  </td>
                  <td className="py-1.5 text-right text-xs text-muted-foreground">{data.myClass.memberCount}명</td>
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

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionToggle } from "@/components/shared/SectionToggle";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatDateTime, formatClock, formatShortDateTime, isSameDay } from "@/lib/datetime";

interface ParticipantStudent {
  id: string;
  name: string;
  grade: string | null;
  className: string | null;
  studentNumber: string | null;
  hasQuestion: boolean;
  questionContent: string | null;
  questionCount: number;
  commentCount: number;
  likeCount: number;
  questionTimes: string[];
  commentTimes: string[];
  likeTimes: string[];
}

interface ParticipationData {
  sessionId: string;
  totalStudents: number;
  submittedCount: number;
  students: ParticipantStudent[];
}

/** 참여 현황 셀: 활동 개수 + 그 아래 가장 최근 시각, 호버 시 전체 시각 목록 툴팁. */
function ActivityCell({ count, times, color, refDate }: { count: number; times: string[]; color: string; refDate?: string }) {
  if (count === 0) {
    return <td className="px-3 py-2 text-center align-top text-sm font-semibold text-muted-foreground">-</td>;
  }
  const latest = times[times.length - 1];
  const latestLabel = latest ? (isSameDay(latest, refDate) ? formatClock(latest) : formatShortDateTime(latest)) : "";
  const tooltip = times.map((tm) => formatDateTime(tm)).join("\n");
  return (
    <td className="px-3 py-2 text-center align-top whitespace-nowrap" title={tooltip || undefined}>
      <div className={`text-sm font-semibold ${color}`}>{count}</div>
      {latestLabel && (
        <div className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] leading-tight text-muted-foreground">
          <span aria-hidden>🕒</span>
          <span>{latestLabel}</span>
        </div>
      )}
    </td>
  );
}

interface ParticipationSectionProps {
  /** 조회할 수업세션 id — 부모에서 key로도 넘겨 세션 변경 시 상태를 초기화한다 */
  sessionId: string;
  /** 수업 날짜(같은 날 활동은 시각만 표시) */
  sessionDate?: string;
}

/**
 * 학생 참여 현황 (질문 조회 탭).
 * 접기 토글을 열 때 참여 데이터를 불러오고, 제출/미제출 필터를 자체 상태로 처리한다.
 */
export function ParticipationSection({ sessionId, sessionDate }: ParticipationSectionProps) {
  const t = useTranslations("teacherQ");
  const [participation, setParticipation] = useState<ParticipationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "submitted" | "not-submitted">("all");
  const [show, setShow] = useState(false);

  const handleLoad = async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/participation`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("participationFailed"));
      setParticipation(data as ParticipationData);
      setShow(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const visibleStudents = participation
    ? participation.students.filter((s) =>
        filter === "all" ? true : filter === "submitted" ? s.hasQuestion : !s.hasQuestion
      )
    : [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <SectionToggle
            title={t("participationTitle")}
            open={show}
            onToggle={show ? () => setShow(false) : handleLoad}
            suffix={isLoading ? <span className="text-xs font-normal text-muted-foreground">{t("loadingShort")}</span> : undefined}
          />
        </div>
      </CardHeader>
      {show && participation && (
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm text-muted-foreground">
              <span className="font-semibold text-green-700 dark:text-green-400">{participation.submittedCount}</span>
              {t("submittedSuffix", { total: participation.totalStudents })}
            </span>
            <div className="flex rounded-md border border-border overflow-hidden ml-auto">
              {(["all", "submitted", "not-submitted"] as const).map((f, i) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    i > 0 ? "border-l border-border" : ""
                  } ${
                    filter === f
                      ? "bg-indigo-600 text-white"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {f === "all" ? t("all") : f === "submitted" ? t("submitted") : t("notSubmitted")}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24 whitespace-nowrap">{t("colGradeClassNo")}</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground w-32 whitespace-nowrap">{t("colStudent")}</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{t("colWroteQuestion")}</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{t("colWroteComment")}</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{t("colLikes")}</th>
                  <th className="text-center px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{t("colSubmit")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleStudents.map((s) => (
                  <tr key={s.id} className={s.hasQuestion ? "bg-background" : "bg-muted/40"}>
                    <td className="px-3 py-2 align-top text-xs text-muted-foreground whitespace-nowrap">
                      {[
                        s.grade && t("gradeLabel", { grade: s.grade }),
                        s.className && t("classLabel", { className: s.className }),
                        s.studentNumber && t("numberLabel", { studentNumber: s.studentNumber }),
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </td>
                    <td className="px-3 py-2 align-top font-medium text-foreground whitespace-nowrap">{s.name}</td>
                    <ActivityCell count={s.questionCount} times={s.questionTimes} color="text-foreground" refDate={sessionDate} />
                    <ActivityCell count={s.commentCount} times={s.commentTimes} color="text-indigo-600 dark:text-indigo-400" refDate={sessionDate} />
                    <ActivityCell count={s.likeCount} times={s.likeTimes} color="text-rose-500 dark:text-rose-400" refDate={sessionDate} />
                    <td className="px-3 py-2 text-center align-top">
                      {s.hasQuestion ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold dark:bg-green-950/50 dark:text-green-400">
                          ✓
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs">
                          -
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleStudents.length === 0 && (
              <EmptyState icon="🧑‍🎓" title={filter === "submitted" ? t("emptySubmitted") : t("emptyNotSubmitted")} />
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

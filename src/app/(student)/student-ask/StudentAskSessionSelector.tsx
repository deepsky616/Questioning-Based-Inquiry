"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CollapseChevron } from "@/components/shared/SectionToggle";
import { useSessionMetaTranslation } from "@/components/shared/use-session-meta-translation";
import { groupSessionDatesByMonth, groupSessionsByMonth, isInquiryDesignSession } from "@/lib/sessions";
import { useTranslations } from "next-intl";
import type { AskTaskScope, QuestionSession } from "./types";

interface FilterOptions {
  dates: string[];
  subjects: string[];
  topics: string[];
}

interface SessionProgress {
  total: number;
  completed: number;
  remaining: number;
  percent: number;
}

interface StudentAskSessionSelectorProps {
  taskScope: AskTaskScope;
  filterOptions: FilterOptions;
  filterDate: string;
  filterSubject: string;
  filterTopic: string;
  filteredSessions: QuestionSession[];
  selectedSessionId: string;
  questionSessionIds: Set<string>;
  questionStatusAvailable: boolean;
  sessionProgress: SessionProgress;
  search: string;
  onSearch: (value: string) => void;
  /** 오늘 날짜(YYYY-MM-DD) — 오늘·예정과 지난 세션을 나누는 기준 */
  todayStr: string;
  /** 검색·필터 사용 중이면 지난 세션 그룹을 자동으로 펼친다 */
  filtersActive: boolean;
  onShowAllSessions: () => void;
  onFilterDateChange: (value: string) => void;
  onFilterSubjectChange: (value: string) => void;
  onFilterTopicChange: (value: string) => void;
  onSelectSession: (id: string) => void;
  getSessionDateBadge: (date: string) => string;
}

export function StudentAskSessionSelector({
  taskScope,
  filterOptions,
  filterDate,
  filterSubject,
  filterTopic,
  filteredSessions,
  selectedSessionId,
  questionSessionIds,
  questionStatusAvailable,
  sessionProgress,
  search,
  onSearch,
  todayStr,
  filtersActive,
  onShowAllSessions,
  onFilterDateChange,
  onFilterSubjectChange,
  onFilterTopicChange,
  onSelectSession,
  getSessionDateBadge,
}: StudentAskSessionSelectorProps) {
  const t = useTranslations("ask");
  const sessionText = useSessionMetaTranslation(filteredSessions);
  const dateMonthGroups = groupSessionDatesByMonth(filterOptions.dates);
  // 학생의 용무는 대부분 오늘·예정 수업 — 지난 세션은 월별로 접어 소음을 줄인다
  const upcomingSessions = filteredSessions.filter((s) => s.date >= todayStr);
  const pastSessions = filteredSessions.filter((s) => s.date < todayStr);
  const upcomingMonthGroups = groupSessionsByMonth(upcomingSessions, "asc");
  const pastMonthGroups = groupSessionsByMonth(pastSessions);
  // 드롭다운(선택 상자)용 — 전체를 월 그룹으로
  const sessionMonthGroups = groupSessionsByMonth(filteredSessions);
  const [expandedPastMonths, setExpandedPastMonths] = useState<Set<string>>(new Set());
  const gridRef = useRef<HTMLDivElement | null>(null);
  // 선택이 바뀌면(드롭다운 선택 포함) 해당 카드가 보이도록 스크롤
  useEffect(() => {
    if (!selectedSessionId) return;
    const el = gridRef.current?.querySelector(`[data-session-id="${selectedSessionId}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedSessionId]);

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="session">{t("sessionSelectLabel")} <span className="text-red-500">*</span></Label>

        {taskScope && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-950/30 dark:text-indigo-200">
            <span>
              {taskScope === "today-unasked" && t("taskScopeTodayUnasked")}
              {taskScope === "future-unasked" && t("taskScopeFutureUnasked")}
              {taskScope === "past-unasked" && t("taskScopePastUnasked")}
              {taskScope === "shared" && t("taskScopeShared")}
            </span>
            <Button
              type="button"
              variant="outline"
              className="h-8 border-indigo-200 bg-white px-3 text-xs text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-100"
              onClick={onShowAllSessions}
            >
              {t("showAllSessions")}
            </Button>
          </div>
        )}

        {/* 세션이 쌓이면 select만으로 찾기 어렵다 — 주제·교과 텍스트 검색 */}
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        <div className="student-ask-filter-grid grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            aria-label={t("filterByDate")}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={filterDate}
            onChange={(event) => onFilterDateChange(event.target.value)}
          >
            <option value="">{t("allDates")}</option>
            {dateMonthGroups.map((group) => (
              <optgroup key={group.key} label={group.label}>
                {group.dates.map((date) => (
                  <option key={date} value={date}>{date}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            aria-label={t("filterBySubject")}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={filterSubject}
            onChange={(event) => onFilterSubjectChange(event.target.value)}
          >
            <option value="">{t("allSubjects")}</option>
            {filterOptions.subjects.map((subject) => (
              <option key={subject} value={subject}>{sessionText.subjectOption(subject)}</option>
            ))}
          </select>
          <select
            aria-label={t("filterByTopic")}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={filterTopic}
            onChange={(event) => onFilterTopicChange(event.target.value)}
          >
            <option value="">{t("allTopics")}</option>
            {filterOptions.topics.map((topic) => (
              <option key={topic} value={topic}>{sessionText.topicOption(topic)}</option>
            ))}
          </select>
        </div>

        <select
          id="session"
          className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          value={selectedSessionId}
          onChange={(event) => onSelectSession(event.target.value)}
          disabled={filteredSessions.length === 0}
        >
          {filteredSessions.length === 0 ? (
            <option value="">{t("noMatchingSession")}</option>
          ) : (
            sessionMonthGroups.map((group) => (
              <optgroup key={group.key} label={`${group.label} (${t("sessionCount", { count: group.sessions.length })})`}>
                {group.sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {sessionText.label(session)}
                    {isInquiryDesignSession(session) ? ` · ${t("inquiryClassTag")}` : ""}
                  </option>
                ))}
              </optgroup>
            ))
          )}
        </select>

        {filteredSessions.length > 0 && (
          <div className="space-y-2">
            {questionStatusAvailable && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-950/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-200">{t("sessionProgressTitle")}</p>
                    <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                      {t("sessionProgressSummary", {
                        total: sessionProgress.total,
                        completed: sessionProgress.completed,
                        remaining: sessionProgress.remaining,
                        percent: sessionProgress.percent,
                      })}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
                    {sessionProgress.percent}%
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white dark:bg-emerald-950">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${sessionProgress.percent}%` }} />
                </div>
              </div>
            )}

            {/* 목록 상한을 오른쪽 패널(입력창+도우미) 높이 수준으로 — 좌우 불균형의 원천 축소 */}
            {(() => {
              const renderSessionCard = (session: QuestionSession) => {
                const active = selectedSessionId === session.id;
                const isInquiry = isInquiryDesignSession(session);
                const alreadyAskedInSession = questionStatusAvailable && questionSessionIds.has(session.id);
                return (
                  <button
                    key={session.id}
                    type="button"
                    data-session-id={session.id}
                    aria-pressed={active}
                    onClick={() => onSelectSession(session.id)}
                    className={`min-h-[132px] rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      active
                        ? "border-indigo-300 bg-indigo-50 text-indigo-950 shadow-sm dark:border-indigo-500/50 dark:bg-indigo-950/40 dark:text-indigo-100"
                        : "border-border bg-background hover:border-indigo-200 hover:bg-indigo-50/60 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-950/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        active ? "bg-white text-indigo-700 dark:bg-indigo-900 dark:text-indigo-100" : "bg-muted text-muted-foreground"
                      }`}>
                        {getSessionDateBadge(session.date)}
                      </span>
                      {active && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">{t("selectedSessionBadge")}</span>}
                      {!active && alreadyAskedInSession && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                          {t("completedSessionBadge")}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="line-clamp-1 text-sm font-semibold">
                        {sessionText.gradeLabel(session)
                          ? `${sessionText.gradeLabel(session)} · `
                          : ""}
                        {sessionText.subject(session)}
                      </p>
                      <p className="line-clamp-3 min-h-[3.75rem] text-sm leading-5 text-muted-foreground">
                        {sessionText.topic(session).trim() || t("emptyTopic")}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span>{session.date}</span>
                        <span>{session.teacher.name} {t("teacherSuffix")}</span>
                        {isInquiry && <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">{t("inquiryClassTag")}</span>}
                        {alreadyAskedInSession && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">{t("completedSessionShort")}</span>}
                      </div>
                    </div>
                  </button>
                );
              };
              return (
                <div ref={gridRef} className="student-ask-session-grid max-h-[24rem] space-y-4 overflow-y-auto pr-1">
                  {/* 오늘·예정 세션 — 학생의 주 용무라 항상 펼침(가까운 날짜부터) */}
                  {upcomingMonthGroups.map((group) => (
                    <section key={group.key} className="student-ask-month-section space-y-2">
                      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 py-2 text-xs font-semibold text-muted-foreground backdrop-blur">
                        <span>{t("upcomingSessionsLabel")} · {group.label}</span>
                        <span>{t("sessionCount", { count: group.sessions.length })}</span>
                      </div>
                      <div className="student-ask-month-grid grid gap-2 sm:grid-cols-2">
                        {group.sessions.map(renderSessionCard)}
                      </div>
                    </section>
                  ))}

                  {/* 지난 세션 — 월별 접기(기본 전부 접힘), 검색·필터 중에는 자동 펼침 */}
                  {pastMonthGroups.map((group) => {
                    const containsSelected = group.sessions.some((s) => s.id === selectedSessionId);
                    // 드롭다운으로 지난 세션을 선택하면 그 카드가 보이도록 해당 그룹을 자동 펼침
                    const open = filtersActive || containsSelected || expandedPastMonths.has(group.key);
                    return (
                      <section key={group.key} className="student-ask-past-section space-y-2">
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() =>
                            setExpandedPastMonths((prev) => {
                              const next = new Set(prev);
                              if (next.has(group.key)) next.delete(group.key);
                              else next.add(group.key);
                              return next;
                            })
                          }
                          className="sticky top-0 z-10 flex w-full items-center justify-between border-b bg-background/95 py-2 text-left text-xs font-semibold text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
                        >
                          <span className="flex items-center gap-1.5">
                            <CollapseChevron open={open} />
                            {t("pastSessionsLabel")} · {group.label}
                          </span>
                          <span>{t("sessionCount", { count: group.sessions.length })}</span>
                        </button>
                        {open && (
                          <div className="student-ask-month-grid grid gap-2 sm:grid-cols-2">
                            {group.sessions.map(renderSessionCard)}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

      </div>
      {/* 선택된 세션 상세·참고자료·교사 탐구질문은 StudentAskReferencePanel(작성 패널 옆)로 이동 —
          세션 카드 하이라이트와 중복되던 '현재 세션' 표시를 없애고 참고자료의 발견성을 높였다 */}
    </>
  );
}

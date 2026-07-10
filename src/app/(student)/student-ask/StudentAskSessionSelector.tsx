"use client";

import { CollapseChevron } from "@/components/shared/SectionToggle";
import { DesignReferenceView } from "@/components/shared/DesignReferenceView";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { buildSessionLabel, isInquiryDesignSession } from "@/lib/sessions";
import { COGNITIVE_LABEL } from "@/lib/question-labels";
import { useTranslations } from "next-intl";
import type { AskTaskScope, DesignContext, QuestionSession } from "./types";

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
  selectedSession: QuestionSession | null;
  questionSessionIds: Set<string>;
  sessionProgress: SessionProgress;
  isInquirySession: boolean;
  designContext: DesignContext | null;
  showReference: boolean;
  onShowAllSessions: () => void;
  onFilterDateChange: (value: string) => void;
  onFilterSubjectChange: (value: string) => void;
  onFilterTopicChange: (value: string) => void;
  onSelectSession: (id: string) => void;
  getSessionDateBadge: (date: string) => string;
  onToggleReference: () => void;
}

export function StudentAskSessionSelector({
  taskScope,
  filterOptions,
  filterDate,
  filterSubject,
  filterTopic,
  filteredSessions,
  selectedSessionId,
  selectedSession,
  questionSessionIds,
  sessionProgress,
  isInquirySession,
  designContext,
  showReference,
  onShowAllSessions,
  onFilterDateChange,
  onFilterSubjectChange,
  onFilterTopicChange,
  onSelectSession,
  getSessionDateBadge,
  onToggleReference,
}: StudentAskSessionSelectorProps) {
  const t = useTranslations("ask");
  const typeLabel = COGNITIVE_LABEL;

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

        <div className="student-ask-filter-grid grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            aria-label={t("filterByDate")}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={filterDate}
            onChange={(event) => onFilterDateChange(event.target.value)}
          >
            <option value="">{t("allDates")}</option>
            {filterOptions.dates.map((date) => (
              <option key={date} value={date}>{date}</option>
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
              <option key={subject} value={subject}>{subject}</option>
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
              <option key={topic} value={topic}>{topic}</option>
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
            filteredSessions.map((session) => (
              <option key={session.id} value={session.id}>
                {buildSessionLabel(session.date, session.subject, session.topic)}
                {isInquiryDesignSession(session) ? ` · ${t("inquiryClassTag")}` : ""}
              </option>
            ))
          )}
        </select>

        {filteredSessions.length > 0 && (
          <div className="space-y-2">
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

            {/* 목록 상한을 오른쪽 패널(입력창+도우미) 높이 수준으로 — 좌우 불균형의 원천 축소 */}
            <div className="student-ask-session-grid grid max-h-[24rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {filteredSessions.map((session) => {
                const active = selectedSessionId === session.id;
                const isInquiry = isInquiryDesignSession(session);
                const alreadyAskedInSession = questionSessionIds.has(session.id);
                return (
                  <button
                    key={session.id}
                    type="button"
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
                      <p className="line-clamp-1 text-sm font-semibold">{session.subject}</p>
                      <p className="line-clamp-3 min-h-[3.75rem] text-sm leading-5 text-muted-foreground">
                        {session.topic.trim() || t("emptyTopic")}
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
              })}
            </div>
          </div>
        )}

        {selectedSession && (
          <div className="rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-950/40 p-3 space-y-1">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">{t("currentSession")}</p>
            <p className="text-sm font-medium text-blue-900">
              {selectedSession.subject}
              {selectedSession.topic.trim() && <span className="text-blue-700"> · {selectedSession.topic.trim()}</span>}
            </p>
            <p className="text-xs text-blue-600">
              {selectedSession.teacher.name} {t("teacherSuffix")} &nbsp;·&nbsp; {selectedSession.date}
            </p>
            {selectedSession.unitDesignId && (
              <div className="mt-2 rounded-md border border-indigo-200 bg-white px-3 py-2 text-xs text-indigo-700">
                {t("inquiryClassNotice")}
              </div>
            )}
            <p className="text-xs text-blue-500">
              {t("visibilityNotice", { visibility: selectedSession.defaultQuestionPublic ? t("public") : t("private") })}
            </p>
          </div>
        )}
      </div>

      {isInquirySession && designContext && (
        <div className="rounded-lg border-2 border-indigo-300 bg-indigo-50 p-4 dark:border-indigo-500/40 dark:bg-indigo-950/40">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">{t("referenceTitle")}</p>
              <p className="mt-1 text-sm font-semibold text-indigo-900 dark:text-indigo-100">{t("referenceGuideTitle")}</p>
              <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-200">{t("referenceGuideDesc")}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-8 border-indigo-200 bg-white px-3 text-xs text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-100"
              onClick={onToggleReference}
            >
              {showReference ? t("hideReference") : t("showReference")}
              <CollapseChevron open={showReference} />
            </Button>
          </div>
          {showReference && <DesignReferenceView data={designContext} className="mt-3" />}
        </div>
      )}

      {selectedSession &&
        Array.isArray(selectedSession.sharedQuestions) &&
        selectedSession.sharedQuestions.filter((question) => question.content?.trim()).length > 0 && (
          <div className="rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/40 p-4 space-y-2">
            <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">{t("teacherInquiryQuestions")}</p>
            <p className="text-xs text-indigo-500 mb-2">{t("inquiryHint")}</p>
            <ul className="space-y-1.5">
              {selectedSession.sharedQuestions
                .filter((question) => question.content?.trim())
                .map((question, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm text-indigo-800">
                    <span className="shrink-0 mt-0.5 text-xs font-medium text-indigo-500">
                      [{typeLabel[question.type] ?? question.type}]
                    </span>
                    <span>{question.content}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
    </>
  );
}

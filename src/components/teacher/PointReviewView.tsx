"use client";

// AI 추천 포인트 검토 — 조립 전용 뷰.
// 상태·로직은 point-review/usePointReview, 세션 선택 카드는 AnalysisSessionPicker,
// 개별 행은 PendingRow가 담당한다.
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildSessionLabel } from "@/lib/sessions";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePointReview } from "@/components/teacher/point-review/usePointReview";
import { AnalysisSessionPicker } from "@/components/teacher/point-review/AnalysisSessionPicker";
import { PendingRow } from "@/components/teacher/point-review/PendingRow";
import type { PendingLog, PointReviewClassFilter } from "@/components/teacher/point-review/types";

export function PointReviewView({ classFilter }: { classFilter?: PointReviewClassFilter } = {}) {
  const t = useTranslations("pointReview");
  const review = usePointReview({ classFilter });
  const {
    pendingSessions,
    visiblePending,
    reviewFilterDate, setReviewFilterDate,
    reviewFilterSubject, setReviewFilterSubject,
    reviewFilterTopic, setReviewFilterTopic,
    reviewSelectedSessionId, setReviewSelectedSessionId,
    reviewDateMonthGroups,
    reviewSubjectOptions,
    reviewTopicOptions,
    reviewFilteredSessions,
    reviewSessionMonthGroups,
    hasReviewFilter,
    resetReviewFilter,
    groupBySession,
    displayedDuplicateRows,
    displayedNormalRows,
    selectedDuplicateIds,
    selectedNormalIds,
    allDisplayedDuplicateSelected,
    allDisplayedNormalSelected,
    toggleAllDuplicates,
    toggleAllNormal,
    toggleOne,
    selected,
    busy,
    decide,
    decideWithOverride,
    overrideEdit,
    setOverrideRow,
    focusStudentId,
    focusStudentName,
    focusedPending,
  } = review;

  // 세션 그룹 헤더 + 행 목록 (중복 가능성·추천 보너스 공용)
  const renderGroups = (rows: PendingLog[]) =>
    groupBySession(rows).map((group) => (
      <div key={group.key} className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 border-b pb-1.5">
          <p className="text-sm font-semibold text-foreground">{group.label}</p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {t("groupPendingCount", { count: group.rows.length })}
          </span>
          {group.justAnalyzed && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              {t("groupJustAnalyzed")}
            </span>
          )}
        </div>
        {group.rows.map((p) => (
          <PendingRow key={p.id} p={p} selected={selected.has(p.id)}
            onToggle={() => toggleOne(p.id)}
            onDecideOne={(d) => decide(d, [p.id])}
            onOverride={(pts) => decideWithOverride(p.id, pts)}
            override={overrideEdit[p.id]}
            setOverride={(v) => setOverrideRow(p.id, v)}
          />
        ))}
      </div>
    ));

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        {t("intro")}
      </p>

      {focusStudentId && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300">
          {focusStudentName ? t("studentFocus", { name: focusStudentName, count: focusedPending.length }) : t("studentFocusEmpty")}
        </div>
      )}

      {/* 세션 선택 + 분석 실행 */}
      <AnalysisSessionPicker review={review} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("resultFilterTitle")}</CardTitle>
          <CardDescription>{t("resultFilterDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingSessions.length === 0 ? (
            <EmptyState icon="✅" title={t("noPending")} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap lg:items-end">
                <div className="col-span-2 flex flex-col gap-1 sm:col-span-1 lg:w-36">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterDate")}</label>
                  <select
                    aria-label={t("filterDate")}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={reviewFilterDate}
                    onChange={(event) => {
                      setReviewFilterDate(event.target.value);
                      setReviewFilterSubject("");
                      setReviewFilterTopic("");
                      setReviewSelectedSessionId("all");
                    }}
                  >
                    <option value="">{t("allDates")}</option>
                    {reviewDateMonthGroups.map((group) => (
                      <optgroup key={group.key} label={group.label}>
                        {group.dates.map((date) => (
                          <option key={date} value={date}>{date}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1 lg:w-32">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterSubject")}</label>
                  <Select
                    value={reviewFilterSubject || "__all__"}
                    onValueChange={(value) => {
                      setReviewFilterSubject(value === "__all__" ? "" : value);
                      setReviewFilterTopic("");
                      setReviewSelectedSessionId("all");
                    }}
                  >
                    <SelectTrigger className="h-9 bg-background text-sm">
                      <SelectValue placeholder={t("allSubjects")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("allSubjects")}</SelectItem>
                      {reviewSubjectOptions.map((subject) => (
                        <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1 lg:w-44">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterTopic")}</label>
                  <Select
                    value={reviewFilterTopic || "__all__"}
                    onValueChange={(value) => {
                      setReviewFilterTopic(value === "__all__" ? "" : value);
                      setReviewSelectedSessionId("all");
                    }}
                  >
                    <SelectTrigger className="h-9 bg-background text-sm">
                      <SelectValue placeholder={t("allTopics")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("allTopics")}</SelectItem>
                      {reviewTopicOptions.map((topic) => (
                        <SelectItem key={topic} value={topic}>{topic}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2 flex min-w-0 flex-col gap-1 lg:flex-1">
                  <label className="text-xs font-medium text-muted-foreground">{t("filterSession")}</label>
                  <select
                    aria-label={t("filterSession")}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={reviewSelectedSessionId}
                    onChange={(event) => setReviewSelectedSessionId(event.target.value)}
                    disabled={reviewFilteredSessions.length === 0}
                  >
                    {reviewFilteredSessions.length === 0 ? (
                      <option value="all">{t("noMatchingSession")}</option>
                    ) : (
                      <>
                        <option value="all">{t("allSessions")}</option>
                        {reviewSessionMonthGroups.map((group) => (
                          <optgroup key={group.key} label={`${group.label} (${group.sessions.length})`}>
                            {group.sessions.map((session) => (
                              <option key={session.id} value={session.id}>
                                {buildSessionLabel(session.date, session.subject, session.topic)}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </>
                    )}
                  </select>
                </div>

                {hasReviewFilter && (
                  <button
                    type="button"
                    onClick={resetReviewFilter}
                    className="col-span-2 h-9 text-left text-xs font-medium text-indigo-600 hover:text-indigo-800 lg:col-span-1"
                  >
                    {t("resetFilter")}
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("resultFilterHint", { sessions: pendingSessions.length, count: visiblePending.length })}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* 중복 가능성 */}
      {displayedDuplicateRows.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2 text-red-700">
                  {t("duplicateTitle", { count: displayedDuplicateRows.length })}
                </CardTitle>
                <CardDescription className="text-red-600 text-xs">
                  {t("duplicateDesc")}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={toggleAllDuplicates} disabled={displayedDuplicateRows.length === 0}>
                  {allDisplayedDuplicateSelected ? t("deselectAll") : t("selectAll")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => decide("APPROVE", selectedDuplicateIds)}
                  disabled={selectedDuplicateIds.length === 0 || busy}>
                  {t("approveSelected", { count: selectedDuplicateIds.length })}
                </Button>
                <Button size="sm" variant="outline" onClick={() => decide("REJECT", selectedDuplicateIds)}
                  disabled={selectedDuplicateIds.length === 0 || busy}
                  className="text-red-500 border-red-200 hover:bg-red-50">
                  {t("reject")}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {renderGroups(displayedDuplicateRows)}
          </CardContent>
        </Card>
      )}

      {/* 일반 보너스 후보 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t("recommendedTitle", { count: displayedNormalRows.length })}</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={toggleAllNormal} disabled={displayedNormalRows.length === 0}>
                {allDisplayedNormalSelected ? t("deselectAll") : t("selectAll")}
              </Button>
              <Button size="sm" onClick={() => decide("APPROVE", selectedNormalIds)}
                disabled={selectedNormalIds.length === 0 || busy}>
                {t("approveSelected", { count: selectedNormalIds.length })}
              </Button>
              <Button size="sm" variant="outline" onClick={() => decide("REJECT", selectedNormalIds)}
                disabled={selectedNormalIds.length === 0 || busy}
                className="text-red-500 border-red-200 hover:bg-red-50">
                {t("reject")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {displayedNormalRows.length === 0 ? (
            <EmptyState icon="✅" title={t("noPending")} />
          ) : renderGroups(displayedNormalRows)}
        </CardContent>
      </Card>
    </div>
  );
}

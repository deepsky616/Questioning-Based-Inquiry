"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isSessionAvailable, sortSessionsAsc, sortSessionsDesc, compareSessionsDesc, getSessionFilterOptions, filterSessions } from "@/lib/sessions";
import { appQueryKeys, useTeacherSessions, useTeacherStudents } from "@/lib/app-queries";
import { PageHeader } from "@/components/shared/PageHeader";
import { useToast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { useTranslations } from "next-intl";
import { TeacherSessionListControls, type SessionListSort, type SessionParticipationFilter } from "./TeacherSessionListControls";
import { TeacherSessionSummaryGrid } from "./TeacherSessionSummaryGrid";
import { TeacherSessionCreateCard } from "./TeacherSessionCreateCard";
import { TeacherSessionRow } from "./TeacherSessionRow";
import type { QuestionSession, TeacherSessionForm } from "./types";
import {
  defaultTargetSelection,
  buildClassStudentTargetPayload,
  getSubjectsForGrade,
  getTargetGrade,
  type SessionTargetClass,
  type SessionTargetStudent,
} from "@/lib/session-targeting";

export default function TeacherSessionsPage() {
  const tPages = useTranslations("pages");
  const t = useTranslations("sessions");
  const tc = useTranslations("common");
  const tSeq = useTranslations("sequencePanel");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: sessions = [], isLoading } = useTeacherSessions<QuestionSession>();
  // 기존 낙관적 업데이트 호출부를 그대로 유지하기 위해 캐시 기록 함수를 setSessions 이름으로 제공한다.
  const setSessions = (updater: (prev: QuestionSession[]) => QuestionSession[]) =>
    queryClient.setQueryData<QuestionSession[]>(appQueryKeys.teacherSessions, (prev) => updater(prev ?? []));
  const { data: targetData } = useTeacherStudents<SessionTargetStudent, SessionTargetClass>();
  const students = useMemo(() => targetData?.students ?? [], [targetData]);
  const teacherClasses = useMemo(() => targetData?.teacherClasses ?? [], [targetData]);
  const [sessForm, setSessForm] = useState<TeacherSessionForm>({
    targetClassValue: "all",
    selectedStudentIds: [] as string[],
    date: "",
    subject: "",
    topic: "",
    defaultQuestionPublic: true,
    likesVisibleToPeers: true,
    commentsVisibleToPeers: true,
    isActive: true,
  });
  const [isSaving, setIsSaving] = useState(false);
  // 세션 목록 조회/정렬 상태
  const [listFilterDate, setListFilterDate] = useState("");
  const [listFilterSubject, setListFilterSubject] = useState("");
  const [listFilterTopic, setListFilterTopic] = useState("");
  const [listParticipationFilter, setListParticipationFilter] = useState<SessionParticipationFilter>("all");
  const [listSort, setListSort] = useState<SessionListSort>("desc");
  const [targetDefaulted, setTargetDefaulted] = useState(false);

  const targetClasses = useMemo(() => {
    if (teacherClasses.length > 0) return teacherClasses;
    const map = new Map<string, SessionTargetClass>();
    students.forEach((student) => {
      if (student.grade && student.className) {
        map.set(`${student.grade}-${student.className}`, {
          grade: student.grade,
          className: student.className,
        });
      }
    });
    return Array.from(map.values());
  }, [students, teacherClasses]);

  const selectedTargetGrade = getTargetGrade(sessForm.targetClassValue, targetClasses, students);
  const subjectOptions = getSubjectsForGrade(selectedTargetGrade);

  useEffect(() => {
    if (targetDefaulted || !targetData) return;
    // 기본값: 학급이 여러 개면 전체 담당 학급, 한 개뿐이면 그 학급 전체 학생
    const defaults = defaultTargetSelection(targetData.students, targetData.teacherClasses);
    setSessForm((prev) => ({ ...prev, ...defaults }));
    setTargetDefaulted(true);
  }, [targetData, targetDefaulted]);

  useEffect(() => {
    if (!subjectOptions.includes(sessForm.subject)) {
      setSessForm((prev) => ({ ...prev, subject: subjectOptions[0] ?? "" }));
    }
  }, [sessForm.subject, subjectOptions]);

  const handleCreate = async () => {
    if (!sessForm.date || !sessForm.subject.trim() || !sessForm.topic.trim()) {
      toast({ variant: "destructive", description: t("dateRequired") });
      return;
    }
    if (sessForm.targetClassValue !== "all" && sessForm.selectedStudentIds.length === 0) {
      toast({ variant: "destructive", description: t("selectTargets") });
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...sessForm,
          ...buildClassStudentTargetPayload({
            targetClassValue: sessForm.targetClassValue,
            selectedStudentIds: sessForm.selectedStudentIds,
            students,
          }),
        }),
      });
      if (!res.ok) throw new Error();
      const created: QuestionSession = await res.json();
      setSessions((prev) => sortSessionsDesc([created, ...prev]));
      setSessForm((prev) => ({
        targetClassValue: prev.targetClassValue,
        selectedStudentIds: prev.selectedStudentIds,
        date: "",
        subject: getSubjectsForGrade(getTargetGrade(prev.targetClassValue, targetClasses, students))[0] ?? "",
        topic: "",
        defaultQuestionPublic: true,
        likesVisibleToPeers: true,
        commentsVisibleToPeers: true,
        isActive: true,
      }));
      toast({ variant: "success", description: t("sessionAdded") });
    } catch {
      toast({ variant: "destructive", description: t("saveFailed") });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleFailed = () => toast({ variant: "destructive", description: t("toggleFailed") });

  const confirm = useConfirm();

  const handleDelete = async (id: string) => {
    if (!(await confirm({ description: t("deleteConfirm"), confirmText: tc("delete"), destructive: true }))) return;
    const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      toast({ variant: "destructive", description: t("deleteFailed") });
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const handleToggleActive = async (id: string, currentValue: boolean) => {
    const next = !currentValue;
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isActive: next } : s))
    );
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: next }),
    });
    if (!res.ok) {
      toggleFailed();
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isActive: currentValue } : s))
      );
    }
  };

  const handleTogglePublic = async (id: string, currentValue: boolean) => {
    const next = !currentValue;
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, defaultQuestionPublic: next } : s))
    );
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultQuestionPublic: next }),
    });
    if (!res.ok) {
      toggleFailed();
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, defaultQuestionPublic: currentValue } : s))
      );
    }
  };

  const handleToggleCommentsVisible = async (id: string, currentValue: boolean) => {
    const next = !currentValue;
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, commentsVisibleToPeers: next } : s))
    );
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentsVisibleToPeers: next }),
    });
    if (!res.ok) {
      toggleFailed();
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, commentsVisibleToPeers: currentValue } : s))
      );
    }
  };

  // 날짜·교과·주제 수정 저장 (탐구질문 세션은 교과 제외)
  const handleEditSave = async (id: string, patch: { date: string; subject?: string; topic: string }): Promise<boolean> => {
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { toggleFailed(); return false; }
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    return true;
  };

  const handleToggleLikes = async (id: string, currentValue: boolean) => {
    const next = !currentValue;
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, likesVisibleToPeers: next } : s))
    );
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ likesVisibleToPeers: next }),
    });
    if (!res.ok) {
      toggleFailed();
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, likesVisibleToPeers: currentValue } : s))
      );
    }
  };

  // 세션 목록 조회 필터(날짜·교과·주제·참여 상태) + 정렬
  const filterOptions = getSessionFilterOptions(sessions);
  const baseVisibleSessions = filterSessions(sessions, {
    date: listFilterDate || undefined,
    subject: listFilterSubject || undefined,
    topic: listFilterTopic || undefined,
  });
  const visibleSessions = baseVisibleSessions.filter((item) => {
    const missing = item.participation?.missing ?? 0;
    const total = item.participation?.total ?? 0;
    if (listParticipationFilter === "missing") return missing > 0;
    if (listParticipationFilter === "completed") return total > 0 && missing === 0;
    return true;
  });
  const sortedSessions =
    listSort === "asc"
      ? sortSessionsAsc(visibleSessions)
      : listSort === "missingDesc"
        ? [...visibleSessions].sort((a, b) => {
            const missingDiff = (b.participation?.missing ?? 0) - (a.participation?.missing ?? 0);
            if (missingDiff !== 0) return missingDiff;
            return compareSessionsDesc(a, b);
          })
        : sortSessionsDesc(visibleSessions);
  const activeSessions = sortedSessions.filter((s) => isSessionAvailable(s.date));
  const pastSessions = sortedSessions.filter((s) => !isSessionAvailable(s.date));
  const missingSessionCount = sortedSessions.filter((s) => (s.participation?.missing ?? 0) > 0).length;
  const completedSessionCount = sortedSessions.filter((s) => {
    const total = s.participation?.total ?? 0;
    return total > 0 && (s.participation?.missing ?? 0) === 0;
  }).length;
  const totalMissingStudents = sortedSessions.reduce((sum, s) => sum + (s.participation?.missing ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title={tPages("teacherSessions.title")} description={tPages("teacherSessions.description")} />

      <TeacherSessionCreateCard
        form={sessForm}
        setForm={setSessForm}
        isSaving={isSaving}
        subjectOptions={subjectOptions}
        targetClasses={targetClasses}
        students={students}
        onCreate={handleCreate}
      />

      {/* 세션 목록 */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">{t("loading")}</div>
      ) : sessions.length === 0 ? (
        <EmptyState icon="📅" title={t("emptyTitle")} description={t("emptyDesc")} />
      ) : (
        <Card className="teacher-sessions-desktop-management">
          <CardHeader className="pb-3 space-y-3">
            <CardTitle className="text-base">{t("listTitle")}</CardTitle>
            <TeacherSessionSummaryGrid
              activeCount={activeSessions.length}
              pastCount={pastSessions.length}
              missingSessionCount={missingSessionCount}
              completedSessionCount={completedSessionCount}
              totalMissingStudents={totalMissingStudents}
            />
            <TeacherSessionListControls
              filterOptions={filterOptions}
              filterDate={listFilterDate}
              filterSubject={listFilterSubject}
              filterTopic={listFilterTopic}
              participationFilter={listParticipationFilter}
              sort={listSort}
              onFilterDate={setListFilterDate}
              onFilterSubject={setListFilterSubject}
              onFilterTopic={setListFilterTopic}
              onParticipationFilter={setListParticipationFilter}
              onSort={setListSort}
              onReset={() => {
                setListFilterDate("");
                setListFilterSubject("");
                setListFilterTopic("");
                setListParticipationFilter("all");
              }}
            />
          </CardHeader>
          <CardContent className="space-y-5">
            {activeSessions.length === 0 && pastSessions.length === 0 && (
              <EmptyState icon="🔍" title={t("noMatch")} description={t("noMatchDesc")} />
            )}

            {activeSessions.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    {t("upcomingSessions")}
                    <span className="text-xs font-normal text-muted-foreground">{t("countSuffix", { count: activeSessions.length })}</span>
                  </h3>
                  <div className="hidden lg:flex items-center gap-5 pr-4 text-xs font-normal text-foreground whitespace-nowrap">
                    <span className="w-20 text-center">{tSeq("activeLabel")}</span>
                    <span className="w-20 text-center">{tSeq("publicLabel")}</span>
                    <span className="w-20 text-center">{tSeq("likesLabel")}</span>
                    <span className="w-20 text-center">{tSeq("commentsLabel")}</span>
                    <span className="w-24 text-center">{t("colManage")}</span>
                  </div>
                </div>
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {activeSessions.map((s) => (
                    <TeacherSessionRow
                      key={s.id}
                      session={s}
                      onDelete={handleDelete}
                      onToggleActive={handleToggleActive}
                      onTogglePublic={handleTogglePublic}
                      onToggleLikes={handleToggleLikes}
                      onToggleCommentsVisible={handleToggleCommentsVisible}
                      onEditSave={handleEditSave}
                    />
                  ))}
                </div>
              </section>
            )}

            {pastSessions.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 inline-block" />
                    {t("pastSessions")}
                    <span className="text-xs font-normal text-muted-foreground">{t("countSuffix", { count: pastSessions.length })}</span>
                  </h3>
                  <div className="hidden lg:flex items-center gap-5 pr-4 text-xs font-normal text-foreground whitespace-nowrap">
                    <span className="w-20 text-center">{tSeq("activeLabel")}</span>
                    <span className="w-20 text-center">{tSeq("publicLabel")}</span>
                    <span className="w-20 text-center">{tSeq("likesLabel")}</span>
                    <span className="w-20 text-center">{tSeq("commentsLabel")}</span>
                    <span className="w-24 text-center">{t("colManage")}</span>
                  </div>
                </div>
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {pastSessions.map((s) => (
                    <TeacherSessionRow
                      key={s.id}
                      session={s}
                      onDelete={handleDelete}
                      onToggleActive={handleToggleActive}
                      onTogglePublic={handleTogglePublic}
                      onToggleLikes={handleToggleLikes}
                      onToggleCommentsVisible={handleToggleCommentsVisible}
                      onEditSave={handleEditSave}
                    />
                  ))}
                </div>
              </section>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Pencil, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DatePicker from "@/components/shared/DatePicker";
import { SessionTargetSelector } from "@/components/shared/SessionTargetSelector";
import { buildSessionLabel, isSessionAvailable, sortSessionsAsc, sortSessionsDesc, getSessionFilterOptions, filterSessions } from "@/lib/sessions";
import { appQueryKeys, useTeacherSessions, useTeacherStudents } from "@/lib/app-queries";
import { PageHeader } from "@/components/shared/PageHeader";
import { useToast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/datetime";
import { TeacherSessionListControls, type SessionListSort, type SessionParticipationFilter } from "./TeacherSessionListControls";
import { TeacherSessionSummaryGrid } from "./TeacherSessionSummaryGrid";
import {
  buildClassTargetValue,
  defaultTargetSelection,
  buildClassStudentTargetPayload,
  buildTargetLabel,
  getSubjectsForGrade,
  getTargetGrade,
  type SessionTargetClass,
  type SessionTargetStudent,
} from "@/lib/session-targeting";

interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  createdAt?: string;
  teacher: { name: string };
  unitDesignId?: string | null;
  sharedQuestions?: { type: string; content: string }[];
  defaultQuestionPublic: boolean;
  likesVisibleToPeers: boolean;
  commentsVisibleToPeers: boolean;
  isActive: boolean;
  targetType?: string | null;
  targetGrade?: string | null;
  targetClassName?: string | null;
  targetStudentId?: string | null;
  targetStudentIds?: string[];
  targetStudent?: { name: string } | null;
  participation?: {
    total: number;
    submitted: number;
    missing: number;
    percent: number;
  };
}

interface SessionParticipationStudent {
  id: string;
  name: string;
  grade: string | null;
  className: string | null;
  studentNumber: string | null;
  hasQuestion: boolean;
}

interface SessionParticipationResponse {
  students: SessionParticipationStudent[];
}

interface SessionReminderResponse {
  created: number;
  refreshed: number;
  totalMissing: number;
}

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
  const [sessForm, setSessForm] = useState({
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
      setSessions((prev) => sortSessionsAsc([created, ...prev]));
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
            return b.date.localeCompare(a.date);
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

      {/* 새 세션 만들기 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("newSession")}</CardTitle>
          <CardDescription>{t("newSessionDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 날짜·교과·주제 (주제를 더 넓게) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_2fr] lg:grid-cols-[1fr_1fr_2fr]">
            <div className="space-y-1">
              <Label>{t("date")}</Label>
              <DatePicker
                value={sessForm.date}
                onChange={(v) => setSessForm((p) => ({ ...p, date: v }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sess-subject">{t("subject")}</Label>
              <Select
                value={sessForm.subject}
                onValueChange={(value) => setSessForm((p) => ({ ...p, subject: value }))}
              >
                <SelectTrigger id="sess-subject">
                  <SelectValue placeholder={t("selectSubject")} />
                </SelectTrigger>
                <SelectContent>
                  {subjectOptions.map((subject) => (
                    <SelectItem key={subject} value={subject}>
                      {subject}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sess-topic">{t("topic")}</Label>
              <Input
                id="sess-topic"
                placeholder={t("topicPlaceholder")}
                value={sessForm.topic}
                onChange={(e) => setSessForm((p) => ({ ...p, topic: e.target.value }))}
              />
            </div>
          </div>

          {/* 대상 선택 + 공개 설정 (좌우 배치) */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>{t("selectTargetsLabel")}</Label>
              <SessionTargetSelector
                classes={targetClasses}
                students={students}
                targetClassValue={sessForm.targetClassValue}
                selectedStudentIds={sessForm.selectedStudentIds}
                onTargetClassChange={(targetClassValue, selectedStudentIds) =>
                  setSessForm((prev) => ({ ...prev, targetClassValue, selectedStudentIds }))
                }
                onSelectedStudentIdsChange={(selectedStudentIds) =>
                  setSessForm((prev) => ({ ...prev, selectedStudentIds }))
                }
              />
            </div>

            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 space-y-2">
              <p className="text-sm font-semibold text-foreground">{t("visibilitySettings")}</p>
              <div className="space-y-2">
                {([
                  ["isActive", tSeq("activeLabel"), t("activeDesc"), sessForm.isActive],
                  ["defaultQuestionPublic", tSeq("publicLabel"), t("publicDesc"), sessForm.defaultQuestionPublic],
                  ["likesVisibleToPeers", tSeq("likesLabel"), t("likesDesc"), sessForm.likesVisibleToPeers],
                  ["commentsVisibleToPeers", tSeq("commentsLabel"), t("commentsDesc"), sessForm.commentsVisibleToPeers],
                ] as const).map(([key, label, desc, value]) => (
                  <div key={key} className="rounded-md border border-border bg-background p-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <Switch
                        checked={value}
                        onCheckedChange={(v) => setSessForm((p) => ({ ...p, [key]: v }))}
                      />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            {/* 전체 폭 + 큰 높이로 어느 위치에서든 누르기 쉽게 */}
            <Button
              onClick={handleCreate}
              disabled={isSaving || !sessForm.date || !sessForm.subject.trim() || !sessForm.topic.trim()}
              variant="gradient"
              className="h-11 w-full gap-1.5 text-base font-semibold"
            >
              <Plus className="h-5 w-5" />
              {isSaving ? t("saving") : t("addSession")}
            </Button>
          </div>
        </CardContent>
      </Card>

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
                    <SessionRow
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
                    <SessionRow
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

function SessionRow({
  session,
  onDelete,
  onToggleActive,
  onTogglePublic,
  onToggleLikes,
  onToggleCommentsVisible,
  onEditSave,
}: {
  session: QuestionSession;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, current: boolean) => void;
  onTogglePublic: (id: string, current: boolean) => void;
  onToggleLikes: (id: string, current: boolean) => void;
  onToggleCommentsVisible: (id: string, current: boolean) => void;
  onEditSave: (id: string, patch: { date: string; subject?: string; topic: string }) => Promise<boolean>;
}) {
  const t = useTranslations("sessions");
  const tc = useTranslations("common");
  const tSeq = useTranslations("sequencePanel");
  const { toast } = useToast();
  const isDesignSession = !!session.unitDesignId;
  const [editing, setEditing] = useState(false);
  const [eDate, setEDate] = useState(session.date);
  const [eSubject, setESubject] = useState(session.subject);
  const [eTopic, setETopic] = useState(session.topic);
  const [eArea, setEArea] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [showMissingStudents, setShowMissingStudents] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const missingCount = session.participation?.missing ?? 0;
  const { data: participationDetail, isLoading: isLoadingParticipation, isError: isParticipationError } = useQuery<SessionParticipationResponse>({
    queryKey: ["session-participation", session.id],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${session.id}/participation`);
      if (!res.ok) throw new Error("수업 참여 현황을 불러오지 못했습니다");
      return res.json();
    },
    enabled: showMissingStudents,
    staleTime: 30000,
  });
  const missingStudents = (participationDetail?.students ?? []).filter((student) => !student.hasQuestion);

  const handleSendReminder = async () => {
    if (missingCount <= 0 || sendingReminder) return;
    setSendingReminder(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/remind`, { method: "POST" });
      if (!res.ok) throw new Error("failed to send reminder");
      const result = (await res.json()) as SessionReminderResponse;
      const notified = result.created + result.refreshed;
      if (notified > 0) {
        toast({ variant: "success", description: t("reminderSent", { count: notified }) });
      } else {
        toast({ variant: "success", description: t("missingStudentsEmpty") });
      }
    } catch {
      toast({ variant: "destructive", description: t("reminderFailed") });
    } finally {
      setSendingReminder(false);
    }
  };

  const openEdit = () => {
    setEDate(session.date);
    setESubject(session.subject);
    setETopic(session.topic);
    setEditing(true);
    // 탐구질문 수업: 연결된 설계의 영역을 읽어와 표시(읽기 전용)
    if (isDesignSession) {
      fetch(`/api/sessions/${session.id}/design-context`)
        .then((r) => r.json())
        .then((d) => setEArea(d?.context?.area ?? ""))
        .catch(() => {});
    }
  };
  const saveEdit = async () => {
    if (!eDate || !eTopic.trim() || (!isDesignSession && !eSubject.trim())) return;
    setSavingEdit(true);
    const ok = await onEditSave(session.id, {
      date: eDate,
      topic: eTopic.trim(),
      ...(isDesignSession ? {} : { subject: eSubject.trim() }),
    });
    setSavingEdit(false);
    if (ok) setEditing(false);
  };

  return (
    <div className={session.isActive ? "bg-card" : "bg-muted/40"}>
      <div className={`flex flex-col gap-3 px-4 py-3 transition-colors lg:flex-row lg:items-center lg:justify-between ${session.isActive ? "hover:bg-muted/50" : "hover:bg-muted"}`}>
        <div className="flex min-w-0 items-start gap-3 lg:items-center">
          <span className={`shrink-0 w-2 h-2 rounded-full ${session.isActive ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`} />
          <div className="min-w-0">
            <p className={`line-clamp-2 text-sm font-medium lg:truncate ${session.isActive ? "text-foreground" : "text-muted-foreground"}`}>
              {buildSessionLabel(session.date, session.subject, session.topic)}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {!session.isActive && (
                <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{t("badgeInactive")}</span>
              )}
              {!session.defaultQuestionPublic && (
                <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded dark:bg-orange-950/40 dark:text-orange-300">{t("badgePrivateQ")}</span>
              )}
              {!session.likesVisibleToPeers && (
                <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded dark:bg-amber-950/40 dark:text-amber-300">{t("badgePrivateLikes")}</span>
              )}
              {!session.commentsVisibleToPeers && (
                <span className="text-xs bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded dark:bg-rose-950/40 dark:text-rose-300">{t("badgePrivateComments")}</span>
              )}
              {isDesignSession && (
                <span className="text-xs font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">{t("badgeInquiry")}</span>
              )}
              <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded dark:bg-slate-800 dark:text-slate-300">
                {buildTargetLabel({
                  targetType: session.targetType,
                  targetGrade: session.targetGrade,
                  targetClassName: session.targetClassName,
                  targetStudentName: session.targetStudent?.name,
                })}
              </span>
              {session.createdAt && (
                <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded dark:bg-indigo-950/40 dark:text-indigo-200">
                  {t("createdAt", { time: formatDateTime(session.createdAt) })}
                </span>
              )}
            </div>
            {session.participation && (
              <div className="mt-2 w-full max-w-xs rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                {session.participation.total > 0 ? (
                  <>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-200">
                        {t("participationSummary", {
                          submitted: session.participation.submitted,
                          total: session.participation.total,
                        })}
                      </span>
                      <span className="text-emerald-700/80 dark:text-emerald-200/80">
                        {t("participationMissing", { missing: session.participation.missing })}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/70">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, session.participation.percent))}%` }}
                      />
                    </div>
                    {missingCount > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setShowMissingStudents((value) => !value)}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
                        >
                          {showMissingStudents ? t("missingStudentsHide") : t("missingStudentsShow")}
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMissingStudents ? "rotate-180" : ""}`} />
                        </button>
                        <button
                          type="button"
                          onClick={handleSendReminder}
                          disabled={sendingReminder}
                          className="inline-flex h-7 items-center rounded-md border border-indigo-200 bg-white px-2 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:bg-indigo-900/50"
                        >
                          {sendingReminder ? t("reminderSending") : t("reminderSend")}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs font-medium text-muted-foreground">{t("participationEmpty")}</p>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 lg:flex lg:shrink-0 lg:items-center lg:gap-5 lg:border-t-0 lg:pt-0">
          {([
            [tSeq("activeLabel"), <Switch key="active" checked={session.isActive} onCheckedChange={() => onToggleActive(session.id, session.isActive)} />],
            [tSeq("publicLabel"), <Switch key="public" checked={session.defaultQuestionPublic} onCheckedChange={() => onTogglePublic(session.id, session.defaultQuestionPublic)} />],
            [tSeq("likesLabel"), <Switch key="likes" checked={session.likesVisibleToPeers} onCheckedChange={() => onToggleLikes(session.id, session.likesVisibleToPeers)} />],
            [tSeq("commentsLabel"), <Switch key="comments" checked={session.commentsVisibleToPeers} onCheckedChange={() => onToggleCommentsVisible(session.id, session.commentsVisibleToPeers)} />],
          ] as const).map(([label, control]) => (
            <div key={label} className="flex items-center justify-between rounded-md border bg-background px-3 py-2 lg:w-20 lg:justify-center lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
              <span className="text-xs font-medium text-muted-foreground lg:hidden">{label}</span>
              {control}
            </div>
          ))}
          <div className="col-span-2 flex justify-end gap-1 lg:col-span-1 lg:w-24 lg:justify-center">
            {/* 아이콘 버튼(질문 목록 관리 열과 동일 패턴) */}
            <button
              type="button"
              onClick={openEdit}
              className="rounded-md border border-indigo-200 p-1.5 text-indigo-600 hover:bg-indigo-50"
              title={tc("edit")}
              aria-label={tc("edit")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(session.id)}
              className="rounded-md border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
              title={tc("delete")}
              aria-label={tc("delete")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {showMissingStudents && (
        <div className="border-t border-emerald-100 bg-emerald-50/40 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          {isLoadingParticipation ? (
            <p className="text-xs font-medium text-muted-foreground">{t("missingStudentsLoading")}</p>
          ) : isParticipationError ? (
            <p className="text-xs font-medium text-destructive">{t("missingStudentsLoadFailed")}</p>
          ) : missingStudents.length === 0 ? (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-200">{t("missingStudentsEmpty")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {missingStudents.map((student) => (
                <span
                  key={student.id}
                  className="inline-flex items-center rounded-md border border-emerald-200 bg-background px-2 py-1 text-xs font-medium text-foreground dark:border-emerald-900"
                >
                  {t("missingStudentLabel", {
                    grade: student.grade ?? "-",
                    className: student.className ?? "-",
                    number: student.studentNumber ?? "-",
                    name: student.name,
                  })}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="border-t bg-indigo-50/40 dark:bg-indigo-950/30 px-4 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("date")}</Label>
              <DatePicker value={eDate} onChange={setEDate} placeholder={t("pickDate")} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("subject")}</Label>
              <Input
                className="h-9 w-24 bg-background"
                value={isDesignSession ? session.subject : eSubject}
                disabled={isDesignSession}
                onChange={(e) => setESubject(e.target.value)}
                placeholder={t("subjectPlaceholder")}
              />
            </div>
            {isDesignSession && (
              <div className="space-y-1">
                <Label className="text-xs">{t("areaLabel")}</Label>
                <Input className="h-9 w-24 bg-muted" value={eArea} disabled />
              </div>
            )}
            <div className="space-y-1 min-w-0 flex-1">
              <Label className="text-xs">{isDesignSession ? t("unitLabel") : t("topic")}</Label>
              <Input className="h-9 bg-background" value={eTopic} onChange={(e) => setETopic(e.target.value)} placeholder={t("topicPlaceholderShort")} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={savingEdit} onClick={saveEdit} className="font-semibold">
                {savingEdit ? t("saving") : tc("save")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>{tc("cancel")}</Button>
            </div>
          </div>
          {isDesignSession && (
            <p className="mt-1 text-xs text-muted-foreground">{t("inquiryEditNote")}</p>
          )}
        </div>
      )}
    </div>
  );
}

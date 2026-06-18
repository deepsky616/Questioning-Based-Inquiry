"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DatePicker from "@/components/shared/DatePicker";
import { SessionTargetSelector } from "@/components/shared/SessionTargetSelector";
import { buildSessionLabel, isSessionAvailable, sortSessionsAsc, sortSessionsDesc, getSessionFilterOptions, filterSessions } from "@/lib/sessions";
import {
  buildClassTargetValue,
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
  teacher: { name: string };
  unitDesignId?: string | null;
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
}

export default function TeacherSessionsPage() {
  const [sessions, setSessions] = useState<QuestionSession[]>([]);
  const [students, setStudents] = useState<SessionTargetStudent[]>([]);
  const [teacherClasses, setTeacherClasses] = useState<SessionTargetClass[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  // 세션 목록 조회/정렬 상태
  const [listFilterDate, setListFilterDate] = useState("");
  const [listFilterSubject, setListFilterSubject] = useState("");
  const [listFilterTopic, setListFilterTopic] = useState("");
  const [listSort, setListSort] = useState<"desc" | "asc">("desc");

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
    Promise.all([
      fetch("/api/sessions").then((r) => r.json()),
      fetch("/api/teacher/students").then((r) => r.json()),
    ])
      .then(([sessionData, targetData]) => {
        setSessions(sortSessionsAsc(Array.isArray(sessionData) ? sessionData : []));
        setStudents(targetData.students ?? []);
        setTeacherClasses(targetData.teacherClasses ?? []);
        const classes = targetData.teacherClasses ?? [];
        if (classes.length > 0) {
          const targetClassValue = buildClassTargetValue(classes[0]);
          const selectedStudentIds = (targetData.students ?? [])
            .filter((student: SessionTargetStudent) => student.grade === classes[0].grade && student.className === classes[0].className)
            .map((student: SessionTargetStudent) => student.id);
          setSessForm((prev) => ({ ...prev, targetClassValue, selectedStudentIds }));
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!subjectOptions.includes(sessForm.subject)) {
      setSessForm((prev) => ({ ...prev, subject: subjectOptions[0] ?? "" }));
    }
  }, [sessForm.subject, subjectOptions]);

  const handleCreate = async () => {
    if (!sessForm.date || !sessForm.subject.trim() || !sessForm.topic.trim()) {
      setMsg({ type: "error", text: "날짜, 교과, 주제는 필수입니다" });
      return;
    }
    if (sessForm.targetClassValue !== "all" && sessForm.selectedStudentIds.length === 0) {
      setMsg({ type: "error", text: "배포할 학생을 1명 이상 선택하세요" });
      return;
    }
    setIsSaving(true);
    setMsg(null);
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
      setMsg({ type: "success", text: "세션이 추가됐습니다" });
    } catch {
      setMsg({ type: "error", text: "세션 저장에 실패했습니다" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 세션을 삭제하시겠습니까? 연결된 질문은 세션 없음 상태가 됩니다.")) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
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
    if (!res.ok) return false;
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
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, likesVisibleToPeers: currentValue } : s))
      );
    }
  };

  // 세션 목록 조회 필터(날짜·교과·주제) + 정렬(날짜 최신순/오래된순)
  const filterOptions = getSessionFilterOptions(sessions);
  const visibleSessions = filterSessions(sessions, {
    date: listFilterDate || undefined,
    subject: listFilterSubject || undefined,
    topic: listFilterTopic || undefined,
  });
  const sortedSessions = listSort === "asc" ? sortSessionsAsc(visibleSessions) : sortSessionsDesc(visibleSessions);
  const activeSessions = sortedSessions.filter((s) => isSessionAvailable(s.date));
  const pastSessions = sortedSessions.filter((s) => !isSessionAvailable(s.date));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">수업 세션</h2>
        <p className="text-muted-foreground">수업 세션을 만들고 관리하세요. 학생들이 질문할 때 세션을 선택할 수 있습니다.</p>
      </div>

      {/* 새 세션 만들기 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">새 세션 만들기</CardTitle>
          <CardDescription>날짜·교과·주제를 입력하면 학생 화면에서 선택 가능한 세션이 생성됩니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 날짜·교과·주제 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>날짜</Label>
              <DatePicker
                value={sessForm.date}
                onChange={(v) => setSessForm((p) => ({ ...p, date: v }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sess-subject">교과</Label>
              <Select
                value={sessForm.subject}
                onValueChange={(value) => setSessForm((p) => ({ ...p, subject: value }))}
              >
                <SelectTrigger id="sess-subject">
                  <SelectValue placeholder="교과 선택" />
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
              <Label htmlFor="sess-topic">주제</Label>
              <Input
                id="sess-topic"
                placeholder="예: 지구의 역사"
                value={sessForm.topic}
                onChange={(e) => setSessForm((p) => ({ ...p, topic: e.target.value }))}
              />
            </div>
          </div>

          {/* 대상 선택 + 공개 설정 (좌우 배치) */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>대상 선택</Label>
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
              <p className="text-sm font-semibold text-foreground">공개 설정</p>
              <div className="space-y-2">
                {([
                  ["isActive", "학생 활성화", "학생이 이 세션에서 질문을 작성할 수 있어요.", sessForm.isActive],
                  ["defaultQuestionPublic", "질문 공개", "학생이 작성한 질문을 서로 볼 수 있어요. (끄면 본인 질문만)", sessForm.defaultQuestionPublic],
                  ["likesVisibleToPeers", "좋아요 공개", "서로의 좋아요를 누르고 좋아요 수를 볼 수 있어요.", sessForm.likesVisibleToPeers],
                  ["commentsVisibleToPeers", "댓글 공개", "서로의 댓글을 볼 수 있어요. (끄면 본인·선생님 댓글만)", sessForm.commentsVisibleToPeers],
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

          <div className="flex items-center gap-3">
            <Button onClick={handleCreate} disabled={isSaving}>
              {isSaving ? "저장 중..." : "세션 추가"}
            </Button>
            {msg && (
              <span className={`text-sm ${msg.type === "success" ? "text-green-700" : "text-red-600"}`}>
                {msg.text}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 세션 목록 */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400">로딩 중...</div>
      ) : sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          등록된 세션이 없습니다. 위에서 새 세션을 추가해 보세요.
        </div>
      ) : (
        <div className="space-y-4">
          {/* 세션 목록 조회/정렬 */}
          <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">날짜</span>
              <Select value={listFilterDate || "__all__"} onValueChange={(v) => setListFilterDate(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-white w-36"><SelectValue placeholder="전체 날짜" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체 날짜</SelectItem>
                  {filterOptions.dates.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">교과</span>
              <Select value={listFilterSubject || "__all__"} onValueChange={(v) => setListFilterSubject(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-white w-32"><SelectValue placeholder="전체 교과" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체 교과</SelectItem>
                  {filterOptions.subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">주제</span>
              <Select value={listFilterTopic || "__all__"} onValueChange={(v) => setListFilterTopic(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-8 text-sm bg-white w-40"><SelectValue placeholder="전체 주제" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체 주제</SelectItem>
                  {filterOptions.topics.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">정렬</span>
              <div className="flex rounded-md border overflow-hidden h-8">
                {([["desc", "최신순"], ["asc", "오래된순"]] as const).map(([v, label], i) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setListSort(v)}
                    className={`px-3 text-xs font-medium transition-colors ${i > 0 ? "border-l" : ""} ${
                      listSort === v ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {(listFilterDate || listFilterSubject || listFilterTopic) && (
              <button
                type="button"
                onClick={() => { setListFilterDate(""); setListFilterSubject(""); setListFilterTopic(""); }}
                className="h-8 text-xs font-medium text-indigo-600"
              >
                초기화
              </button>
            )}
          </div>

          {activeSessions.length === 0 && pastSessions.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
              조건에 맞는 세션이 없습니다.
            </div>
          )}

          {activeSessions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    오늘·예정 수업
                    <span className="text-sm font-normal text-gray-500">총 {activeSessions.length}개</span>
                  </CardTitle>
                  <div className="hidden sm:flex items-center gap-5 text-xs text-gray-400">
                    <span className="w-16 text-center">학생 활성화</span>
                    <span className="w-16 text-center">질문 공개</span>
                    <span className="w-16 text-center">좋아요 공개</span>
                    <span className="w-16 text-center">댓글 공개</span>
                    <span className="w-24 text-center">관리</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="divide-y rounded-lg border overflow-hidden">
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
              </CardContent>
            </Card>
          )}

          {pastSessions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
                    지난 수업
                    <span className="text-sm font-normal text-gray-500">총 {pastSessions.length}개</span>
                  </CardTitle>
                  <div className="hidden sm:flex items-center gap-5 text-xs text-gray-400">
                    <span className="w-16 text-center">학생 활성화</span>
                    <span className="w-16 text-center">질문 공개</span>
                    <span className="w-16 text-center">좋아요 공개</span>
                    <span className="w-16 text-center">댓글 공개</span>
                    <span className="w-24 text-center">관리</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="divide-y rounded-lg border overflow-hidden">
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
              </CardContent>
            </Card>
          )}
        </div>
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
  const isDesignSession = !!session.unitDesignId;
  const [editing, setEditing] = useState(false);
  const [eDate, setEDate] = useState(session.date);
  const [eSubject, setESubject] = useState(session.subject);
  const [eTopic, setETopic] = useState(session.topic);
  const [savingEdit, setSavingEdit] = useState(false);

  const openEdit = () => {
    setEDate(session.date);
    setESubject(session.subject);
    setETopic(session.topic);
    setEditing(true);
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
      <div className={`flex items-center justify-between px-4 py-3 transition-colors ${session.isActive ? "hover:bg-muted/50" : "hover:bg-muted"}`}>
        <div className="flex items-center gap-3 min-w-0">
          <span className={`shrink-0 w-2 h-2 rounded-full ${session.isActive ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`} />
          <div className="min-w-0">
            <p className={`text-sm font-medium truncate ${session.isActive ? "text-foreground" : "text-muted-foreground"}`}>
              {buildSessionLabel(session.date, session.subject, session.topic)}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {!session.isActive && (
                <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">학생 비활성</span>
              )}
              {!session.defaultQuestionPublic && (
                <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded dark:bg-orange-950/40 dark:text-orange-300">질문 비공개</span>
              )}
              {!session.likesVisibleToPeers && (
                <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded dark:bg-amber-950/40 dark:text-amber-300">좋아요 비공개</span>
              )}
              {!session.commentsVisibleToPeers && (
                <span className="text-xs bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded dark:bg-rose-950/40 dark:text-rose-300">댓글 서로 비공개</span>
              )}
              {isDesignSession && (
                <span className="text-xs font-bold bg-indigo-600 text-white px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">🧩 탐구질문 수업</span>
              )}
              <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded dark:bg-slate-800 dark:text-slate-300">
                {buildTargetLabel({
                  targetType: session.targetType,
                  targetGrade: session.targetGrade,
                  targetClassName: session.targetClassName,
                  targetStudentName: session.targetStudent?.name,
                })}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-5 shrink-0">
          <div className="w-16 flex justify-center"><Switch checked={session.isActive} onCheckedChange={() => onToggleActive(session.id, session.isActive)} /></div>
          <div className="w-16 flex justify-center"><Switch checked={session.defaultQuestionPublic} onCheckedChange={() => onTogglePublic(session.id, session.defaultQuestionPublic)} /></div>
          <div className="w-16 flex justify-center"><Switch checked={session.likesVisibleToPeers} onCheckedChange={() => onToggleLikes(session.id, session.likesVisibleToPeers)} /></div>
          <div className="w-16 flex justify-center"><Switch checked={session.commentsVisibleToPeers} onCheckedChange={() => onToggleCommentsVisible(session.id, session.commentsVisibleToPeers)} /></div>
          <div className="w-24 flex justify-end gap-1">
            <Button variant="ghost" size="sm" className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 h-7 px-2 text-xs" onClick={openEdit}>
              수정
            </Button>
            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2 text-xs" onClick={() => onDelete(session.id)}>
              삭제
            </Button>
          </div>
        </div>
      </div>

      {editing && (
        <div className="border-t bg-indigo-50/40 dark:bg-indigo-950/30 px-4 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">날짜</Label>
              <DatePicker value={eDate} onChange={setEDate} placeholder="날짜 선택" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">교과</Label>
              <Input
                className="h-9 w-32 bg-background"
                value={isDesignSession ? session.subject : eSubject}
                disabled={isDesignSession}
                onChange={(e) => setESubject(e.target.value)}
                placeholder="교과"
              />
            </div>
            <div className="space-y-1 min-w-0 flex-1">
              <Label className="text-xs">주제</Label>
              <Input className="h-9 bg-background" value={eTopic} onChange={(e) => setETopic(e.target.value)} placeholder="주제" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={savingEdit} onClick={saveEdit} className="font-semibold">
                {savingEdit ? "저장 중..." : "저장"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>취소</Button>
            </div>
          </div>
          {isDesignSession && (
            <p className="mt-1 text-xs text-muted-foreground">🧩 탐구질문 수업은 날짜·주제만 수정할 수 있어요(교과 고정).</p>
          )}
        </div>
      )}
    </div>
  );
}

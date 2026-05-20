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
import { buildSessionLabel, isSessionAvailable, sortSessionsAsc } from "@/lib/sessions";
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
  });
  const [isSaving, setIsSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

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

  const activeSessions = sessions.filter((s) => isSessionAvailable(s.date));
  const pastSessions = sessions.filter((s) => !isSessionAvailable(s.date));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">수업 세션</h2>
        <p className="text-gray-600">수업 세션을 만들고 관리하세요. 학생들이 질문할 때 세션을 선택할 수 있습니다.</p>
      </div>

      {/* 새 세션 만들기 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">새 세션 만들기</CardTitle>
          <CardDescription>날짜·교과·주제를 입력하면 학생 화면에서 선택 가능한 세션이 생성됩니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.4fr_1fr_1fr_2fr]">
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

          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-800">이 세션 질문 기본 공개</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  켜면 학생이 이 세션에서 만든 질문이 저장 즉시 공개됩니다. 학생은 직접 변경할 수 없습니다.
                </p>
              </div>
              <Switch
                checked={sessForm.defaultQuestionPublic}
                onCheckedChange={(v) => setSessForm((p) => ({ ...p, defaultQuestionPublic: v }))}
              />
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
          {activeSessions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    생성된 수업 세션
                    <span className="text-sm font-normal text-gray-500">({activeSessions.length}개)</span>
                  </CardTitle>
                  <div className="flex items-center gap-5 pr-12 text-xs text-gray-400">
                    <span className="w-16 text-center">학생 활성화</span>
                    <span className="w-16 text-center">질문 공개</span>
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
                    수업 세션 목록
                    <span className="text-sm font-normal text-gray-500">({pastSessions.length}개)</span>
                  </CardTitle>
                  <div className="flex items-center gap-5 pr-12 text-xs text-gray-400">
                    <span className="w-16 text-center">학생 활성화</span>
                    <span className="w-16 text-center">질문 공개</span>
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
}: {
  session: QuestionSession;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, current: boolean) => void;
  onTogglePublic: (id: string, current: boolean) => void;
}) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 transition-colors ${session.isActive ? "bg-white hover:bg-gray-50" : "bg-gray-50 hover:bg-gray-100"}`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className={`shrink-0 w-2 h-2 rounded-full ${session.isActive ? "bg-green-500" : "bg-gray-300"}`} />
        <div className="min-w-0">
          <p className={`text-sm font-medium truncate ${session.isActive ? "text-gray-900" : "text-gray-400"}`}>
            {buildSessionLabel(session.date, session.subject, session.topic)}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {!session.isActive && (
              <span className="text-xs bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">학생 비활성</span>
            )}
            {!session.defaultQuestionPublic && (
              <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">질문 비공개</span>
            )}
            {session.unitDesignId && (
              <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">탐구 질문 수업</span>
            )}
            <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
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
        <Switch
          checked={session.isActive}
          onCheckedChange={() => onToggleActive(session.id, session.isActive)}
        />
        <Switch
          checked={session.defaultQuestionPublic}
          onCheckedChange={() => onTogglePublic(session.id, session.defaultQuestionPublic)}
        />
        <Button
          variant="ghost"
          size="sm"
          className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 px-2 text-xs"
          onClick={() => onDelete(session.id)}
        >
          삭제
        </Button>
      </div>
    </div>
  );
}

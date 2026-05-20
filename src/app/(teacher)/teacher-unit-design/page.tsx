"use client";

import { useEffect, useMemo, useState } from "react";
import { GripVertical, Plus, RotateCw, Save, Sparkles, Trash2 } from "lucide-react";
import DatePicker from "@/components/shared/DatePicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UNIT_FLOW_GROUPS, UNIT_FLOW_OPTIONS } from "@/lib/unit-sequence";
import { buildSessionLabel, sortSessionsAsc } from "@/lib/sessions";
import {
  buildClassTargetValue,
  buildSessionTargetPayload,
  buildStudentTargetValue,
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
  defaultQuestionPublic: boolean;
  isActive: boolean;
  targetType?: string | null;
  targetGrade?: string | null;
  targetClassName?: string | null;
  targetStudentId?: string | null;
}

interface SequencedQuestion {
  id: string;
  type: string;
  content: string;
  source: "student" | "teacher";
  contentGroup: string;
  priority: number;
  lessonPhase: string;
  rationale: string;
}

const TYPE_LABEL: Record<string, string> = {
  factual: "사실",
  conceptual: "개념",
  controversial: "논쟁",
  student: "학생",
};

const TYPE_STYLE: Record<string, string> = {
  factual: "bg-blue-50 text-blue-700 border-blue-200",
  conceptual: "bg-violet-50 text-violet-700 border-violet-200",
  controversial: "bg-amber-50 text-amber-700 border-amber-200",
  student: "bg-gray-50 text-gray-700 border-gray-200",
};

function reorder<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export default function TeacherUnitDesignPage() {
  const [sessions, setSessions] = useState<QuestionSession[]>([]);
  const [students, setStudents] = useState<SessionTargetStudent[]>([]);
  const [teacherClasses, setTeacherClasses] = useState<SessionTargetClass[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [flowId, setFlowId] = useState("cognitive-development");
  const [newSession, setNewSession] = useState({
    targetValue: "all",
    date: "",
    subject: "",
    topic: "",
    defaultQuestionPublic: true,
  });
  const [additionalQuestion, setAdditionalQuestion] = useState("");
  const [additionalQuestions, setAdditionalQuestions] = useState<string[]>([]);
  const [sequencedQuestions, setSequencedQuestions] = useState<SequencedQuestion[]>([]);
  const [designTitle, setDesignTitle] = useState("");
  const [generatedBy, setGeneratedBy] = useState<"ai" | "rules" | "">("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isSequencing, setIsSequencing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null;
  const selectedFlow = UNIT_FLOW_OPTIONS.find((flow) => flow.id === flowId) ?? UNIT_FLOW_OPTIONS[0];
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
  const selectedTargetGrade = getTargetGrade(newSession.targetValue, targetClasses, students);
  const subjectOptions = getSubjectsForGrade(selectedTargetGrade);
  const groupedQuestions = useMemo(() => {
    const groups = new Map<string, SequencedQuestion[]>();
    sequencedQuestions.forEach((question) => {
      const key = question.contentGroup || "공통 탐구 질문";
      groups.set(key, [...(groups.get(key) ?? []), question]);
    });
    return Array.from(groups.entries());
  }, [sequencedQuestions]);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const [res, targetRes] = await Promise.all([
        fetch("/api/sessions"),
        fetch("/api/teacher/students"),
      ]);
      const data: QuestionSession[] = await res.json();
      const targetData = await targetRes.json();
      setSessions(sortSessionsAsc(Array.isArray(data) ? data : []));
      setStudents(targetData.students ?? []);
      setTeacherClasses(targetData.teacherClasses ?? []);
      const classes = targetData.teacherClasses ?? [];
      if (classes.length > 0) {
        setNewSession((prev) => ({ ...prev, targetValue: buildClassTargetValue(classes[0]) }));
      }
    } catch {
      setMessage({ type: "error", text: "수업세션 목록을 불러오지 못했습니다" });
    } finally {
      setIsLoadingSessions(false);
    }
  };

  useEffect(() => {
    if (!subjectOptions.includes(newSession.subject)) {
      setNewSession((prev) => ({ ...prev, subject: subjectOptions[0] ?? "" }));
    }
  }, [newSession.subject, subjectOptions]);

  const createSession = async () => {
    if (!newSession.date || !newSession.subject.trim() || !newSession.topic.trim()) {
      setMessage({ type: "error", text: "날짜, 교과, 단원/주제를 입력하세요" });
      return;
    }
    setIsCreatingSession(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newSession,
          ...buildSessionTargetPayload(newSession.targetValue),
        }),
      });
      if (!res.ok) throw new Error();
      const created: QuestionSession = await res.json();
      setSessions((prev) => sortSessionsAsc([...prev, created]));
      setSelectedSessionId(created.id);
      setDesignTitle(`${created.subject} ${created.topic} 단원 설계`);
      setNewSession((prev) => ({
        targetValue: prev.targetValue,
        date: "",
        subject: getSubjectsForGrade(getTargetGrade(prev.targetValue, targetClasses, students))[0] ?? "",
        topic: "",
        defaultQuestionPublic: true,
      }));
      setMessage({ type: "success", text: "단원설계용 수업세션을 만들었습니다" });
    } catch {
      setMessage({ type: "error", text: "수업세션 생성에 실패했습니다" });
    } finally {
      setIsCreatingSession(false);
    }
  };

  const addQuestion = () => {
    const value = additionalQuestion.trim();
    if (!value) return;
    setAdditionalQuestions((prev) => [...prev, value]);
    setAdditionalQuestion("");
  };

  const runSequencing = async () => {
    if (!selectedSessionId) {
      setMessage({ type: "error", text: "단원설계를 만들 수업세션을 선택하세요" });
      return;
    }
    setIsSequencing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/unit-design/sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedSessionId, flowId, additionalQuestions }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "sequence failed");
      setSequencedQuestions(body.sequencedQuestions ?? []);
      setGeneratedBy(body.generatedBy ?? "rules");
      setDesignTitle((prev) =>
        prev || `${body.session.subject} ${body.session.topic || body.session.date} 단원 설계`,
      );
      setMessage({
        type: "success",
        text: body.generatedBy === "ai"
          ? "AI가 질문을 내용별로 분류하고 수업 순서를 제안했습니다"
          : "기본 규칙으로 질문을 분류하고 수업 순서를 제안했습니다",
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "단원설계 생성에 실패했습니다",
      });
    } finally {
      setIsSequencing(false);
    }
  };

  const saveDesign = async () => {
    if (!selectedSession || sequencedQuestions.length === 0) {
      setMessage({ type: "error", text: "저장할 단원설계 결과가 없습니다" });
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      const orderedQuestions = sequencedQuestions.map((question, index) => ({
        ...question,
        priority: index + 1,
      }));
      const res = await fetch("/api/unit-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: designTitle.trim() || `${selectedSession.subject} ${selectedSession.topic} 단원 설계`,
          subject: selectedSession.subject,
          gradeRange: "",
          area: selectedSession.topic || "단원설계",
          coreIdea: selectedFlow.description,
          selectedKeywords: [selectedFlow.title],
          coreSentences: groupedQuestions.map(([group]) => group),
          essentialQuestions: [`${selectedFlow.title} 기준으로 어떤 순서로 탐구할까?`],
          inquiryQuestions: orderedQuestions,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "save failed");
      setMessage({ type: "success", text: "단원설계를 저장했습니다" });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "단원설계 저장에 실패했습니다",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    setSequencedQuestions((prev) =>
      reorder(prev, dragIndex, targetIndex).map((question, index) => ({ ...question, priority: index + 1 })),
    );
    setDragIndex(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">단원설계</h2>
        <p className="text-gray-600">
          학생 질문을 내용별로 묶고 단원 설계 기준에 따라 수업 순서를 정합니다.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">단원설계용 수업세션 만들기</CardTitle>
          <CardDescription>학생들이 질문을 남길 단원 세션을 먼저 만들거나 기존 세션을 선택하세요</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1fr_2fr_auto]">
            <div className="space-y-1">
              <Label>배포 대상</Label>
              <Select
                value={newSession.targetValue}
                onValueChange={(value) => setNewSession((prev) => ({ ...prev, targetValue: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="학급 또는 학생 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 담당 학급</SelectItem>
                  {targetClasses.map((targetClass) => (
                    <SelectItem key={buildClassTargetValue(targetClass)} value={buildClassTargetValue(targetClass)}>
                      {targetClass.grade}학년 {targetClass.className}반
                    </SelectItem>
                  ))}
                  {students.map((student) => (
                    <SelectItem key={student.id} value={buildStudentTargetValue(student)}>
                      {student.grade}학년 {student.className}반 {student.studentNumber}번 {student.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>날짜</Label>
              <DatePicker
                value={newSession.date}
                onChange={(value) => setNewSession((prev) => ({ ...prev, date: value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="unit-subject">교과</Label>
              <Select
                value={newSession.subject}
                onValueChange={(value) => setNewSession((prev) => ({ ...prev, subject: value }))}
              >
                <SelectTrigger id="unit-subject">
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
              <Label htmlFor="unit-topic">단원/주제</Label>
              <Input
                id="unit-topic"
                placeholder="예: 날씨와 우리 생활"
                value={newSession.topic}
                onChange={(event) => setNewSession((prev) => ({ ...prev, topic: event.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={createSession} disabled={isCreatingSession} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                {isCreatingSession ? "생성 중" : "세션 생성"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">설계 조건</CardTitle>
              <CardDescription>수업세션과 단원 설계 흐름을 선택하세요</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>수업세션</Label>
                <Select
                  value={selectedSessionId}
                  onValueChange={(value) => {
                    setSelectedSessionId(value);
                    const session = sessions.find((item) => item.id === value);
                    if (session) setDesignTitle(`${session.subject} ${session.topic || session.date} 단원 설계`);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={isLoadingSessions ? "불러오는 중..." : "세션 선택"} />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((session) => (
                      <SelectItem key={session.id} value={session.id}>
                        {buildSessionLabel(session.date, session.subject, session.topic)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>단원 설계 기준</Label>
                <Select value={flowId} onValueChange={setFlowId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_FLOW_GROUPS.map((group) => (
                      <div key={group.group}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-gray-500">{group.group}</div>
                        {group.flows.map((flow) => (
                          <SelectItem key={flow.id} value={flow.id}>
                            {flow.title}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {selectedFlow.axis}: {selectedFlow.description}
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="design-title">저장 제목</Label>
                <Input
                  id="design-title"
                  value={designTitle}
                  onChange={(event) => setDesignTitle(event.target.value)}
                  placeholder="예: 날씨와 우리 생활 단원 설계"
                />
              </div>

              <Button onClick={runSequencing} disabled={isSequencing} className="w-full">
                <Sparkles className="mr-2 h-4 w-4" />
                {isSequencing ? "분석 중" : "질문 분류·순서 제안"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">교사 추가 질문</CardTitle>
              <CardDescription>학생 질문만으로 부족한 연결 질문을 더할 수 있습니다</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={additionalQuestion}
                onChange={(event) => setAdditionalQuestion(event.target.value)}
                placeholder="예: 날씨 변화가 우리 생활에 주는 영향은 무엇일까?"
              />
              <Button variant="outline" onClick={addQuestion} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                추가
              </Button>
              {additionalQuestions.length > 0 && (
                <div className="space-y-2">
                  {additionalQuestions.map((question, index) => (
                    <div key={`${question}-${index}`} className="flex gap-2 rounded-md border bg-gray-50 p-2 text-sm">
                      <span className="min-w-0 flex-1 text-gray-700">{question}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-red-500"
                        onClick={() => setAdditionalQuestions((prev) => prev.filter((_, i) => i !== index))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">수업 순서 제안</CardTitle>
                  <CardDescription>
                    질문 카드를 드래그해서 교사가 직접 수업 순서를 조절할 수 있습니다
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={runSequencing} disabled={isSequencing || !selectedSessionId}>
                    <RotateCw className="mr-2 h-4 w-4" />
                    다시 제안
                  </Button>
                  <Button onClick={saveDesign} disabled={isSaving || sequencedQuestions.length === 0}>
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? "저장 중" : "저장"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {message && (
                <div className={`rounded-md px-3 py-2 text-sm ${
                  message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                }`}>
                  {message.text}
                </div>
              )}

              {sequencedQuestions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-400">
                  수업세션을 선택하고 질문 분류·순서 제안을 실행하세요.
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className="rounded-full border bg-white px-2 py-1">
                      {selectedFlow.title}
                    </span>
                    <span className="rounded-full border bg-white px-2 py-1">
                      {generatedBy === "ai" ? "AI 제안" : "기본 규칙 제안"}
                    </span>
                    <span className="rounded-full border bg-white px-2 py-1">
                      {sequencedQuestions.length}개 질문
                    </span>
                  </div>

                  <div className="space-y-3">
                    {sequencedQuestions.map((question, index) => (
                      <div
                        key={question.id}
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleDrop(index)}
                        className="flex gap-3 rounded-lg border bg-white p-3 shadow-sm transition-colors hover:bg-gray-50"
                      >
                        <div className="flex w-10 shrink-0 flex-col items-center gap-1 text-gray-400">
                          <GripVertical className="h-4 w-4 cursor-grab" />
                          <span className="text-sm font-semibold text-gray-700">{index + 1}</span>
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-xs ${TYPE_STYLE[question.type] ?? TYPE_STYLE.student}`}>
                              {TYPE_LABEL[question.type] ?? question.type}
                            </span>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                              {question.contentGroup}
                            </span>
                            <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
                              {question.lessonPhase}
                            </span>
                            {question.source === "teacher" && (
                              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                                교사 추가
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-900">{question.content}</p>
                          <p className="text-xs text-gray-500">{question.rationale}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {groupedQuestions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">내용별 유형화</CardTitle>
                <CardDescription>비슷한 질문끼리 묶인 결과입니다</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2">
                  {groupedQuestions.map(([group, questions]) => (
                    <div key={group} className="rounded-lg border bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-gray-800">{group}</h3>
                        <span className="text-xs text-gray-400">{questions.length}개</span>
                      </div>
                      <ul className="space-y-1 text-xs text-gray-600">
                        {questions.map((question) => (
                          <li key={question.id} className="line-clamp-2">
                            {question.priority}. {question.content}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

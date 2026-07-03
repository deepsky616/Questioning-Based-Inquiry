"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionVisibilitySettings } from "@/components/shared/SessionVisibilitySettings";
import { SessionTargetSelector } from "@/components/shared/SessionTargetSelector";
import { QuestionSequenceEditor } from "@/components/teacher/QuestionSequenceEditor";
import {
  buildClassStudentTargetPayload,
  defaultTargetSelection,
  type SessionTargetClass,
  type SessionTargetStudent,
} from "@/lib/session-targeting";
import type { SequencedQuestion } from "@/lib/unit-sequence";

interface DeploySettings {
  isActive: boolean;
  defaultQuestionPublic: boolean;
  likesVisibleToPeers: boolean;
  commentsVisibleToPeers: boolean;
}

export function QuestionSequencePanel({
  sessionId, subject, topic, onDeployed, initialQuestions, editMode,
}: {
  sessionId: string;
  subject?: string;
  topic?: string;
  onDeployed?: () => void;
  initialQuestions?: SequencedQuestion[];
  editMode?: boolean;
}) {
  const t = useTranslations("sequencePanel");
  const [result, setResult] = useState<SequencedQuestion[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // 배포 설정 기본값: 항상 모두 활성화
  const [settings, setSettings] = useState<DeploySettings>({
    isActive: true,
    defaultQuestionPublic: true,
    likesVisibleToPeers: true,
    commentsVisibleToPeers: true,
  });

  // 배포 대상 선택(수업세션 페이지와 동일 UI) — 기본값은 항상 전체 학생 모두 선택
  const [students, setStudents] = useState<SessionTargetStudent[]>([]);
  const [teacherClasses, setTeacherClasses] = useState<SessionTargetClass[]>([]);
  const [targetClassValue, setTargetClassValue] = useState("all");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/teacher/students")
      .then((r) => r.json())
      .then((d) => {
        const list: SessionTargetStudent[] = d.students ?? [];
        const classes: SessionTargetClass[] = d.teacherClasses ?? [];
        setStudents(list);
        setTeacherClasses(classes);
        // 기본값: 학급이 여러 개면 전체 담당 학급, 한 개뿐이면 그 학급 전체 학생
        const defaults = defaultTargetSelection(list, classes);
        setTargetClassValue(defaults.targetClassValue);
        setSelectedStudentIds(defaults.selectedStudentIds);
      })
      .catch(() => {});
  }, []);

  const targetClasses = useMemo(() => {
    if (teacherClasses.length > 0) return teacherClasses;
    const map = new Map<string, SessionTargetClass>();
    students.forEach((s) => {
      if (s.grade && s.className) map.set(`${s.grade}-${s.className}`, { grade: s.grade, className: s.className });
    });
    return Array.from(map.values());
  }, [students, teacherClasses]);

  async function publish() {
    if (result.length === 0) return;
    setIsPublishing(true);
    setMsg(null);
    try {
      // 배포 시 선택한 공개 설정 + 배포 대상을 세션에 먼저 반영
      const target = buildClassStudentTargetPayload({ targetClassValue, selectedStudentIds, students });
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, ...target }),
      });
      const res = await fetch(`/api/sessions/${sessionId}/publish-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sequence: result.map((q) => ({
            type: q.type, content: q.content,
            contentGroup: q.contentGroup, priority: q.priority, source: q.source,
            // 묶기 추적: 대표 질문에 합쳐진 학생 원본 질문(내용별 묶음 표시용)
            ...(q.mergedFrom && q.mergedFrom.length > 0 ? { mergedFrom: q.mergedFrom } : {}),
          })),
        }),
      });
      if (!res.ok) throw new Error();
      setMsg(t("published"));
      onDeployed?.();
    } catch {
      setMsg(t("publishFailed"));
    }
    setIsPublishing(false);
  }

  return (
    <div className="space-y-4">
      <QuestionSequenceEditor
        sessionId={sessionId}
        subject={subject}
        topic={topic}
        onChange={setResult}
        initialQuestions={initialQuestions}
        editMode={editMode}
      />
      {/* 배포 대상 선택 — 수업세션의 새 세션 만들기와 동일 구성 */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <p className="text-sm font-semibold text-foreground">{t("targetTitle")}</p>
        <SessionTargetSelector
          classes={targetClasses}
          students={students}
          targetClassValue={targetClassValue}
          selectedStudentIds={selectedStudentIds}
          onTargetClassChange={(v, ids) => { setTargetClassValue(v); setSelectedStudentIds(ids); }}
          onSelectedStudentIdsChange={setSelectedStudentIds}
        />
      </div>
      {/* ③ 배포 설정 토글 (2×2) — 공통 컴포넌트 */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <p className="text-sm font-semibold text-foreground">{t("settingsTitle")}</p>
        <SessionVisibilitySettings value={settings} onChange={(v) => setSettings(v)} />
      </div>
      <div className="space-y-2">
        <Button
          onClick={publish}
          disabled={isPublishing || result.length === 0}
          variant="gradient"
          className="h-11 w-full gap-1.5 text-base font-semibold"
        >
          <Send className="h-5 w-5" /> {isPublishing ? t("publishing") : t("publishBtn")}
        </Button>
        {msg && <p className="text-center text-sm text-muted-foreground">{msg}</p>}
      </div>
    </div>
  );
}

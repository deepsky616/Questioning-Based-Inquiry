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

/** 세션에 저장된 배포 대상(초기값 복원용) */
export interface InitialTarget {
  targetType?: string | null;
  targetGrade?: string | null;
  targetClassName?: string | null;
  targetStudentId?: string | null;
  targetStudentIds?: string[] | null;
}

export function QuestionSequencePanel({
  sessionId, subject, topic, initialSettings, initialTarget, onDeployed, initialQuestions, editMode,
}: {
  sessionId: string;
  subject?: string;
  topic?: string;
  initialSettings?: Partial<DeploySettings>;
  /** 세션의 현재 배포 대상 — 수업세션의 새 세션 만들기와 동일한 대상 선택 UI 초기값 */
  initialTarget?: InitialTarget;
  onDeployed?: () => void;
  initialQuestions?: SequencedQuestion[];
  editMode?: boolean;
}) {
  const t = useTranslations("sequencePanel");
  const [result, setResult] = useState<SequencedQuestion[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [settings, setSettings] = useState<DeploySettings>({
    isActive: initialSettings?.isActive ?? true,
    defaultQuestionPublic: initialSettings?.defaultQuestionPublic ?? true,
    likesVisibleToPeers: initialSettings?.likesVisibleToPeers ?? true,
    commentsVisibleToPeers: initialSettings?.commentsVisibleToPeers ?? true,
  });

  // 배포 대상 선택(수업세션 페이지와 동일 UI) — 세션의 현재 대상으로 초기화
  const [students, setStudents] = useState<SessionTargetStudent[]>([]);
  const [teacherClasses, setTeacherClasses] = useState<SessionTargetClass[]>([]);
  const [targetClassValue, setTargetClassValue] = useState("all");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [targetReady, setTargetReady] = useState(false);

  useEffect(() => {
    fetch("/api/teacher/students")
      .then((r) => r.json())
      .then((d) => {
        setStudents(d.students ?? []);
        setTeacherClasses(d.teacherClasses ?? []);
      })
      .catch(() => {});
  }, []);

  // 학생 목록 로드 후 세션의 저장된 대상을 1회 복원
  useEffect(() => {
    if (targetReady || students.length === 0) return;
    const init = initialTarget;
    const ids = Array.isArray(init?.targetStudentIds)
      ? init!.targetStudentIds!.filter((id): id is string => typeof id === "string")
      : [];
    if (init?.targetType === "CLASS" && init.targetGrade && init.targetClassName) {
      setTargetClassValue(`class:${init.targetGrade}:${init.targetClassName}`);
      setSelectedStudentIds(
        ids.length > 0
          ? ids
          : students.filter((s) => s.grade === init.targetGrade && s.className === init.targetClassName).map((s) => s.id),
      );
    } else if (init?.targetType === "STUDENT" || init?.targetType === "CUSTOM") {
      const selected = init.targetType === "STUDENT" && init.targetStudentId ? [init.targetStudentId] : ids;
      const first = students.find((s) => selected.includes(s.id));
      if (first) {
        setTargetClassValue(`class:${first.grade}:${first.className}`);
        setSelectedStudentIds(selected);
      } else {
        setSelectedStudentIds(students.map((s) => s.id));
      }
    } else {
      setSelectedStudentIds(students.map((s) => s.id));
    }
    setTargetReady(true);
  }, [students, targetReady, initialTarget]);

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
      <div className="flex items-center gap-3">
        <Button onClick={publish} disabled={isPublishing || result.length === 0} className="gap-1.5 font-semibold">
          <Send className="h-4 w-4" /> {isPublishing ? t("publishing") : t("publishBtn")}
        </Button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/use-toast";
import { appQueryKeys } from "@/lib/app-queries";
import {
  buildClassStudentTargetPayload,
  defaultTargetSelection,
  getSubjectsForGrade,
  getTargetGrade,
  type SessionTargetClass,
  type SessionTargetStudent,
} from "@/lib/session-targeting";
import { sortSessionsDesc } from "@/lib/sessions";
import { TeacherSessionCreateCard } from "./TeacherSessionCreateCard";
import type { QuestionSession, TeacherSessionForm } from "./types";

interface TeacherQuestionClassActionsProps {
  students: SessionTargetStudent[];
  teacherClasses: SessionTargetClass[];
  targetsReady?: boolean;
  onHighlight: (sessionId: string) => void;
}

const INITIAL_FORM: TeacherSessionForm = {
  targetClassValue: "all",
  selectedStudentIds: [],
  date: "",
  subject: "",
  topic: "",
  defaultQuestionPublic: true,
  likesVisibleToPeers: true,
  commentsVisibleToPeers: true,
  isActive: true,
};

export function TeacherQuestionClassActions({
  students,
  teacherClasses,
  targetsReady = true,
  onHighlight,
}: TeacherQuestionClassActionsProps) {
  const t = useTranslations("sessions");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [sessForm, setSessForm] = useState<TeacherSessionForm>(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [targetDefaulted, setTargetDefaulted] = useState(false);

  const targetClasses = useMemo(() => {
    if (teacherClasses.length > 0) return teacherClasses;
    const classes = new Map<string, SessionTargetClass>();
    students.forEach((student) => {
      if (!student.grade || !student.className) return;
      classes.set(`${student.grade}-${student.className}`, {
        grade: student.grade,
        className: student.className,
      });
    });
    return Array.from(classes.values());
  }, [students, teacherClasses]);

  const selectedTargetGrade = getTargetGrade(
    sessForm.targetClassValue,
    targetClasses,
    students,
  );
  const subjectOptions = getSubjectsForGrade(selectedTargetGrade);

  useEffect(() => {
    if (targetDefaulted || !targetsReady) return;
    setSessForm((previous) => ({
      ...previous,
      ...defaultTargetSelection(students, teacherClasses),
    }));
    setTargetDefaulted(true);
  }, [students, targetDefaulted, targetsReady, teacherClasses]);

  useEffect(() => {
    if (subjectOptions.includes(sessForm.subject)) return;
    setSessForm((previous) => ({
      ...previous,
      subject: subjectOptions[0] ?? "",
    }));
  }, [sessForm.subject, subjectOptions]);

  const handleCreate = async () => {
    if (!sessForm.date || !sessForm.subject.trim() || !sessForm.topic.trim()) {
      toast({ variant: "destructive", description: t("dateRequired") });
      return;
    }
    if (
      sessForm.targetClassValue !== "all" &&
      sessForm.selectedStudentIds.length === 0
    ) {
      toast({ variant: "destructive", description: t("selectTargets") });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/sessions", {
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
      if (!response.ok) throw new Error("question class create failed");

      const created = (await response.json()) as QuestionSession;
      if (typeof created.id !== "string" || !created.id.trim()) {
        throw new Error("question class id missing");
      }

      queryClient.setQueryData<QuestionSession[]>(
        appQueryKeys.teacherSessions,
        (previous = []) =>
          sortSessionsDesc([
            created,
            ...previous.filter((session) => session.id !== created.id),
          ]),
      );
      void queryClient.invalidateQueries({ queryKey: appQueryKeys.teacherSessions });

      setSessForm((previous) => ({
        ...INITIAL_FORM,
        targetClassValue: previous.targetClassValue,
        selectedStudentIds: previous.selectedStudentIds,
        subject:
          getSubjectsForGrade(
            getTargetGrade(previous.targetClassValue, targetClasses, students),
          )[0] ?? "",
      }));
      onHighlight(created.id);
      router.replace(`/teacher-sessions?session=${encodeURIComponent(created.id)}`);
      toast({ variant: "success", description: t("sessionAdded") });
    } catch {
      toast({ variant: "destructive", description: t("saveFailed") });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section id="quick-question-class-form" aria-labelledby="question-class-view-title">
      <TeacherSessionCreateCard
        form={sessForm}
        setForm={setSessForm}
        isSaving={isSaving}
        subjectOptions={subjectOptions}
        targetClasses={targetClasses}
        students={students}
        onCreate={handleCreate}
        showHeader={false}
        labelledBy="question-class-view-title"
      />
    </section>
  );
}

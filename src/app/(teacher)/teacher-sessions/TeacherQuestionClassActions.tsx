"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, ChevronDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
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
      setQuickCreateOpen(false);
      onHighlight(created.id);
      toast({ variant: "success", description: t("sessionAdded") });
    } catch {
      toast({ variant: "destructive", description: t("saveFailed") });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-4" aria-label={t("createActionsLabel")}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          asChild
          size="lg"
          className="h-11 gap-2 font-semibold"
          data-testid="question-class-primary-action"
        >
          <Link href="/teacher-curriculum">
            <BookOpenCheck className="h-5 w-5" />
            {t("createInquiryQuestionClass")}
          </Link>
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="h-11 gap-2 font-semibold"
          aria-controls="quick-question-class-form"
          aria-expanded={quickCreateOpen}
          onClick={() => setQuickCreateOpen((open) => !open)}
        >
          <Plus className="h-5 w-5" />
          {quickCreateOpen
            ? t("closeQuickQuestionClass")
            : t("createQuickQuestionClass")}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${quickCreateOpen ? "rotate-180" : ""}`}
          />
        </Button>
      </div>

      {quickCreateOpen && (
        <div id="quick-question-class-form">
          <TeacherSessionCreateCard
            form={sessForm}
            setForm={setSessForm}
            isSaving={isSaving}
            subjectOptions={subjectOptions}
            targetClasses={targetClasses}
            students={students}
            onCreate={handleCreate}
          />
        </div>
      )}
    </section>
  );
}

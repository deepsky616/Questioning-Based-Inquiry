"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/use-toast";
import type { Question } from "./types";

export function useTeacherQuestionQuickActions(reloadQuestions: () => Promise<unknown>) {
  const t = useTranslations("teacherQ");
  const { toast } = useToast();

  const handleToggleQuestionPublic = useCallback(
    async (question: Question) => {
      try {
        const response = await fetch(`/api/questions/${question.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublic: !question.isPublic }),
        });
        if (!response.ok) throw new Error();
        await reloadQuestions();
      } catch {
        toast({ variant: "destructive", description: t("publicUpdateFailed") });
      }
    },
    [reloadQuestions, t, toast],
  );

  const handleToggleLike = useCallback(
    async (question: Question) => {
      try {
        const response = await fetch(`/api/questions/${question.id}/likes`, {
          method: question.myLike ? "DELETE" : "POST",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error ?? t("likeUpdateFailed"));
        await reloadQuestions();
      } catch (error) {
        toast({
          variant: "destructive",
          description: error instanceof Error ? error.message : t("likeUpdateFailed"),
        });
      }
    },
    [reloadQuestions, t, toast],
  );

  return { handleToggleLike, handleToggleQuestionPublic };
}

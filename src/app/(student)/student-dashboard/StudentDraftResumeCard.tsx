"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { readQuestionDraft } from "@/lib/question-draft";

interface Session { id: string; subject: string; topic: string; isActive?: boolean }
interface ResumeDraft { session: Session; content: string; updatedAt: number }

export function StudentDraftResumeCard({ studentId, sessions }: { studentId: string; sessions: Session[] }) {
  const t = useTranslations("studentDash");
  const [drafts, setDrafts] = useState<ResumeDraft[]>([]);
  useEffect(() => {
    const refresh = () => {
      try {
        const available = sessions.filter((session) => session.isActive !== false).flatMap((session) => {
          const draft = readQuestionDraft(window.sessionStorage, studentId, session.id);
          return draft ? [{ session, content: draft.content, updatedAt: draft.updatedAt }] : [];
        });
        setDrafts(available.sort((a, b) => b.updatedAt - a.updatedAt));
      } catch {
        setDrafts([]);
      }
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [studentId, sessions]);

  if (drafts.length === 0) return null;
  return (
    <Card className="border-indigo-200 dark:border-indigo-500/30">
      <CardHeader className="pb-3"><CardTitle className="text-base">{t("draftTitle")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {drafts.map(({ session, content }) => (
          <div key={session.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{session.subject} · {session.topic}</p>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{content}</p>
            </div>
            <Button asChild className="h-11 shrink-0">
              <Link href={`/student-ask?sessionId=${encodeURIComponent(session.id)}`}>{t("draftContinue")}</Link>
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

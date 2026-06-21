"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { QuestionSequenceEditor } from "@/components/teacher/QuestionSequenceEditor";
import type { SequencedQuestion } from "@/lib/unit-sequence";

interface DeploySettings {
  isActive: boolean;
  defaultQuestionPublic: boolean;
  likesVisibleToPeers: boolean;
  commentsVisibleToPeers: boolean;
}

export function QuestionSequencePanel({
  sessionId, subject, topic, initialSettings, onDeployed, initialQuestions, editMode,
}: {
  sessionId: string;
  subject?: string;
  topic?: string;
  initialSettings?: Partial<DeploySettings>;
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

  async function publish() {
    if (result.length === 0) return;
    setIsPublishing(true);
    setMsg(null);
    try {
      // 배포 시 선택한 공개 설정을 세션에 먼저 반영
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const res = await fetch(`/api/sessions/${sessionId}/publish-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sequence: result.map((q) => ({
            type: q.type, content: q.content,
            contentGroup: q.contentGroup, priority: q.priority, source: q.source,
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

  const toggles: [keyof DeploySettings, string, string][] = [
    ["isActive", t("activeLabel"), t("activeDesc")],
    ["defaultQuestionPublic", t("publicLabel"), t("publicDesc")],
    ["likesVisibleToPeers", t("likesLabel"), t("likesDesc")],
    ["commentsVisibleToPeers", t("commentsLabel"), t("commentsDesc")],
  ];

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
      {/* ③ 배포 설정 토글 (2×2) */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <p className="text-sm font-semibold text-foreground">{t("settingsTitle")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {toggles.map(([key, label, desc]) => (
            <div key={key} className="rounded-md border border-border bg-background p-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <Switch
                  checked={settings[key]}
                  onCheckedChange={(v) => setSettings((s) => ({ ...s, [key]: v }))}
                />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{desc}</p>
            </div>
          ))}
        </div>
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

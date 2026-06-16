"use client";

import { useState } from "react";
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
  sessionId, subject, topic, initialSettings, onDeployed,
}: {
  sessionId: string;
  subject?: string;
  topic?: string;
  initialSettings?: Partial<DeploySettings>;
  onDeployed?: () => void;
}) {
  const [result, setResult] = useState<SequencedQuestion[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [settings, setSettings] = useState<DeploySettings>({
    isActive: initialSettings?.isActive ?? true,
    defaultQuestionPublic: initialSettings?.defaultQuestionPublic ?? true,
    likesVisibleToPeers: initialSettings?.likesVisibleToPeers ?? true,
    commentsVisibleToPeers: initialSettings?.commentsVisibleToPeers ?? false,
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
      setMsg("학생에게 배포했습니다");
      onDeployed?.();
    } catch {
      setMsg("배포에 실패했습니다");
    }
    setIsPublishing(false);
  }

  const toggles: [keyof DeploySettings, string, string][] = [
    ["isActive", "학생 활성화", "켜면 학생이 배포된 질문에 좋아요·댓글을 남길 수 있어요."],
    ["defaultQuestionPublic", "질문 공개", "켜면 학생이 작성한 질문을 서로 볼 수 있어요. 끄면 본인 질문만 보여요."],
    ["likesVisibleToPeers", "좋아요 공개", "켜면 학생이 서로의 좋아요를 누르고 좋아요 수를 볼 수 있어요."],
    ["commentsVisibleToPeers", "댓글 공개", "켜면 학생이 서로의 댓글을 볼 수 있어요. 끄면 본인·선생님 댓글만 보여요."],
  ];

  return (
    <div className="space-y-4">
      <QuestionSequenceEditor
        sessionId={sessionId}
        subject={subject}
        topic={topic}
        onChange={setResult}
      />
      {/* ③ 배포 설정 토글 */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <p className="text-sm font-semibold text-foreground">③ 배포 설정</p>
        {toggles.map(([key, label, desc]) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <Switch
              checked={settings[key]}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, [key]: v }))}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={publish} disabled={isPublishing || result.length === 0} className="gap-1.5 font-semibold">
          <Send className="h-4 w-4" /> {isPublishing ? "배포 중..." : "⑤ 학생에게 배포"}
        </Button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}

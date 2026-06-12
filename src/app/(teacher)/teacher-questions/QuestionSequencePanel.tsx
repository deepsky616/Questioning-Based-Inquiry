"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { QuestionSequenceEditor } from "@/components/teacher/QuestionSequenceEditor";
import type { SequencedQuestion } from "@/lib/unit-sequence";

export function QuestionSequencePanel({
  sessionId, subject, topic,
}: {
  sessionId: string;
  subject?: string;
  topic?: string;
}) {
  const [result, setResult] = useState<SequencedQuestion[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function publish() {
    if (result.length === 0) return;
    setIsPublishing(true);
    setMsg(null);
    try {
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
    } catch {
      setMsg("배포에 실패했습니다");
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
      />
      <div className="flex items-center gap-3">
        <Button onClick={publish} disabled={isPublishing || result.length === 0} className="font-bold">
          {isPublishing ? "배포 중..." : "⑤ 학생에게 배포"}
        </Button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}

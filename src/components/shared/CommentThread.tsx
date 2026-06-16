"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth-helpers";
import { formatDateTime } from "@/lib/datetime";

export interface ThreadComment {
  id: string;
  content: string;
  author: { name: string };
  createdAt: string;
}

/**
 * 인라인 댓글 스레드 — 목록 + 작성 폼 (교사/학생 공용).
 * 댓글수 클릭 시 펼쳐서 보고 바로 작성하는 통일된 UI.
 * - preloaded를 주면 그 댓글로 시작하고 추가 fetch를 하지 않는다(목록에 댓글이 이미 포함된 경우).
 * - preloaded가 없으면 마운트 시 댓글을 불러온다.
 * - 작성 시 onCountChange(현재 개수)로 부모의 댓글수 표시를 갱신한다.
 */
export function CommentThread({
  questionId,
  preloaded,
  onCountChange,
}: {
  questionId: string;
  preloaded?: ThreadComment[];
  onCountChange?: (count: number) => void;
}) {
  const { data: session } = useSession();
  const user = getSessionUser(session);
  const [comments, setComments] = useState<ThreadComment[]>(preloaded ?? []);
  const [isLoading, setIsLoading] = useState(!preloaded);
  const [text, setText] = useState("");
  const [isPosting, setIsPosting] = useState(false);

  useEffect(() => {
    if (preloaded) return;
    let active = true;
    fetch(`/api/questions/${questionId}/comments`)
      .then((r) => r.json())
      .then((d) => {
        if (active) setComments(Array.isArray(d) ? d : []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [questionId, preloaded]);

  const submit = async () => {
    if (!text.trim() || isPosting) return;
    setIsPosting(true);
    try {
      const res = await fetch(`/api/questions/${questionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text.trim() }),
      });
      if (!res.ok) throw new Error();
      const created: ThreadComment = await res.json();
      setComments((prev) => {
        const next = [...prev, created];
        onCountChange?.(next.length);
        return next;
      });
      setText("");
    } catch {
      // 무시
    } finally {
      setIsPosting(false);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">댓글 불러오는 중...</div>;
  }

  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 댓글이 없습니다</p>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="rounded-md border bg-white p-3 dark:bg-card">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{c.author.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(c.createdAt)}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{c.content}</p>
            </div>
          ))}
        </div>
      )}
      {user.id && (
        <div className="flex gap-2">
          <Input
            placeholder="댓글을 입력하세요..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={submit} disabled={isPosting || !text.trim()} className="h-8 shrink-0">
            {isPosting ? "..." : "등록"}
          </Button>
        </div>
      )}
    </div>
  );
}

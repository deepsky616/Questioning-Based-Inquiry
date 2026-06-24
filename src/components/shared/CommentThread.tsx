"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useContentTranslation } from "@/components/shared/use-content-translation";
import { TranslateToggle } from "@/components/shared/TranslateToggle";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth-helpers";
import { formatDateTime } from "@/lib/datetime";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";

export interface ThreadComment {
  id: string;
  content: string;
  author: { id?: string; name: string };
  createdAt: string;
  flagged?: boolean;
  flagReason?: string;
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
  canModerate = false,
}: {
  questionId: string;
  preloaded?: ThreadComment[];
  onCountChange?: (count: number) => void;
  canModerate?: boolean;
}) {
  const { data: session } = useSession();
  const user = getSessionUser(session);
  const t = useTranslations("comment");
  const tc = useTranslations("common");
  const ct = useContentTranslation();
  const queryClient = useQueryClient();
  const [comments, setComments] = useState<ThreadComment[]>(preloaded ?? []);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(!preloaded);
  const [text, setText] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

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

  const clearFlag = async (commentId: string) => {
    try {
      const res = await fetch(`/api/questions/${questionId}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagged: false }),
      });
      if (!res.ok) throw new Error();
      setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, flagged: false } : c)));
      // 알림 벨의 부적절 의심 카운트 즉시 갱신
      queryClient.invalidateQueries({ queryKey: ["flagged-count"] });
    } catch {
      // 무시
    }
  };

  const saveEdit = async (commentId: string) => {
    if (!editText.trim()) return;
    try {
      const res = await fetch(`/api/questions/${questionId}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editText.trim() }),
      });
      if (!res.ok) throw new Error();
      const updated: ThreadComment = await res.json();
      setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, content: updated.content } : c)));
      setEditingId(null);
      setEditText("");
    } catch {
      toast({ variant: "destructive", description: t("editFailed") });
    }
  };

  const confirm = useConfirm();

  const deleteComment = async (commentId: string) => {
    if (!(await confirm({ description: t("deleteConfirm"), confirmText: tc("delete"), destructive: true }))) return;
    try {
      const res = await fetch(`/api/questions/${questionId}/comments/${commentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setComments((prev) => {
        const next = prev.filter((c) => c.id !== commentId);
        onCountChange?.(next.length);
        return next;
      });
    } catch {
      toast({ variant: "destructive", description: t("deleteFailed") });
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t("loading")}</div>;
  }

  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => {
            const isMine = !!user.id && c.author.id === user.id;
            const isEditing = editingId === c.id;
            return (
            <div key={c.id} className={`rounded-md border p-3 dark:bg-card ${c.flagged ? "border-red-300 bg-red-50" : "bg-white"}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{c.author.name}</span>
                  {c.flagged && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                      ⚠️ {c.flagReason || t("flagSuspected")}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(c.createdAt)}
                </span>
              </div>
              {isEditing ? (
                <div className="mt-1.5 flex gap-2">
                  <Input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(c.id); }
                      if (e.key === "Escape") { setEditingId(null); setEditText(""); }
                    }}
                    className="h-8 text-sm"
                    autoFocus
                  />
                  <Button size="sm" onClick={() => saveEdit(c.id)} disabled={!editText.trim()} className="h-8 shrink-0">{tc("save")}</Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditText(""); }} className="h-8 shrink-0">{tc("cancel")}</Button>
                </div>
              ) : (
                <>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {ct.text({ type: "COMMENT", id: c.id }, c.content)}
                  </p>
                  {ct.canTranslate && (
                    <div className="mt-1">
                      <TranslateToggle item={{ type: "COMMENT", id: c.id }} ct={ct} />
                    </div>
                  )}
                </>
              )}
              {!isEditing && (isMine || canModerate) && (
                <div className="mt-1.5 flex items-center gap-3">
                  {isMine && (
                    <button type="button" onClick={() => { setEditingId(c.id); setEditText(c.content); }} className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800">
                      {t("edit")}
                    </button>
                  )}
                  {canModerate && c.flagged && (
                    <button type="button" onClick={() => clearFlag(c.id)} className="text-[11px] font-medium text-emerald-600 hover:text-emerald-800">
                      {t("clearFlag")}
                    </button>
                  )}
                  {(isMine || canModerate) && (
                    <button type="button" onClick={() => deleteComment(c.id)} className="text-[11px] font-medium text-red-500 hover:text-red-700">
                      {t("delete")}
                    </button>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
      {user.id && (
        <div className="flex gap-2">
          <Input
            placeholder={t("placeholder")}
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
            {isPosting ? "..." : t("post")}
          </Button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/EmptyState";

interface InquiryQuestion { type: string; content: string }
interface UnitDesign {
  id: string; title: string; subject: string;
  inquiryQuestions: InquiryQuestion[];
  essentialQuestions?: string[];
}
interface PublishedQuestion {
  id: string; content: string; type?: string | null;
  commentCount: number; createdAt: string;
}

interface Props {
  sessionId: string;
  sessionLabel: string;
  unitDesignId: string;
  onClose: () => void;
  onChanged?: () => void;
}

export default function PublishQuestionsDialog({ sessionId, sessionLabel, unitDesignId, onClose, onChanged }: Props) {
  const t = useTranslations("publishDialog");
  const tc = useTranslations("common");
  const [unit, setUnit] = useState<UnitDesign | null>(null);
  const [published, setPublished] = useState<PublishedQuestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 단원설계 + 현재 배포 상태 조회
  const reload = useCallback(() => {
    Promise.all([
      fetch(`/api/unit-design/${unitDesignId}`).then((r) => r.json()),
      fetch(`/api/sessions/${sessionId}/publish-questions`).then((r) => r.json()),
    ]).then(([u, p]) => {
      setUnit(u);
      setPublished(p.published ?? []);
    }).catch(() => {});
  }, [unitDesignId, sessionId]);

  useEffect(() => { reload(); }, [reload]);

  // 배포 상태 매핑 (content -> publishedQuestion)
  const publishedByContent = useMemo(() => {
    const map = new Map<string, PublishedQuestion>();
    published.forEach((p) => map.set(p.content.trim(), p));
    return map;
  }, [published]);

  // 단원설계에서 추출한 질문 + 본질질문 통합
  const allInquiry: InquiryQuestion[] = useMemo(() => {
    if (!unit) return [];
    const items: InquiryQuestion[] = [];
    (unit.essentialQuestions ?? []).forEach((q) =>
      items.push({ type: "본질질문", content: q })
    );
    (unit.inquiryQuestions ?? []).forEach((q) =>
      items.push({ type: q.type || "탐구질문", content: q.content })
    );
    return items.filter((q) => q.content?.trim());
  }, [unit]);

  function toggle(content: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(content)) next.delete(content); else next.add(content);
      return next;
    });
  }

  function selectAllNew() {
    const newContents = allInquiry
      .filter((q) => !publishedByContent.has(q.content.trim()))
      .map((q) => q.content);
    setSelected(new Set(newContents));
  }

  async function publish() {
    const items = allInquiry.filter((q) => selected.has(q.content));
    if (items.length === 0) return;
    setBusy(true); setMessage(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/publish-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: items.map((i) => ({ type: i.type, content: i.content })) }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(t("deployedCount", { created: data.created }) + (data.skipped > 0 ? t("skippedSuffix", { skipped: data.skipped }) : ""));
        setSelected(new Set());
        reload();
        onChanged?.();
      } else {
        setMessage(data.error || t("deployFailed"));
      }
    } catch {
      setMessage(t("networkError"));
    } finally { setBusy(false); }
  }

  const confirm = useConfirm();

  async function revoke(qId: string, commentCount: number) {
    if (commentCount > 0) {
      const ok = await confirm({ description: t("cancelConfirm", { count: commentCount }), confirmText: t("cancelDeploy"), destructive: true });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await fetch(`/api/sessions/${sessionId}/publish-questions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIds: [qId] }),
      });
      reload();
      onChanged?.();
    } catch {} finally { setBusy(false); }
  }

  const newCount = allInquiry.filter((q) => !publishedByContent.has(q.content.trim())).length;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{t("title")}</span>
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">{sessionLabel}</p>
        </DialogHeader>

        {!unit ? (
          <div className="py-12 text-center text-muted-foreground text-sm">{t("loading")}</div>
        ) : (
          <>
            <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-500/30 rounded-xl p-3 text-sm text-indigo-700 dark:text-indigo-300">
              📚 <strong>{unit.title}</strong>
              <span className="text-indigo-500 ml-2">{t("totalQuestions", { count: allInquiry.length })}</span>
              {newCount > 0 && (
                <span className="text-indigo-500 ml-2">{t("deployableCount", { count: newCount })}</span>
              )}
            </div>

            {message && (
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 rounded-xl px-3 py-2 text-sm">
                ✅ {message}
              </div>
            )}

            {/* 질문 목록 */}
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {allInquiry.length === 0 ? (
                <EmptyState icon="📭" title={t("emptyTitle")} />
              ) : allInquiry.map((q, idx) => {
                const key = q.content.trim();
                const pub = publishedByContent.get(key);
                const isPublished = !!pub;
                const isSelected = selected.has(q.content);
                return (
                  <div key={idx}
                    className="rounded-xl border-2 p-3 transition-all"
                    style={{
                      borderColor: isPublished ? "#10b981" : isSelected ? "#6366f1" : "#e5e7eb",
                      background: isPublished ? "#ecfdf5" : isSelected ? "#eef2ff" : "white",
                    }}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        disabled={isPublished}
                        checked={isPublished || isSelected}
                        onChange={() => toggle(q.content)}
                        className="mt-1 w-4 h-4 accent-indigo-500"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-muted-foreground">{q.type}</span>
                        <p className="text-foreground text-sm mt-0.5">{q.content}</p>
                        {isPublished && (
                          <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-xs text-emerald-600 font-bold">{t("deployed")}</span>
                            <span className="text-xs text-muted-foreground">
                              {t("answerCount", { count: pub.commentCount })}
                            </span>
                            <button
                              onClick={() => revoke(pub.id, pub.commentCount)}
                              disabled={busy}
                              className="text-xs text-red-500 hover:underline ml-auto">
                              {t("cancelDeploy")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 액션 */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <button
                onClick={selectAllNew}
                disabled={newCount === 0}
                className="text-xs text-indigo-600 hover:underline disabled:text-muted-foreground disabled:no-underline">
                {t("selectAllUndeployed", { count: newCount })}
              </button>
              <span className="text-xs text-muted-foreground">
                {t("selected", { count: selected.size })}
              </span>
            </div>
          </>
        )}

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>{tc("close")}</Button>
          <Button onClick={publish} disabled={selected.size === 0 || busy}>
            {busy ? t("processing") : t("deployBtn", { count: selected.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

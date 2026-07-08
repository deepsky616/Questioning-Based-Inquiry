"use client";

// AI 개별 맞춤 답변 미리보기 다이얼로그 (전송 전 교사 확인·수정 단계).
// 생성·전송 상태와 결과 메시지는 페이지 하단 액션 바와 공유하므로 페이지가 소유하고 props로 받는다.
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { BulkPreview } from "./types";

interface AiAnswerPreviewDialogProps {
  previews: BulkPreview[] | null;
  editedAnswers: Record<string, string>;
  onEditAnswer: (questionId: string, text: string) => void;
  excludedIds: Set<string>;
  onToggleExclude: (questionId: string) => void;
  regeneratingId: string | null;
  onRegenerate: (questionId: string) => void;
  isSending: boolean;
  /** 전송 실패 등 다이얼로그 안에 보여줄 오류 메시지 */
  errorText: string | null;
  onConfirm: () => void;
  /** X·바깥 클릭으로 닫기 (미리보기만 폐기) */
  onDismiss: () => void;
  /** 취소 버튼 (제외 목록·메시지까지 초기화) */
  onCancel: () => void;
}

export function AiAnswerPreviewDialog({
  previews,
  editedAnswers,
  onEditAnswer,
  excludedIds,
  onToggleExclude,
  regeneratingId,
  onRegenerate,
  isSending,
  errorText,
  onConfirm,
  onDismiss,
  onCancel,
}: AiAnswerPreviewDialogProps) {
  const t = useTranslations("teacherQ");
  const tc = useTranslations("common");

  const total = previews?.length ?? 0;
  const ready = previews?.filter((p) => (editedAnswers[p.questionId] ?? p.answer).trim().length > 0).length ?? 0;
  const overLimitCount = previews?.filter((p) => (editedAnswers[p.questionId] ?? p.answer).length > 150).length ?? 0;
  const sendCount = previews?.filter((p) => !excludedIds.has(p.questionId)).length ?? 0;

  return (
    <Dialog open={!!previews} onOpenChange={() => { if (!isSending) onDismiss(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("previewDialogTitle")}</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {t("previewDialogDesc")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              {t("previewReady", { ready, total })}
            </span>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {t("previewPending", { total })}
            </span>
            {overLimitCount > 0 && (
              <span className="rounded-full bg-amber-50 dark:bg-amber-950/40 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                {t("previewOverLimit", { count: overLimitCount })}
              </span>
            )}
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          {previews?.map((preview) => {
            const answerText = editedAnswers[preview.questionId] ?? preview.answer;
            const answerLength = answerText.length;
            const initial = preview.authorName.trim().slice(0, 1) || "?";
            const excluded = excludedIds.has(preview.questionId);
            const edited = answerText !== preview.answer;
            const regenerating = regeneratingId === preview.questionId;
            const overLimit = answerLength > 150;

            return (
              <div
                key={preview.questionId}
                className={`overflow-hidden rounded-xl border bg-muted/40 transition-opacity ${excluded ? "opacity-50" : ""}`}
              >
                <div className="border-b bg-card px-4 py-3">
                  <div className="mb-2 flex items-center gap-3">
                    {/* 전송 포함/제외 체크 */}
                    <input
                      type="checkbox"
                      checked={!excluded}
                      disabled={isSending}
                      aria-label={t("includeInSend")}
                      title={t("includeInSend")}
                      onChange={() => onToggleExclude(preview.questionId)}
                      className="h-4 w-4 shrink-0 accent-indigo-600"
                    />
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white shadow-sm">
                      {initial}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{preview.authorName}</p>
                      {preview.authorInfo && (
                        <p className="text-xs text-muted-foreground">{preview.authorInfo}</p>
                      )}
                    </div>
                    {excluded && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {t("excludedBadge")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-foreground">{preview.questionContent}</p>
                </div>
                <div className="px-4 py-3">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-indigo-600">{t("aiGeneratedAnswer")}</p>
                      {edited && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                          {t("editedBadge")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${overLimit ? "text-amber-700" : "text-muted-foreground"}`}>
                        {t("charCount", { n: answerLength })}
                      </span>
                      {/* 이 답변만 AI 재생성 */}
                      <button
                        type="button"
                        onClick={() => onRegenerate(preview.questionId)}
                        disabled={isSending || Boolean(regeneratingId) || excluded}
                        className="rounded-md border border-indigo-200 px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                      >
                        {regenerating ? t("regenerating") : `🔄 ${t("regenerateBtn")}`}
                      </button>
                    </div>
                  </div>
                  <Textarea
                    value={answerText}
                    onChange={(e) => onEditAnswer(preview.questionId, e.target.value)}
                    rows={3}
                    className={`resize-none text-sm ${overLimit ? "border-amber-400 focus-visible:ring-amber-400" : ""}`}
                    disabled={isSending || excluded || regenerating}
                  />
                  {overLimit && (
                    <p className="mt-1 text-xs text-amber-700">{t("overLimitWarn")}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {errorText && (
          <p className="text-sm text-red-600 mt-1">{errorText}</p>
        )}
        <DialogFooter className="gap-2 mt-4">
          <Button variant="outline" onClick={onCancel} disabled={isSending}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isSending || sendCount === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {isSending ? t("sending") : t("sendCount", { count: sendCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

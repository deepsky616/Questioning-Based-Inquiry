"use client";

// 질문 분류 수정 + 댓글(AI 생성 지원) 다이얼로그.
// 분류 선택·댓글·저장 진행 상태는 이 다이얼로그에서만 쓰이므로 내부에서 관리한다.
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useSessionMetaTranslation } from "@/components/shared/use-session-meta-translation";
import { normalizeCognitiveType } from "@/lib/question-labels";
import type { Question } from "./types";

interface QuestionEditDialogProps {
  question: Question | null;
  onClose: () => void;
  /** 저장 성공 후 목록 갱신 등 후처리 */
  onSaved: () => void;
}

export function QuestionEditDialog({ question, onClose, onSaved }: QuestionEditDialogProps) {
  const t = useTranslations("teacherQ");
  const tCls = useTranslations("classification");
  const tc = useTranslations("common");
  const sessionText = useSessionMetaTranslation(question?.session ? [question.session] : []);

  const [closure, setClosure] = useState("");
  const [cognitive, setCognitive] = useState("");
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // 질문이 바뀔 때(다이얼로그가 열릴 때) 현재 분류값으로 초기화
  useEffect(() => {
    if (!question) return;
    setClosure(question.closure);
    setCognitive(normalizeCognitiveType(question.cognitive));
    setComment("");
    setMsg(null);
  }, [question]);

  const handleGenerateAi = async () => {
    if (!question) return;
    setIsGeneratingAi(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/questions/${question.id}/ai-answer`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setComment(data.answer);
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : t("aiAnswerFailedGen") });
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSave = async () => {
    if (!question) return;
    setIsSaving(true);
    setMsg(null);
    try {
      const patchRes = await fetch(`/api/questions/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closure, cognitive }),
      });
      if (!patchRes.ok) throw new Error(t("classifyUpdateFailed"));

      if (comment.trim()) {
        const commentRes = await fetch(`/api/questions/${question.id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: comment.trim() }),
        });
        if (!commentRes.ok) throw new Error(t("commentSaveFailed"));
      }

      onClose();
      onSaved();
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : t("saveFailedMsg") });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={!!question} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("editDialogTitle")}</DialogTitle>
        </DialogHeader>
        {question && (
          <div className="space-y-4">
            <div className="p-4 bg-muted/40 rounded-lg">
              <p className="font-medium">{t("questionContentLabel")}</p>
              <p className="mt-1 text-foreground">{question.content}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("authorPrefix")}
                {[
                  question.author.grade && t("gradeLabel", { grade: question.author.grade }),
                  question.author.className && t("classLabel", { className: question.author.className }),
                  question.author.studentNumber && t("numberLabel", { studentNumber: question.author.studentNumber }),
                ]
                  .filter(Boolean)
                  .join(" ")}{" "}
                <span className="font-medium text-foreground">{question.author.name}</span>
              </p>
              {question.session && (
                <p className="text-xs text-indigo-600 mt-1">
                  {t("sessionPrefix")}{sessionText.label(question.session)}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{tCls("closure")}</Label>
                <Select value={closure} onValueChange={setClosure}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="closed">{t("closedOption")}</SelectItem>
                    <SelectItem value="open">{t("openOption")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("cognitiveLevel")}</Label>
                <Select value={cognitive} onValueChange={setCognitive}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="factual">{t("factualOption")}</SelectItem>
                    <SelectItem value="conceptual">{t("conceptualOption")}</SelectItem>
                    <SelectItem value="controversial">{t("controversialOption")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("commentOptional")}</Label>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isGeneratingAi}
                  onClick={handleGenerateAi}
                  className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 text-xs h-7"
                >
                  {isGeneratingAi ? t("aiGenerating") : t("aiGenerate")}
                </Button>
              </div>
              <Textarea
                placeholder={t("commentPlaceholder")}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}
        {msg && (
          <p className={`text-sm ${msg.type === "error" ? "text-red-600" : "text-green-700"}`}>
            {msg.text}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tc("cancel")}</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? t("saving") : tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

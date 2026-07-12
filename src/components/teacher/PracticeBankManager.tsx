"use client";

// 교사 커스텀 연습 문항 관리 — 문항은행 탭 상단의 "내 문항" 카드.
// 추가·수정·사용 토글·삭제, 그리고 내장 문항의 "복사해서 편집" 초안을 받는다.
// 저장 즉시 담당 학급 학생의 연습(/api/practice/bank 병합)에 반영된다.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import type { Closure, Cognitive, TransformTarget } from "@/lib/question-practice-data";

type PracticeMode = "quiz" | "transform" | "create";

/** 내장 문항 "복사해서 편집"이 넘겨주는 초안 */
export interface PracticeDraft {
  mode: PracticeMode;
  content?: string;
  closure?: Closure;
  cognitive?: Cognitive;
  explanation?: string;
  source?: string;
  target?: TransformTarget;
  hint?: string;
  example?: string;
  title?: string;
  passage?: string;
}

interface CustomItemRow {
  id: string;
  mode: string;
  isActive: boolean;
  attemptCount?: number;
  correctCount?: number;
  attemptStudents?: number;
  content: string | null;
  closure: string | null;
  cognitive: string | null;
  explanation: string | null;
  source: string | null;
  target: string | null;
  hint: string | null;
  example: string | null;
  title: string | null;
  passage: string | null;
}

interface FormState {
  mode: PracticeMode;
  content: string;
  closure: Closure;
  cognitive: Cognitive;
  explanation: string;
  source: string;
  target: TransformTarget;
  hint: string;
  example: string;
  title: string;
  passage: string;
}

const EMPTY_FORM: FormState = {
  mode: "quiz",
  content: "",
  closure: "closed",
  cognitive: "factual",
  explanation: "",
  source: "",
  target: "open",
  hint: "",
  example: "",
  title: "",
  passage: "",
};

const SELECT_CLASS =
  "h-10 rounded-md border border-input bg-background px-3 text-sm";

export function PracticeBankManager({ prefill }: { prefill: { key: number; draft: PracticeDraft } | null }) {
  const t = useTranslations("practice");
  const tCls = useTranslations("classification");
  const { toast } = useToast();

  const { data, refetch } = useQuery<{ items: CustomItemRow[] }>({
    queryKey: ["teacher-practice-bank"],
    queryFn: async () => {
      const r = await fetch("/api/teacher/practice-bank");
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });
  const items = data?.items ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // AI 교차 검토 — 교사가 지정한 유형이 곧 정답이 되므로, 저장 전 AI 판정과
  // 비교해 실수를 잡는다. 차단하지 않고 경고만 한다(최종 결정은 교사).
  const [aiReview, setAiReview] = useState<{ closure: Closure; cognitive: Cognitive } | null>(null);
  const [aiChecking, setAiChecking] = useState(false);
  const [aiError, setAiError] = useState(false);

  // 내장 문항 "복사해서 편집" → 초안을 폼에 싣고 열어 화면을 폼으로 데려간다
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!prefill) return;
    setForm({ ...EMPTY_FORM, ...prefill.draft });
    setEditingId(null);
    setAiReview(null);
    setAiError(false);
    setFormOpen(true);
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [prefill]);

  const update = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    // 질문·유형이 바뀌면 이전 검토 결과는 무효
    if ("content" in patch || "closure" in patch || "cognitive" in patch) {
      setAiReview(null);
      setAiError(false);
    }
  };

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setAiReview(null);
    setAiError(false);
    setFormOpen(true);
  };

  const startEdit = (item: CustomItemRow) => {
    setForm({
      ...EMPTY_FORM,
      mode: item.mode as PracticeMode,
      content: item.content ?? "",
      closure: (item.closure as Closure) ?? "closed",
      cognitive: (item.cognitive as Cognitive) ?? "factual",
      explanation: item.explanation ?? "",
      source: item.source ?? "",
      target: (item.target as TransformTarget) ?? "open",
      hint: item.hint ?? "",
      example: item.example ?? "",
      title: item.title ?? "",
      passage: item.passage ?? "",
    });
    setEditingId(item.id);
    setAiReview(null);
    setAiError(false);
    setFormOpen(true);
  };

  const isComplete =
    form.mode === "quiz"
      ? form.content.trim().length >= 5 && form.explanation.trim().length >= 5
      : form.mode === "transform"
        ? form.source.trim().length >= 5 && form.hint.trim().length >= 5 && form.example.trim().length >= 5
        : form.title.trim().length >= 1 && form.passage.trim().length >= 30;

  const buildPayload = () => {
    if (form.mode === "quiz") {
      return { mode: "quiz", content: form.content, closure: form.closure, cognitive: form.cognitive, explanation: form.explanation };
    }
    if (form.mode === "transform") {
      return { mode: "transform", source: form.source, target: form.target, hint: form.hint, example: form.example };
    }
    return { mode: "create", title: form.title, passage: form.passage };
  };

  const save = async () => {
    if (!isComplete || saving) return;
    setSaving(true);
    try {
      const res = await fetch(editingId ? `/api/teacher/practice-bank/${editingId}` : "/api/teacher/practice-bank", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || t("saveFailed"));
      }
      toast({ variant: "success", description: t("savedToast") });
      setFormOpen(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
      refetch();
    } catch (err) {
      toast({ variant: "destructive", description: err instanceof Error ? err.message : t("saveFailed") });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: CustomItemRow) => {
    await fetch(`/api/teacher/practice-bank/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    refetch();
  };

  const remove = async (item: CustomItemRow) => {
    if (!window.confirm(t("deleteConfirm"))) return;
    const res = await fetch(`/api/teacher/practice-bank/${item.id}`, { method: "DELETE" });
    if (res.ok) toast({ variant: "success", description: t("deletedToast") });
    refetch();
  };

  const runAiReview = async () => {
    if (aiChecking || form.content.trim().length < 5) return;
    setAiChecking(true);
    setAiError(false);
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: form.content.trim() }),
      });
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setAiReview({ closure: data.closure, cognitive: data.cognitive });
    } catch {
      setAiError(true);
    } finally {
      setAiChecking(false);
    }
  };

  const aiMatches = aiReview && aiReview.closure === form.closure && aiReview.cognitive === form.cognitive;

  const modeLabel = (mode: string) => t(`tab_${mode as PracticeMode}`);
  const itemSummary = (item: CustomItemRow) =>
    item.mode === "quiz" ? item.content : item.mode === "transform" ? item.source : item.title;
  const itemMeta = (item: CustomItemRow) => {
    if (item.mode === "quiz") return `${tCls(`${item.closure}.label`)} · ${tCls(`${item.cognitive}.label`)}`;
    if (item.mode === "transform") return t("transformTarget", { type: tCls(`${item.target}.label`) });
    return item.passage ?? "";
  };

  const labeled = (label: string, node: React.ReactNode) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {node}
    </label>
  );

  return (
    <Card ref={cardRef}>
      <CardContent className="pt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">{t("myBankTitle", { count: items.length })}</h3>
          {!formOpen && (
            <Button variant="outline" size="sm" onClick={openNew}>{t("addItemBtn")}</Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{t("myBankIntro")}</p>

        {formOpen && (
          <div className="rounded-lg border p-4 space-y-3">
            {labeled(
              t("fieldMode"),
              <select
                className={SELECT_CLASS}
                value={form.mode}
                disabled={editingId != null}
                onChange={(e) => update({ mode: e.target.value as PracticeMode })}
              >
                {(["quiz", "transform", "create"] as const).map((m) => (
                  <option key={m} value={m}>{modeLabel(m)}</option>
                ))}
              </select>,
            )}

            {form.mode === "quiz" && (
              <>
                {labeled(t("fieldContent"), (
                  <Input value={form.content} maxLength={200} onChange={(e) => update({ content: e.target.value })} />
                ))}
                <div className="grid gap-3 sm:grid-cols-2">
                  {labeled(t("fieldClosure"), (
                    <select className={SELECT_CLASS} value={form.closure} onChange={(e) => update({ closure: e.target.value as Closure })}>
                      {(["closed", "open"] as const).map((v) => <option key={v} value={v}>{tCls(`${v}.label`)}</option>)}
                    </select>
                  ))}
                  {labeled(t("fieldCognitive"), (
                    <select className={SELECT_CLASS} value={form.cognitive} onChange={(e) => update({ cognitive: e.target.value as Cognitive })}>
                      {(["factual", "conceptual", "controversial"] as const).map((v) => <option key={v} value={v}>{tCls(`${v}.label`)}</option>)}
                    </select>
                  ))}
                </div>
                {labeled(t("fieldExplanation"), (
                  <Textarea value={form.explanation} maxLength={300} rows={2} onChange={(e) => update({ explanation: e.target.value })} />
                ))}
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" size="sm" onClick={runAiReview} disabled={aiChecking || form.content.trim().length < 5}>
                    {aiChecking ? t("aiReviewChecking") : t("aiReviewBtn")}
                  </Button>
                  {aiReview && aiMatches && (
                    <span className="text-sm text-green-700 dark:text-green-300">✅ {t("aiReviewMatch")}</span>
                  )}
                  {aiReview && !aiMatches && (
                    <span className="text-sm text-amber-700 dark:text-amber-300">
                      ⚠️ {t("aiReviewMismatch", { closure: tCls(`${aiReview.closure}.label`), cognitive: tCls(`${aiReview.cognitive}.label`) })}
                    </span>
                  )}
                  {aiError && <span className="text-sm text-red-600">{t("aiReviewFailed")}</span>}
                </div>
              </>
            )}

            {form.mode === "transform" && (
              <>
                {labeled(t("fieldSource"), (
                  <Input value={form.source} maxLength={200} onChange={(e) => update({ source: e.target.value })} />
                ))}
                {labeled(t("fieldTarget"), (
                  <select className={SELECT_CLASS} value={form.target} onChange={(e) => update({ target: e.target.value as TransformTarget })}>
                    {(["open", "conceptual", "controversial"] as const).map((v) => <option key={v} value={v}>{tCls(`${v}.label`)}</option>)}
                  </select>
                ))}
                {labeled(t("fieldHint"), (
                  <Input value={form.hint} maxLength={200} onChange={(e) => update({ hint: e.target.value })} />
                ))}
                {labeled(t("fieldExample"), (
                  <Input value={form.example} maxLength={200} onChange={(e) => update({ example: e.target.value })} />
                ))}
              </>
            )}

            {form.mode === "create" && (
              <>
                {labeled(t("fieldTitle"), (
                  <Input value={form.title} maxLength={40} onChange={(e) => update({ title: e.target.value })} />
                ))}
                {labeled(t("fieldPassage"), (
                  <>
                    <Textarea value={form.passage} maxLength={400} rows={3} onChange={(e) => update({ passage: e.target.value })} />
                    <span className="text-xs text-muted-foreground">{form.passage.trim().length}/400</span>
                  </>
                ))}
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setFormOpen(false); setEditingId(null); }}>
                {t("cancelBtn")}
              </Button>
              <Button variant="gradient" size="sm" onClick={save} disabled={!isComplete || saving}>
                {saving ? t("savingBtn") : t("saveBtn")}
              </Button>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t("myBankEmpty")}</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3 text-sm ${item.isActive ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="font-medium">
                    <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{modeLabel(item.mode)}</span>
                    {itemSummary(item)}
                    {!item.isActive && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                        {t("inactiveBadge")}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {itemMeta(item)}
                    {(item.attemptCount ?? 0) > 0 && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        {t("attemptStat", {
                          students: item.attemptStudents ?? 0,
                          count: item.attemptCount ?? 0,
                          rate: Math.round(((item.correctCount ?? 0) / (item.attemptCount ?? 1)) * 100),
                        })}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => startEdit(item)}>{t("editBtn")}</Button>
                  <Button variant="outline" size="sm" onClick={() => toggleActive(item)}>
                    {item.isActive ? t("deactivateBtn") : t("activateBtn")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => remove(item)}>{t("deleteBtn")}</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

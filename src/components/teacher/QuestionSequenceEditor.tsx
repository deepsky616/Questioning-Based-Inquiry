"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, ChevronUp, GripVertical, Layers, ListOrdered, Pencil, Plus, RotateCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  UNIT_FLOW_OPTIONS,
  type SequencedQuestion,
} from "@/lib/unit-sequence";

export interface QuestionSequenceEditorProps {
  sessionId: string;
  subject?: string;
  topic?: string;
  onChange: (result: SequencedQuestion[]) => void;
  // 편집 모드: 기존 배포 질문을 그대로 불러와 시작(묶기 없이 수정·삭제·추가·정렬·재배포)
  initialQuestions?: SequencedQuestion[];
  editMode?: boolean;
}

function reorder<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

export function QuestionSequenceEditor({ sessionId, subject, topic, onChange, initialQuestions, editMode }: QuestionSequenceEditorProps) {
  const t = useTranslations("seqEditor");
  const [flowId, setFlowId] = useState<string>(UNIT_FLOW_OPTIONS[0].id);
  const [sequenced, setSequenced] = useState<SequencedQuestion[]>(initialQuestions ?? []);
  const [additionalQuestions, setAdditionalQuestions] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [teacherInput, setTeacherInput] = useState("");
  const [generatedBy, setGeneratedBy] = useState<"ai" | "rules" | "">("");
  const [error, setError] = useState<string | null>(null);
  // ① 묶기를 한 번이라도 실행해야 ② 흐름 정렬을 켤 수 있다(순차 진행). 편집 모드는 이미 질문이 있으므로 켜둔다.
  const [merged, setMerged] = useState(Boolean(editMode));
  // 인라인 내용 편집 상태
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const update = useCallback((next: SequencedQuestion[]) => {
    setSequenced(next);
    onChange(next);
  }, [onChange]);

  // 편집 모드: 마운트 시 기존 질문을 부모(result)에 즉시 반영해 재배포 버튼을 활성화
  useEffect(() => {
    if (editMode && initialQuestions && initialQuestions.length > 0) {
      onChange(initialQuestions);
    }
    // 최초 1회만 (initialQuestions/onChange 변화로 재실행되지 않도록)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveEdit(id: string) {
    const content = editValue.trim();
    if (content) {
      update(sequenced.map((q) => (q.id === id ? { ...q, content } : q)));
    }
    setEditingId(null);
    setEditValue("");
  }

  // sequence API는 sessionId로 학생 질문을 직접 조회하고, 교사 추가 질문은 additionalQuestions로 받는다.
  async function runSequence(
    additional: string[] = additionalQuestions,
    mode: "merge" | "sort" = "sort",
    current?: SequencedQuestion[],
  ) {
    setIsRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/unit-design/sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId, flowId, additionalQuestions: additional, subject, topic, mode,
          currentQuestions: current?.map((q) => ({ content: q.content, type: q.type, source: q.source })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("sortFailed"));
      update(data.sequencedQuestions ?? []);
      setGeneratedBy(data.generatedBy ?? "rules");
      if (mode === "merge") setMerged(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("sortFailed"));
    }
    setIsRunning(false);
  }

  // ③ 교사 질문 추가 — 입력한 문장을 그대로 목록 맨 뒤에 추가(AI 재정리 없음).
  // AI 묶기·정렬은 아래 버튼으로만 실행한다(추가 시 자동으로 다른 질문이 생성되던 문제 수정).
  function handleAddTeacher() {
    const content = teacherInput.trim();
    if (!content) return;
    setTeacherInput("");
    const newQuestion: SequencedQuestion = {
      id: `added-${Date.now()}`,
      type: "student",
      content,
      source: "teacher",
      contentGroup: t("addedGroup"),
      priority: sequenced.length + 1,
      lessonPhase: "탐구",
      rationale: t("addedRationale"),
    };
    update([...sequenced, newQuestion]);
    // 생성 모드: 나중에 '묶기/정렬'을 누르면 AI 재정리에 포함되도록 추가 질문 목록에도 보관
    if (!editMode) setAdditionalQuestions((prev) => [...prev, content]);
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) { setDragIndex(null); return; }
    update(reorder(sequenced, dragIndex, targetIndex).map((q, i) => ({ ...q, priority: i + 1 })));
    setDragIndex(null);
  }

  function removeAt(index: number) {
    update(sequenced.filter((_, i) => i !== index).map((q, i) => ({ ...q, priority: i + 1 })));
  }

  // 위/아래 이동(터치·키보드 등 모든 기기 지원). dir: -1 위, +1 아래
  function moveAt(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= sequenced.length) return;
    update(reorder(sequenced, index, to).map((q, i) => ({ ...q, priority: i + 1 })));
  }

  return (
    <div className="space-y-4">
      {/* ① 묶기 + ② 흐름 정렬 (편집 모드에서는 묶기 없이 흐름 정렬만) */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
        {!editMode && (
          <>
            <Button onClick={() => runSequence(additionalQuestions, "merge")} disabled={isRunning} className="gap-1.5 font-semibold">
              <Layers className="h-4 w-4" /> {t("groupBtn")}
            </Button>
            <span className="text-muted-foreground text-xs">→</span>
          </>
        )}
        <Select value={flowId} onValueChange={setFlowId}>
          <SelectTrigger className="h-9 w-56 bg-background"><SelectValue placeholder={t("flowPlaceholder")} /></SelectTrigger>
          <SelectContent>
            {UNIT_FLOW_OPTIONS.map((flow) => (
              <SelectItem key={flow.id} value={flow.id}>
                <span className="font-medium">{flow.title}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">{flow.axis}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => runSequence(additionalQuestions, "sort", sequenced)} disabled={isRunning || !merged} className="gap-1.5 font-semibold">
          <ListOrdered className="h-4 w-4" /> {t("sortBtn")}
        </Button>
        {isRunning && <RotateCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        {generatedBy && !isRunning && (
          <span className="text-xs text-muted-foreground">{generatedBy === "ai" ? t("aiSuggested") : t("ruleSuggested")}</span>
        )}
      </div>

      {/* 선택한 탐구 흐름 설명 (용어 이해 도움) */}
      {(() => {
        const f = UNIT_FLOW_OPTIONS.find((x) => x.id === flowId);
        if (!f) return null;
        return (
          <div className="rounded-md border bg-muted/40 p-2.5 text-xs">
            <span className="font-semibold text-foreground">📘 {f.title}</span>
            <span className="text-muted-foreground"> · {f.axis}</span>
            <p className="mt-1 leading-relaxed text-muted-foreground">{f.description}</p>
          </div>
        );
      })()}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* ③ 교사 질문 추가 */}
      <div className="flex gap-2">
        <Input
          value={teacherInput}
          onChange={(e) => setTeacherInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTeacher(); } }}
          placeholder={t("addPlaceholder")}
        />
        <Button onClick={handleAddTeacher} disabled={!teacherInput.trim() || isRunning} variant="outline" className="gap-1 shrink-0">
          <Plus className="h-4 w-4" /> {t("addBtn")}
        </Button>
      </div>
      {additionalQuestions.length > 0 && (
        <p className="text-xs text-muted-foreground">{t("addedCount", { count: additionalQuestions.length })}</p>
      )}

      {/* ④ 드래그로 순서 정렬 */}
      <div className="space-y-2">
        {sequenced.map((q, index) => {
          const isEditing = editingId === q.id;
          return (
          <div
            key={q.id}
            draggable={!isEditing}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
            className="flex items-center gap-3 rounded-lg border bg-card p-3"
          >
            <div className="flex shrink-0 items-center">
              <GripVertical className="hidden h-4 w-4 cursor-grab text-muted-foreground sm:block" />
              <div className="flex sm:flex-col">
                <button
                  type="button"
                  onClick={() => moveAt(index, -1)}
                  disabled={index === 0 || isEditing}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  title={t("moveUp")}
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveAt(index, 1)}
                  disabled={index === sequenced.length - 1 || isEditing}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  title={t("moveDown")}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            </div>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs text-background">{index + 1}</span>
            {isEditing ? (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); saveEdit(q.id); }
                    if (e.key === "Escape") { setEditingId(null); setEditValue(""); }
                  }}
                  className="h-8"
                />
                <button onClick={() => saveEdit(q.id)} className="shrink-0 text-emerald-600 hover:text-emerald-700" title={t("saveTitle")}><Check className="h-4 w-4" /></button>
                <button onClick={() => { setEditingId(null); setEditValue(""); }} className="shrink-0 text-muted-foreground hover:text-foreground" title={t("cancelTitle")}><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{q.content}</p>
                  <p className="text-xs text-muted-foreground">{q.contentGroup}{q.source === "teacher" ? t("teacherAdded") : ""}</p>
                </div>
                <button onClick={() => { setEditingId(q.id); setEditValue(q.content); }} className="shrink-0 text-muted-foreground hover:text-indigo-600" title={t("editTitle")}><Pencil className="h-4 w-4" /></button>
                <button onClick={() => removeAt(index)} className="shrink-0 text-muted-foreground hover:text-red-500" title={t("deleteTitle")}><Trash2 className="h-4 w-4" /></button>
              </>
            )}
          </div>
          );
        })}
        {sequenced.length === 0 && (
          <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            <Plus className="mx-auto mb-1 h-4 w-4" />
            {editMode
              ? t("emptyHasQuestions")
              : t("emptyNoQuestions")}
          </p>
        )}
      </div>
    </div>
  );
}

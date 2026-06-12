"use client";

import { useState, useCallback } from "react";
import { GripVertical, Layers, ListOrdered, Plus, RotateCw, Trash2 } from "lucide-react";
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
}

function reorder<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

export function QuestionSequenceEditor({ sessionId, subject, topic, onChange }: QuestionSequenceEditorProps) {
  const [flowId, setFlowId] = useState<string>(UNIT_FLOW_OPTIONS[0].id);
  const [sequenced, setSequenced] = useState<SequencedQuestion[]>([]);
  const [additionalQuestions, setAdditionalQuestions] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [teacherInput, setTeacherInput] = useState("");
  const [generatedBy, setGeneratedBy] = useState<"ai" | "rules" | "">("");
  const [error, setError] = useState<string | null>(null);

  const update = useCallback((next: SequencedQuestion[]) => {
    setSequenced(next);
    onChange(next);
  }, [onChange]);

  // sequence API는 sessionId로 학생 질문을 직접 조회하고, 교사 추가 질문은 additionalQuestions로 받는다.
  async function runSequence(additional: string[] = additionalQuestions) {
    setIsRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/unit-design/sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, flowId, additionalQuestions: additional, subject, topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "정리에 실패했습니다");
      update(data.sequencedQuestions ?? []);
      setGeneratedBy(data.generatedBy ?? "rules");
    } catch (e) {
      setError(e instanceof Error ? e.message : "정리에 실패했습니다");
    }
    setIsRunning(false);
  }

  // ③ 교사 질문 추가 → additionalQuestions에 넣고 즉시 재정리(학생+교사 질문 함께 묶음)
  function handleAddTeacher() {
    const content = teacherInput.trim();
    if (!content) return;
    const next = [...additionalQuestions, content];
    setAdditionalQuestions(next);
    setTeacherInput("");
    runSequence(next);
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) { setDragIndex(null); return; }
    update(reorder(sequenced, dragIndex, targetIndex).map((q, i) => ({ ...q, priority: i + 1 })));
    setDragIndex(null);
  }

  function removeAt(index: number) {
    update(sequenced.filter((_, i) => i !== index).map((q, i) => ({ ...q, priority: i + 1 })));
  }

  return (
    <div className="space-y-4">
      {/* ① 묶기 + ② 흐름 정렬 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
        <Button onClick={() => runSequence()} disabled={isRunning} className="gap-1.5">
          <Layers className="h-4 w-4" /> ① 비슷한 질문 묶기
        </Button>
        <span className="text-muted-foreground text-xs">→</span>
        <Select value={flowId} onValueChange={setFlowId}>
          <SelectTrigger className="h-9 w-56 bg-background"><SelectValue placeholder="탐구 흐름 기준" /></SelectTrigger>
          <SelectContent>
            {UNIT_FLOW_OPTIONS.map((flow) => (
              <SelectItem key={flow.id} value={flow.id}>
                <span className="font-medium">{flow.title}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">{flow.axis}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => runSequence()} disabled={isRunning} variant="outline" className="gap-1.5">
          <ListOrdered className="h-4 w-4" /> ② 흐름 기준 정렬
        </Button>
        {isRunning && <RotateCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        {generatedBy && !isRunning && (
          <span className="text-xs text-muted-foreground">{generatedBy === "ai" ? "AI 제안" : "기본 규칙 제안"}</span>
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
          placeholder="교사 추가 질문을 입력하고 ‘추가’를 누르세요"
        />
        <Button onClick={handleAddTeacher} disabled={!teacherInput.trim() || isRunning} variant="outline" className="gap-1 shrink-0">
          <Plus className="h-4 w-4" /> ③ 추가
        </Button>
      </div>
      {additionalQuestions.length > 0 && (
        <p className="text-xs text-muted-foreground">교사 추가 질문 {additionalQuestions.length}개 포함됨</p>
      )}

      {/* ④ 드래그로 순서 정렬 */}
      <div className="space-y-2">
        {sequenced.map((q, index) => (
          <div
            key={q.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
            className="flex items-center gap-3 rounded-lg border bg-card p-3"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs text-background">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{q.content}</p>
              <p className="text-xs text-muted-foreground">{q.contentGroup}{q.source === "teacher" ? " · 교사 추가" : ""}</p>
            </div>
            <button onClick={() => removeAt(index)} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {sequenced.length === 0 && (
          <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            <Plus className="mx-auto mb-1 h-4 w-4" />
            ‘① 비슷한 질문 묶기’를 눌러 이 세션의 학생 질문을 묶어보세요
          </p>
        )}
      </div>
    </div>
  );
}

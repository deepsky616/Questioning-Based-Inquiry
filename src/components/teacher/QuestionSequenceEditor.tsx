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
  type SequenceInputQuestion,
  type SequencedQuestion,
} from "@/lib/unit-sequence";

export interface QuestionSequenceEditorProps {
  initialQuestions: SequenceInputQuestion[];
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

export function QuestionSequenceEditor({ initialQuestions, subject, topic, onChange }: QuestionSequenceEditorProps) {
  const [flowId, setFlowId] = useState<string>(UNIT_FLOW_OPTIONS[0].id);
  const [sequenced, setSequenced] = useState<SequencedQuestion[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [teacherInput, setTeacherInput] = useState("");
  const [generatedBy, setGeneratedBy] = useState<"ai" | "rules" | "">("");

  const update = useCallback((next: SequencedQuestion[]) => {
    setSequenced(next);
    onChange(next);
  }, [onChange]);

  // 현재 시퀀스를 sequence API 입력 형태로 변환(교사 추가 질문 포함)
  const currentAsInput = (): SequenceInputQuestion[] =>
    sequenced.map((q) => ({ id: q.id, content: q.content, cognitive: q.type, source: q.source }));

  async function runSequence(questions: SequenceInputQuestion[]) {
    if (questions.length === 0) return;
    setIsRunning(true);
    try {
      const res = await fetch("/api/unit-design/sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId, subject, topic, questions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "sequence failed");
      update(data.sequencedQuestions ?? []);
      setGeneratedBy(data.generatedBy ?? "rules");
    } catch {
      setGeneratedBy("");
    }
    setIsRunning(false);
  }

  // ① 비슷한 질문 묶기 (학생 질문 + 이미 추가한 교사 질문)
  const handleGroup = () => runSequence(sequenced.length > 0 ? currentAsInput() : initialQuestions);
  // ② 선택한 탐구 흐름 기준으로 재정렬
  const handleSort = () => runSequence(sequenced.length > 0 ? currentAsInput() : initialQuestions);

  // ③ 교사 질문 추가 → 시퀀스 맨 뒤에 즉시 추가(배포 시 세션에 반영됨)
  function handleAddTeacher() {
    const content = teacherInput.trim();
    if (!content) return;
    update([
      ...sequenced,
      {
        id: `teacher-${Date.now()}`,
        type: "conceptual",
        content,
        source: "teacher",
        contentGroup: "교사 추가 질문",
        priority: sequenced.length + 1,
        lessonPhase: "교사 추가",
        rationale: "교사가 직접 추가한 질문",
      },
    ]);
    setTeacherInput("");
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
        <Button onClick={handleGroup} disabled={isRunning} className="gap-1.5">
          <Layers className="h-4 w-4" /> ① 비슷한 질문 묶기
        </Button>
        <span className="text-muted-foreground text-xs">→</span>
        <Select value={flowId} onValueChange={setFlowId}>
          <SelectTrigger className="h-9 w-56 bg-background"><SelectValue placeholder="탐구 흐름 기준" /></SelectTrigger>
          <SelectContent>
            {UNIT_FLOW_OPTIONS.map((flow) => (
              <SelectItem key={flow.id} value={flow.id}>{flow.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleSort} disabled={isRunning || sequenced.length === 0} variant="outline" className="gap-1.5">
          <ListOrdered className="h-4 w-4" /> ② 흐름 기준 정렬
        </Button>
        {isRunning && <RotateCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        {generatedBy && !isRunning && (
          <span className="text-xs text-muted-foreground">{generatedBy === "ai" ? "AI 제안" : "기본 규칙 제안"}</span>
        )}
      </div>

      {/* ③ 교사 질문 추가 */}
      <div className="flex gap-2">
        <Input
          value={teacherInput}
          onChange={(e) => setTeacherInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTeacher(); } }}
          placeholder="교사 추가 질문을 입력하고 ‘추가’를 누르세요"
        />
        <Button onClick={handleAddTeacher} disabled={!teacherInput.trim()} variant="outline" className="gap-1 shrink-0">
          <Plus className="h-4 w-4" /> ③ 추가
        </Button>
      </div>

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
            ‘① 비슷한 질문 묶기’를 눌러 시작하거나, ‘③ 추가’로 교사 질문을 넣어보세요
          </p>
        )}
      </div>
    </div>
  );
}

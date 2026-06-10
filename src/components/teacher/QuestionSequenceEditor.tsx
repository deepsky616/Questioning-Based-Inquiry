"use client";

import { useState, useCallback } from "react";
import { GripVertical, Plus, RotateCw, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  UNIT_FLOW_GROUPS,
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
  const [flowId, setFlowId] = useState(UNIT_FLOW_OPTIONS[0].id);
  const [sequenced, setSequenced] = useState<SequencedQuestion[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [teacherInput, setTeacherInput] = useState("");
  const [generatedBy, setGeneratedBy] = useState<"ai" | "rules" | "">("");

  const update = useCallback((next: SequencedQuestion[]) => {
    setSequenced(next);
    onChange(next);
  }, [onChange]);

  async function runSequence() {
    setIsRunning(true);
    try {
      const teacherExtra: SequenceInputQuestion[] = teacherInput
        .split("\n").map((s) => s.trim()).filter(Boolean)
        .map((content) => ({ content, source: "teacher" as const }));
      const res = await fetch("/api/unit-design/sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId, subject, topic, questions: [...initialQuestions, ...teacherExtra] }),
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
      {/* 흐름 선택 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">탐구 흐름 기준</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {UNIT_FLOW_GROUPS.map((group) => (
              <div key={group.group}>
                <p className="text-xs font-semibold text-gray-500 mb-1">{group.group}</p>
                <div className="flex flex-wrap gap-2">
                  {group.flows.map((flow) => (
                    <button
                      key={flow.id}
                      type="button"
                      onClick={() => setFlowId(flow.id)}
                      className={`rounded-full border px-3 py-1 text-xs ${flowId === flow.id ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "bg-white text-gray-600"}`}
                    >
                      {flow.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 교사 추가 질문 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">교사 추가 질문 (줄바꿈으로 구분)</CardTitle></CardHeader>
        <CardContent>
          <Input
            value={teacherInput}
            onChange={(e) => setTeacherInput(e.target.value)}
            placeholder="예) 광합성이 멈추면 생태계는 어떻게 될까?"
          />
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button onClick={runSequence} disabled={isRunning} className="gap-2">
          {isRunning ? <RotateCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          AI로 정리
        </Button>
        {generatedBy && (
          <span className="text-xs text-gray-500">{generatedBy === "ai" ? "AI 제안" : "기본 규칙 제안"}</span>
        )}
      </div>

      {/* 드래그 가능한 시퀀스 */}
      <div className="space-y-2">
        {sequenced.map((q, index) => (
          <div
            key={q.id}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
            className="flex items-center gap-3 rounded-lg border bg-white p-3"
          >
            <GripVertical className="h-4 w-4 text-gray-300" />
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-xs text-white">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{q.content}</p>
              <p className="text-xs text-gray-400">{q.contentGroup}{q.source === "teacher" ? " · 교사 추가" : ""}</p>
            </div>
            <button onClick={() => removeAt(index)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {sequenced.length === 0 && (
          <p className="rounded-lg border border-dashed py-8 text-center text-sm text-gray-400">
            <Plus className="mx-auto mb-1 h-4 w-4" />흐름을 고르고 &quot;AI로 정리&quot;를 눌러보세요
          </p>
        )}
      </div>
    </div>
  );
}

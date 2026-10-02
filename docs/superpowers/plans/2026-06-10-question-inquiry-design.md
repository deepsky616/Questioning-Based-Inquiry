# 질문 중심 탐구설계 (단원설계 교사 페이지 대체) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사 단원설계 페이지를 제거하고, 학생 질문을 묶기·유형화·순서 정하기·교사 추가·드래그 재정렬해 배포하는 기능을 질문 조회 페이지로 이전한다.

**Architecture:** 기존 `QuestionSession.sharedQuestions`(JSON)를 확장 저장(마이그레이션 없음). `unit-sequence.ts` 시퀀싱 로직과 `/api/unit-design/sequence`를 재사용하고, 단원설계 페이지의 시퀀싱·드래그 UI를 공용 컴포넌트 `<QuestionSequenceEditor>`로 이전한다. 학생 표시는 기존 `student-unit-design`을 재활용(필터 완화).

**Tech Stack:** Next.js 14 App Router, TypeScript, React, Prisma, zod, vitest.

참고 스펙: `docs/superpowers/specs/2026-06-10-question-inquiry-design-design.md`

---

## File Structure

- Create: `src/lib/shared-questions.ts` — sharedQuestions 정규화/그룹핑 순수 함수
- Create: `src/__tests__/shared-questions.test.ts` — 위 단위 테스트
- Create: `src/components/teacher/QuestionSequenceEditor.tsx` — 시퀀싱·드래그·교사추가 공용 UI
- Create: `src/app/(teacher)/teacher-questions/QuestionSequencePanel.tsx` — 질문 조회용 래퍼(로드·배포)
- Modify: `src/app/api/sessions/[id]/publish-questions/route.ts` — 시퀀스 저장 분기 추가
- Create: `src/__tests__/publish-sequence.test.ts` — 배포 라우트 시퀀스 분기 테스트
- Modify: `src/app/(student)/student-unit-design/page.tsx` — 필터 완화 + 용어 + 공용 함수 사용
- Modify: `src/app/(teacher)/teacher-questions/page.tsx` — 패널 통합
- Modify: `src/app/(teacher)/layout.tsx` — "단원설계" 메뉴 항목 삭제
- Delete: `src/app/(teacher)/teacher-unit-design/page.tsx`

---

## Task 1: sharedQuestions 정규화/그룹핑 순수 함수

**Files:**
- Create: `src/lib/shared-questions.ts`
- Test: `src/__tests__/shared-questions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/shared-questions.test.ts
import { describe, it, expect } from "vitest";
import { normalizeSharedQuestions, groupSharedQuestions } from "@/lib/shared-questions";

describe("normalizeSharedQuestions", () => {
  it("누락된 contentGroup/priority/source를 기본값으로 채운다", () => {
    const result = normalizeSharedQuestions([
      { type: "factual", content: "A" },
      { type: "conceptual", content: "B" },
    ]);
    expect(result[0]).toEqual({ type: "factual", content: "A", contentGroup: "수업 순서", priority: 1, source: "student" });
    expect(result[1].priority).toBe(2);
  });

  it("주어진 값은 보존한다", () => {
    const result = normalizeSharedQuestions([
      { type: "student", content: "C", contentGroup: "광합성", priority: 5, source: "teacher" },
    ]);
    expect(result[0]).toEqual({ type: "student", content: "C", contentGroup: "광합성", priority: 5, source: "teacher" });
  });
});

describe("groupSharedQuestions", () => {
  it("contentGroup별로 묶고 그룹 내 priority 순, 그룹은 최소 priority 순으로 정렬한다", () => {
    const groups = groupSharedQuestions([
      { type: "factual", content: "에너지1", contentGroup: "에너지", priority: 3 },
      { type: "factual", content: "광합성2", contentGroup: "광합성", priority: 2 },
      { type: "factual", content: "광합성1", contentGroup: "광합성", priority: 1 },
    ]);
    expect(groups.map((g) => g.group)).toEqual(["광합성", "에너지"]);
    expect(groups[0].questions.map((q) => q.content)).toEqual(["광합성1", "광합성2"]);
  });

  it("그룹 정보가 없으면 단일 '수업 순서' 그룹으로 폴백한다", () => {
    const groups = groupSharedQuestions([{ type: "student", content: "X" }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBe("수업 순서");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared-questions`
Expected: FAIL — "Cannot find module '@/lib/shared-questions'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/shared-questions.ts
export interface SharedQuestionItem {
  type?: string;
  content: string;
  contentGroup?: string;
  priority?: number;
  source?: "student" | "teacher";
}

export interface NormalizedSharedQuestion {
  type: string;
  content: string;
  contentGroup: string;
  priority: number;
  source: "student" | "teacher";
}

export const DEFAULT_GROUP = "수업 순서";

export function normalizeSharedQuestions(raw: SharedQuestionItem[]): NormalizedSharedQuestion[] {
  return raw.map((item, index) => ({
    type: item.type || "student",
    content: item.content,
    contentGroup: item.contentGroup?.trim() || DEFAULT_GROUP,
    priority: typeof item.priority === "number" ? item.priority : index + 1,
    source: item.source === "teacher" ? "teacher" : "student",
  }));
}

export function groupSharedQuestions(
  items: SharedQuestionItem[],
): { group: string; questions: NormalizedSharedQuestion[] }[] {
  const normalized = normalizeSharedQuestions(items);
  const map = new Map<string, NormalizedSharedQuestion[]>();
  for (const q of normalized) {
    map.set(q.contentGroup, [...(map.get(q.contentGroup) ?? []), q]);
  }
  const groups = Array.from(map.entries()).map(([group, questions]) => ({
    group,
    questions: [...questions].sort((a, b) => a.priority - b.priority),
  }));
  groups.sort(
    (a, b) =>
      Math.min(...a.questions.map((q) => q.priority)) -
      Math.min(...b.questions.map((q) => q.priority)),
  );
  return groups;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run shared-questions`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared-questions.ts src/__tests__/shared-questions.test.ts
git commit -m "feat: add shared-questions normalize/group pure helpers"
```

---

## Task 2: publish-questions 라우트에 시퀀스 저장 분기 추가

**Files:**
- Modify: `src/app/api/sessions/[id]/publish-questions/route.ts` (POST 함수)
- Test: `src/__tests__/publish-sequence.test.ts`

배경: 현재 POST는 `{ questions: [{type, content}] }`를 받아 TEACHER_SHARED Question을 멱등 생성하고 `sharedQuestions`에 `{type, content}`만 저장한다(route.ts:38-103). 새 형태 `{ sequence: SharedQuestionItem[] }`를 받으면, 정규화한 시퀀스를 `sharedQuestions`에 그대로 저장하고, `source === "teacher"` 항목만 TEACHER_SHARED Question으로 멱등 생성한다. `sequence`가 없으면 기존 동작 유지.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/publish-sequence.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: { findUnique: vi.fn(), update: vi.fn() },
    question: { findMany: vi.fn(), create: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/sessions/[id]/publish-questions/route";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockSessFind = prisma.questionSession.findUnique as ReturnType<typeof vi.fn>;
const mockSessUpdate = prisma.questionSession.update as ReturnType<typeof vi.fn>;
const mockQFind = prisma.question.findMany as ReturnType<typeof vi.fn>;
const mockQCreate = prisma.question.create as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("http://localhost/api/sessions/s1/publish-questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: { id: "s1" } };

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
  mockSessFind.mockResolvedValue({ id: "s1", teacherId: "t1", sharedQuestions: [] });
  mockQFind.mockResolvedValue([]);
  mockQCreate.mockImplementation(({ data }: { data: { content: string; inquiryType: string | null } }) =>
    Promise.resolve({ id: "q-new", content: data.content, inquiryType: data.inquiryType }),
  );
  mockSessUpdate.mockResolvedValue({});
});

describe("POST publish-questions (sequence 분기)", () => {
  it("sequence를 받으면 sharedQuestions에 그룹/순서를 저장한다", async () => {
    const res = await POST(
      req({
        sequence: [
          { type: "factual", content: "학생질문1", contentGroup: "광합성", priority: 1, source: "student" },
          { type: "conceptual", content: "교사질문1", contentGroup: "광합성", priority: 2, source: "teacher" },
        ],
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    // sharedQuestions 저장 호출 확인
    const updateArg = mockSessUpdate.mock.calls[0][0];
    const saved = updateArg.data.sharedQuestions;
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ content: "학생질문1", contentGroup: "광합성", priority: 1 });
    // teacher source만 Question 생성
    expect(mockQCreate).toHaveBeenCalledTimes(1);
    expect(mockQCreate.mock.calls[0][0].data.content).toBe("교사질문1");
  });

  it("권한 없는 세션이면 403", async () => {
    mockSessFind.mockResolvedValue({ id: "s1", teacherId: "other", sharedQuestions: [] });
    const res = await POST(req({ sequence: [{ type: "factual", content: "A" }] }), ctx);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run publish-sequence`
Expected: FAIL — sequence 분기가 없어 sharedQuestions가 빈 배열로 저장되거나 단언 불일치.

- [ ] **Step 3: Add the sequence branch to POST**

`route.ts` 상단 import에 추가:

```typescript
import { normalizeSharedQuestions, type SharedQuestionItem } from "@/lib/shared-questions";
```

POST 함수에서, 권한 검증(`if (qs.teacherId !== teacherId)` 블록, 약 route.ts:58-60) **직후**에 다음 분기를 삽입한다:

```typescript
  // 신규: 질문 중심 탐구설계 시퀀스 배포 (그룹/순서 포함)
  if (Array.isArray(body.sequence)) {
    const seq = normalizeSharedQuestions(body.sequence as SharedQuestionItem[]);

    // 교사 추가 질문만 TEACHER_SHARED Question으로 멱등 생성
    const existingShared = await prisma.question.findMany({
      where: { sessionId, source: "TEACHER_SHARED" },
      select: { content: true },
    });
    const existingSet = new Set(existingShared.map((q) => q.content.trim()));
    const teacherNew = seq.filter((q) => q.source === "teacher" && !existingSet.has(q.content.trim()));
    await Promise.all(
      teacherNew.map((q) =>
        prisma.question.create({
          data: {
            content: q.content.trim(),
            closure: "open",
            cognitive: "conceptual",
            source: "TEACHER_SHARED",
            inquiryType: q.type,
            isPublic: true,
            authorId: teacherId,
            sessionId,
          },
        }),
      ),
    );

    // sharedQuestions에 전체 시퀀스(그룹/순서) 저장
    await prisma.questionSession.update({
      where: { id: sessionId },
      data: { sharedQuestions: seq as unknown as Prisma.InputJsonValue },
    });

    return NextResponse.json({ ok: true, count: seq.length });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run publish-sequence`
Expected: PASS (2 tests)

- [ ] **Step 5: Run full suite (no regression on existing publish tests)**

Run: `npx vitest run`
Expected: 모든 테스트 PASS (기존 `questions`/`questionIds` 분기는 영향 없음)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/sessions/[id]/publish-questions/route.ts src/__tests__/publish-sequence.test.ts
git commit -m "feat: publish-questions accepts sequence with group/priority"
```

---

## Task 3: QuestionSequenceEditor 공용 컴포넌트

**Files:**
- Create: `src/components/teacher/QuestionSequenceEditor.tsx`
- Reference (이전 원본): `src/app/(teacher)/teacher-unit-design/page.tsx`

이 컴포넌트는 `teacher-unit-design` 페이지의 시퀀싱·드래그·교사추가 UI를 이전한 것이다. 페이지에서 다음 블록을 가져온다:
- 상태: `sequencedQuestions`(103), `dragIndex`(110), `flowId`(118 부근)
- 흐름 선택 UI: `UNIT_FLOW_GROUPS.map`(601 부근)
- 교사 추가 질문 입력 UI(637 부근)
- "AI로 정리" 호출(`/api/unit-design/sequence`, 247 부근)
- 드래그 가능한 질문 카드 렌더(725-751)와 `handleDrop`/`reorder`(440-447)

저장·세션 로딩·배포는 **포함하지 않는다**(부모 책임). 정리 결과만 `onChange`로 올린다.

- [ ] **Step 1: Define the component skeleton with props**

```typescript
// src/components/teacher/QuestionSequenceEditor.tsx
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

  // AI 정리 호출
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

      <Button onClick={runSequence} disabled={isRunning} className="gap-2">
        {isRunning ? <RotateCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        AI로 정리
      </Button>
      {generatedBy && (
        <span className="ml-2 text-xs text-gray-500">{generatedBy === "ai" ? "AI 제안" : "기본 규칙 제안"}</span>
      )}

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
            <Plus className="mx-auto mb-1 h-4 w-4" />흐름을 고르고 "AI로 정리"를 눌러보세요
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: `QuestionSequenceEditor.tsx`에 에러 없음. (`SequenceInputQuestion`, `SequencedQuestion`는 `unit-sequence.ts`에 이미 export됨)

- [ ] **Step 3: Commit**

```bash
git add src/components/teacher/QuestionSequenceEditor.tsx
git commit -m "feat: add reusable QuestionSequenceEditor component"
```

---

## Task 4: 질문 조회 페이지에 정리·배포 패널 통합

**Files:**
- Create: `src/app/(teacher)/teacher-questions/QuestionSequencePanel.tsx`
- Modify: `src/app/(teacher)/teacher-questions/page.tsx`

`QuestionSequencePanel`은 선택된 세션의 학생 질문을 `<QuestionSequenceEditor>`에 넣고, 결과를 `/api/sessions/[id]/publish-questions`로 배포한다.

- [ ] **Step 1: Create the panel**

```typescript
// src/app/(teacher)/teacher-questions/QuestionSequencePanel.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { QuestionSequenceEditor } from "@/components/teacher/QuestionSequenceEditor";
import type { SequenceInputQuestion, SequencedQuestion } from "@/lib/unit-sequence";

export function QuestionSequencePanel({
  sessionId, subject, topic, questions,
}: {
  sessionId: string;
  subject?: string;
  topic?: string;
  questions: SequenceInputQuestion[];
}) {
  const [result, setResult] = useState<SequencedQuestion[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function publish() {
    if (result.length === 0) return;
    setIsPublishing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/publish-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sequence: result.map((q) => ({
            type: q.type, content: q.content,
            contentGroup: q.contentGroup, priority: q.priority, source: q.source,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      setMsg("학생에게 배포했습니다");
    } catch {
      setMsg("배포에 실패했습니다");
    }
    setIsPublishing(false);
  }

  return (
    <div className="space-y-4">
      <QuestionSequenceEditor
        initialQuestions={questions}
        subject={subject}
        topic={topic}
        onChange={setResult}
      />
      <div className="flex items-center gap-3">
        <Button onClick={publish} disabled={isPublishing || result.length === 0} className="font-bold">
          {isPublishing ? "배포 중..." : "학생에게 배포"}
        </Button>
        {msg && <span className="text-sm text-gray-500">{msg}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount the panel in the questions page**

`src/app/(teacher)/teacher-questions/page.tsx`에서:
1. 상단 import 추가:
```typescript
import { QuestionSequencePanel } from "./QuestionSequencePanel";
```
2. 세션이 선택된(`selectedSessionId`) 영역에, 토글 상태와 패널을 추가한다. 컴포넌트 본문 상태 선언부 근처에:
```typescript
const [showSequence, setShowSequence] = useState(false);
```
3. 질문 목록 렌더 위쪽(세션 선택 UI 다음)에 진입 버튼과 패널을 삽입한다:
```tsx
{selectedSessionId && selectedSessionId !== "" && (
  <div className="rounded-xl border bg-white p-4">
    <button
      type="button"
      onClick={() => setShowSequence((v) => !v)}
      className="text-sm font-bold text-indigo-600"
    >
      {showSequence ? "▾ 질문 중심 탐구설계 닫기" : "▸ 질문 중심 탐구설계 (묶기·순서·배포)"}
    </button>
    {showSequence && (
      <div className="mt-3">
        <QuestionSequencePanel
          sessionId={selectedSessionId}
          subject={filterSubject || undefined}
          topic={filterTopic || undefined}
          questions={questions.map((q) => ({
            id: q.id, content: q.content, cognitive: q.cognitive, source: "student" as const,
          }))}
        />
      </div>
    )}
  </div>
)}
```

> 정확한 삽입 위치: `questions.map(...)`로 질문 목록을 그리는 JSX 컨테이너 바로 앞. `questions`, `selectedSessionId`, `filterSubject`, `filterTopic`는 이미 페이지 상태에 존재한다(스펙 조사 기준 page.tsx:139-148, 100).

- [ ] **Step 3: Verify types compile and tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 에러 없음, 전체 PASS

- [ ] **Step 4: Commit**

```bash
git add "src/app/(teacher)/teacher-questions/QuestionSequencePanel.tsx" "src/app/(teacher)/teacher-questions/page.tsx"
git commit -m "feat: add 질문 중심 탐구설계 panel to teacher-questions"
```

---

## Task 5: 학생 화면 필터 완화 + 용어 변경 + 공용 함수 사용

**Files:**
- Modify: `src/app/(student)/student-unit-design/page.tsx`
- Modify: `src/app/(student)/layout.tsx` (메뉴 라벨)

- [ ] **Step 1: 필터 완화 — unitDesignId 의무 제거**

`student-unit-design/page.tsx`의 필터(현재 page.tsx:51):
```typescript
.filter((session) => session.unitDesignId && (session.sharedQuestions?.length ?? 0) > 0);
```
를 다음으로 교체:
```typescript
.filter((session) => (session.sharedQuestions?.length ?? 0) > 0);
```

- [ ] **Step 2: 그룹핑을 공용 함수로 교체**

상단 import 추가:
```typescript
import { groupSharedQuestions } from "@/lib/shared-questions";
```
`grouped` useMemo(현재 page.tsx:60-69)를 다음으로 교체:
```typescript
const grouped = useMemo(
  () => groupSharedQuestions(selectedSession?.sharedQuestions ?? []).map(
    (g) => [g.group, g.questions] as [string, typeof g.questions],
  ),
  [selectedSession],
);
```

- [ ] **Step 3: 용어 변경 — "단원설계" → "질문 중심 탐구설계"**

`page.tsx`의 사용자 노출 텍스트를 교체:
- `<h2>단원설계</h2>` → `<h2>질문 중심 탐구설계</h2>` (page.tsx:74)
- `선생님이 배포한 단원별 질문 수업 순서를 확인하세요` → `선생님이 정리해 배포한 질문 순서를 확인하세요` (page.tsx:75)
- `배포된 단원설계가 없습니다` → `배포된 탐구설계가 없습니다` (page.tsx:83)
- `선생님이 단원설계를 배포하면 여기에 표시됩니다` → `선생님이 탐구설계를 배포하면 여기에 표시됩니다` (page.tsx:84)

`src/app/(student)/layout.tsx`의 메뉴 라벨:
```typescript
{ href: "/student-unit-design", label: "단원설계" },
```
→
```typescript
{ href: "/student-unit-design", label: "탐구설계" },
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 에러 없음, 전체 PASS

- [ ] **Step 5: Commit**

```bash
git add "src/app/(student)/student-unit-design/page.tsx" "src/app/(student)/layout.tsx"
git commit -m "feat: student 탐구설계 shows all shared sessions, reuse group helper"
```

---

## Task 6: 교사 단원설계 페이지·메뉴 삭제 + 회귀 확인

**Files:**
- Delete: `src/app/(teacher)/teacher-unit-design/page.tsx`
- Modify: `src/app/(teacher)/layout.tsx`

- [ ] **Step 1: 교사 메뉴 항목 삭제**

`src/app/(teacher)/layout.tsx`의 `TEACHER_PAGES`에서 다음 줄을 삭제(layout.tsx:16):
```typescript
  { href: "/teacher-unit-design", label: "단원설계" },
```

- [ ] **Step 2: 페이지 삭제 + 잔존 참조 확인**

```bash
git rm "src/app/(teacher)/teacher-unit-design/page.tsx"
grep -rn "teacher-unit-design" src/ || echo "잔존 참조 없음"
```
Expected: "잔존 참조 없음" (다른 곳에서 이 경로를 링크하지 않음)

- [ ] **Step 3: 단원설계 페이지 전용 테스트 정리**

```bash
grep -rln "teacher-unit-design\|from \"@/app/(teacher)/teacher-unit-design" src/__tests__ || echo "관련 테스트 없음"
```
- 결과가 있으면 해당 테스트에서 페이지 컴포넌트 import 부분만 제거하고, 시퀀싱 로직 검증은 `unit-sequence` 단위 테스트로 충분함을 확인한다. (참고: `unit-design.test.ts`는 `/api/unit-design/*` 라우트 테스트이지 페이지 테스트가 아니므로 영향 없음.)

- [ ] **Step 4: 전체 검증**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 에러 없음, 전체 PASS

- [ ] **Step 5: 빌드 확인 (라우트 삭제·import 정합성)**

Run: `npx next build`
Expected: 빌드 성공, `/teacher-unit-design` 라우트 사라짐

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove teacher 단원설계 page, replaced by 질문 중심 탐구설계"
```

---

## Self-Review Notes (작성자 확인 완료)

- **Spec coverage**: 데이터 확장(Task 1·2), 공용 컴포넌트(Task 3), 교사 통합(Task 4), 학생 표시·필터완화·용어(Task 5), 교사 페이지·메뉴 삭제(Task 6) — 스펙 전 섹션 매핑됨. `generate`/UnitDesign 모델·API는 비목표라 미변경.
- **Placeholder scan**: 모든 코드 step에 실제 코드 포함. "있으면 정리"(Task 6 Step 3)는 조건부 작업 지시로 명시.
- **Type consistency**: `SharedQuestionItem`/`NormalizedSharedQuestion`(Task 1) ↔ publish 분기(Task 2) ↔ Editor의 `SequencedQuestion`(Task 3·4) ↔ student 그룹핑(Task 5) 일관. `SequenceInputQuestion`/`SequencedQuestion`는 기존 `unit-sequence.ts` export 사용.

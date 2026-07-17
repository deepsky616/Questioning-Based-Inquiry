# 탐구 질문 배포 자료 확인 화면 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 탐구 질문 만들기의 다섯째 단계를 질문 편집과 학생 배포 자료 확인으로 분리하고, 완전성이 검증된 학생용 설명과 핵심 낱말을 원문 바로 아래에 생성한다.

**Architecture:** 다섯째 단계 구성 요소에 편집과 확인의 두 화면 상태를 두고, 질문 편집 목록과 배포 자료 확인 화면을 분리된 구성 요소로 만든다. 학생용 설명 결과는 서버에서 구조적 완전성을 검사하고 한 번 자동 보완하며, 클라이언트는 생성 원문 서명으로 설명의 최신 상태를 판별한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, next-intl, Tailwind CSS, Vitest, Testing Library, Playwright, Gemini 생성 계층

## Global Constraints

- 기존 다섯 단계 진행 표시를 여섯 단계로 변경하지 않는다.
- 질문 편집 상태에는 사실적, 개념적, 논쟁적 질문 편집 기능만 표시한다.
- 원래 단원 자료는 읽기 전용이며 학생용 설명만 수정할 수 있다.
- 핵심 아이디어 핵심 낱말은 뜻이 있는 3개에서 5개여야 한다.
- 각 탐구 질문 핵심 낱말은 뜻이 있는 2개에서 5개여야 한다.
- 불완전한 생성 결과는 한 번 자동 보완하고 끝까지 불완전하면 부분 적용하지 않는다.
- 학생용 설명 생성은 선택 사항으로 유지한다.
- 밝은 테마와 어두운 테마를 모두 지원한다.
- 인공지능 모델 선택 정책과 저장된 과거 자료는 변경하지 않는다.
- `/Users/youngmini/Questioning-Based-Inquiry`의 기존 `next-env.d.ts` 변경은 사용자 변경이므로 건드리지 않는다.

---

### Task 1: 학생용 설명 묶음 완전성 검사

**Files:**
- Create: `src/lib/student-guide-completeness.ts`
- Create: `src/__tests__/student-guide-completeness.test.ts`

**Interfaces:**
- Consumes: `normalizeStudentLearningGuides(value)`, `normalizeStudentInquiryGuide(value)`
- Produces: `validateStudentGuideBundle(value, expected): StudentGuideValidationResult`
- Produces: `buildStudentGuideRepairPrompt(originalPrompt, rawResponse, issues): string`

- [ ] **Step 1: 완전한 결과와 불완전한 결과를 구분하는 실패 검사를 작성한다**

```ts
import { describe, expect, it } from "vitest";
import { validateStudentGuideBundle } from "@/lib/student-guide-completeness";

const expected = { coreSentenceCount: 2, essentialQuestionCount: 1, inquiryQuestionCount: 2 };
const complete = {
  learningGuides: {
    coreIdea: {
      explanation: "큰 뜻을 쉽게 풀어요.",
      lifeConnection: "학교 화단을 떠올려요.",
      keywords: [
        { term: "생태계", meaning: "생물과 환경이 관계를 맺는 체계" },
        { term: "광합성", meaning: "식물이 빛으로 양분을 만드는 과정" },
        { term: "먹이 사슬", meaning: "먹고 먹히는 관계의 연결" },
      ],
    },
    coreSentences: [
      { index: 0, explanation: "첫 문장을 쉽게 풀어요." },
      { index: 1, explanation: "둘째 문장을 쉽게 풀어요." },
    ],
    essentialQuestions: [
      { index: 0, thinkingFocus: "관계와 변화를 살펴봐요.", perspectives: ["관계", "변화"] },
    ],
  },
  guides: [0, 1].map((index) => ({
    index,
    meaning: `${index + 1}번 질문이 묻는 뜻`,
    keywords: [
      { term: `${index + 1}번 낱말 하나`, meaning: "첫째 쉬운 뜻" },
      { term: `${index + 1}번 낱말 둘`, meaning: "둘째 쉬운 뜻" },
    ],
    thinkingStart: "처음 살펴볼 단서예요.",
  })),
};

describe("학생용 설명 묶음 완전성", () => {
  it("모든 필수 설명과 핵심 낱말이 있으면 정규화된 결과를 반환한다", () => {
    const result = validateStudentGuideBundle(complete, expected);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.guides).toHaveLength(2);
  });

  it.each([
    ["핵심 아이디어 낱말 부족", { ...complete, learningGuides: { ...complete.learningGuides, coreIdea: { ...complete.learningGuides.coreIdea, keywords: complete.learningGuides.coreIdea.keywords.slice(0, 2) } } }],
    ["빈 낱말 뜻", { ...complete, learningGuides: { ...complete.learningGuides, coreIdea: { ...complete.learningGuides.coreIdea, keywords: complete.learningGuides.coreIdea.keywords.map((item, index) => index === 0 ? { ...item, meaning: "" } : item) } } }],
    ["중복 낱말", { ...complete, learningGuides: { ...complete.learningGuides, coreIdea: { ...complete.learningGuides.coreIdea, keywords: complete.learningGuides.coreIdea.keywords.map((item, index) => index === 1 ? { ...item, term: "생태계" } : item) } } }],
    ["문장 설명 누락", { ...complete, learningGuides: { ...complete.learningGuides, coreSentences: complete.learningGuides.coreSentences.slice(0, 1) } }],
    ["탐구 질문 낱말 부족", { ...complete, guides: complete.guides.map((guide, index) => index === 0 ? { ...guide, keywords: guide.keywords.slice(0, 1) } : guide }],
  ])("%s을 거부한다", (_name, value) => {
    const result = validateStudentGuideBundle(value, expected);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 검사가 새 모듈을 찾지 못해 실패하는지 확인한다**

Run: `npx vitest run src/__tests__/student-guide-completeness.test.ts`

Expected: FAIL with `Failed to resolve import "@/lib/student-guide-completeness"`

- [ ] **Step 3: 완전성 검사와 보완 요청 생성기를 구현한다**

```ts
import {
  normalizeStudentLearningGuides,
  type StudentCoreIdeaGuide,
  type StudentLearningGuides,
} from "@/lib/student-learning-guide";
import {
  normalizeStudentInquiryGuide,
  type GeneratedStudentInquiryGuide,
} from "@/lib/student-inquiry-guide";

export interface StudentGuideExpectedCounts {
  coreSentenceCount: number;
  essentialQuestionCount: number;
  inquiryQuestionCount: number;
}

export type CompleteStudentLearningGuides = StudentLearningGuides & { coreIdea: StudentCoreIdeaGuide };
export type CompleteStudentGuideBundle = {
  learningGuides: CompleteStudentLearningGuides;
  guides: GeneratedStudentInquiryGuide[];
};
export type StudentGuideValidationResult =
  | { ok: true; value: CompleteStudentGuideBundle }
  | { ok: false; issues: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasUniqueTermsWithMeanings = (
  keywords: Array<{ term: string; meaning: string }>,
  minimum: number,
  maximum: number,
) => {
  const terms = keywords.map((item) => item.term.trim().toLocaleLowerCase());
  return keywords.length >= minimum
    && keywords.length <= maximum
    && keywords.every((item) => item.term.trim() && item.meaning.trim())
    && new Set(terms).size === terms.length;
};

const hasExactIndexes = (items: Array<{ index: number }>, count: number) =>
  items.length === count
  && items.map((item) => item.index).sort((a, b) => a - b).every((index, position) => index === position);

export function validateStudentGuideBundle(
  value: unknown,
  expected: StudentGuideExpectedCounts,
): StudentGuideValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) return { ok: false, issues: ["응답이 객체가 아닙니다."] };

  const learningGuides = normalizeStudentLearningGuides(value.learningGuides);
  const coreIdea = learningGuides?.coreIdea;
  if (!coreIdea?.explanation || !coreIdea.lifeConnection) issues.push("핵심 아이디어 설명이 빠졌습니다.");
  if (!coreIdea || !hasUniqueTermsWithMeanings(coreIdea.keywords, 3, 5)) {
    issues.push("핵심 아이디어 핵심 낱말은 서로 다른 3~5개이며 뜻이 있어야 합니다.");
  }
  if (!learningGuides || !hasExactIndexes(learningGuides.coreSentences, expected.coreSentenceCount)) {
    issues.push("모든 핵심 문장의 쉬운 설명과 번호가 필요합니다.");
  }
  if (!learningGuides || learningGuides.coreSentences.some((item) => !item.explanation.trim())) {
    issues.push("핵심 문장 쉬운 설명이 비어 있습니다.");
  }
  if (!learningGuides || !hasExactIndexes(learningGuides.essentialQuestions, expected.essentialQuestionCount)) {
    issues.push("모든 핵심 질문의 설명과 번호가 필요합니다.");
  }
  if (!learningGuides || learningGuides.essentialQuestions.some((item) =>
    !item.thinkingFocus.trim() || item.perspectives.length < 2 || item.perspectives.length > 3
  )) issues.push("핵심 질문마다 생각할 범위와 관점 2~3개가 필요합니다.");

  const guides = Array.isArray(value.guides)
    ? value.guides.flatMap((candidate) => {
        if (!isRecord(candidate) || !Number.isInteger(candidate.index)) return [];
        const guide = normalizeStudentInquiryGuide(candidate);
        return guide ? [{ index: candidate.index as number, ...guide }] : [];
      })
    : [];
  if (!hasExactIndexes(guides, expected.inquiryQuestionCount)) {
    issues.push("모든 탐구 질문의 학생용 설명과 번호가 필요합니다.");
  }
  if (guides.some((guide) =>
    !guide.meaning.trim()
    || !guide.thinkingStart.trim()
    || !hasUniqueTermsWithMeanings(guide.keywords, 2, 5)
  )) issues.push("탐구 질문마다 뜻, 생각 단서, 서로 다른 핵심 낱말 2~5개가 필요합니다.");

  if (issues.length > 0 || !learningGuides || !coreIdea) return { ok: false, issues };
  return { ok: true, value: { learningGuides: { ...learningGuides, coreIdea }, guides } };
}

export function buildStudentGuideRepairPrompt(
  originalPrompt: string,
  rawResponse: string,
  issues: string[],
): string {
  return `${originalPrompt}\n\n이전 응답은 아래 검사를 통과하지 못했습니다.\n${issues.map((issue) => `- ${issue}`).join("\n")}\n\n이전 응답:\n${rawResponse.slice(0, 12000)}\n\n모든 항목을 빠짐없이 고쳐 완전한 JSON 객체만 다시 출력하세요.`;
}
```

- [ ] **Step 4: 완전성 검사가 통과하는지 확인한다**

Run: `npx vitest run src/__tests__/student-guide-completeness.test.ts`

Expected: PASS

- [ ] **Step 5: 첫 번째 구현을 커밋한다**

```bash
git add src/lib/student-guide-completeness.ts src/__tests__/student-guide-completeness.test.ts
git commit -m "feat: 학생용 설명 완전성 검사 추가"
```

### Task 2: 생성 문구 강화와 서버 자동 보완

**Files:**
- Modify: `src/lib/unit-design-prompt.ts:189-254`
- Modify: `src/app/api/unit-design/generate/route.ts:25-71`
- Modify: `src/__tests__/unit-design.test.ts`

**Interfaces:**
- Consumes: `validateStudentGuideBundle`, `buildStudentGuideRepairPrompt`
- Produces: `learning_guides` 요청에서 완전한 `CompleteStudentGuideBundle` 또는 오류 응답

- [ ] **Step 1: 첫 응답이 불완전하면 자동 보완하고, 둘째 응답도 불완전하면 거부하는 실패 검사를 작성한다**

```ts
const COMPLETE_GENERATED_GUIDES = {
  learningGuides: {
    coreIdea: {
      explanation: "핵심 아이디어를 쉽게 풀어요.",
      lifeConnection: "학교 화단을 떠올려요.",
      keywords: [
        { term: "생태계", meaning: "생물과 환경이 관계를 맺는 체계" },
        { term: "광합성", meaning: "식물이 빛으로 양분을 만드는 과정" },
        { term: "먹이 사슬", meaning: "먹고 먹히는 관계의 연결" },
      ],
    },
    coreSentences: [{ index: 0, explanation: "핵심 문장을 쉽게 풀어요." }],
    essentialQuestions: [{
      index: 0,
      thinkingFocus: "관계와 변화를 살펴봐요.",
      perspectives: ["관계", "변화"],
    }],
  },
  guides: [{
    index: 0,
    meaning: "질문이 묻는 뜻을 쉽게 풀어요.",
    keywords: [
      { term: "생산자", meaning: "스스로 양분을 만드는 생물" },
      { term: "에너지", meaning: "생물이 살아가는 데 필요한 힘" },
    ],
    thinkingStart: "식물이 양분을 만드는 과정을 살펴봐요.",
  }],
};

it("학생용 설명 첫 응답이 불완전하면 한 번 보완해 완전한 결과만 반환한다", async () => {
  mockAuth.mockResolvedValue(TEACHER_SESSION);
  mockGenerateContent
    .mockResolvedValueOnce({ text: JSON.stringify({
      learningGuides: { coreIdea: { explanation: "쉽게", lifeConnection: "생활", keywords: [] }, coreSentences: [], essentialQuestions: [] },
      guides: [],
    }) })
    .mockResolvedValueOnce({ text: JSON.stringify(COMPLETE_GENERATED_GUIDES) });

  const res = await generatePOST(makeRequest({
    ...VALID_DESIGN,
    step: "learning_guides",
  }));
  expect(res.status).toBe(200);
  expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  await expect(res.json()).resolves.toEqual(COMPLETE_GENERATED_GUIDES);
});

it("보완 결과도 불완전하면 부분 결과를 반환하지 않는다", async () => {
  mockAuth.mockResolvedValue(TEACHER_SESSION);
  mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ learningGuides: {}, guides: [] }) });
  const res = await generatePOST(makeRequest({ ...VALID_DESIGN, step: "learning_guides" }));
  expect(res.status).toBe(502);
  expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  expect(await res.json()).toMatchObject({ error: expect.stringContaining("완전") });
});
```

- [ ] **Step 2: 새 검사가 자동 보완 부재로 실패하는지 확인한다**

Run: `npx vitest run src/__tests__/unit-design.test.ts`

Expected: FAIL because the route calls Gemini once or returns the incomplete first response

- [ ] **Step 3: 생성 문구가 모든 원문과 핵심 낱말을 필수로 만들도록 강화한다**

`learning_guides` 규칙을 다음 문구로 교체한다.

```ts
- coreIdea.keywords는 선택한 핵심어를 우선해 학생이 꼭 알아야 할 서로 다른 핵심 낱말을 3~5개 만들고 모든 낱말에 쉬운 뜻을 붙이세요.
- coreSentences는 모든 원문에 대해 쉬운 표현을 하나씩 만들고 0부터 시작하는 원래 index를 빠짐없이 유지하세요.
- essentialQuestions는 모든 원문에 대해 thinkingFocus 한 문장과 perspectives 2~3개를 만들고 원래 index를 빠짐없이 유지하세요.
- guides는 모든 탐구 질문에 대해 원문과 같은 index, meaning, 서로 다른 핵심 낱말 2~5개와 쉬운 뜻, thinkingStart를 빠짐없이 만드세요.
```

`inquiry` 생성 문구에서는 학생용 설명 동시 생성을 제거하고 아래 출력만 요청한다.

```ts
아래 JSON만 출력:
{"inquiryQuestions":[
  {"type":"factual","content":"..."},
  {"type":"conceptual","content":"..."},
  {"type":"controversial","content":"..."}
]}
```

- [ ] **Step 4: 서버에서 첫 결과를 검사하고 한 번 보완한다**

```ts
const generate = (nextPrompt: string) => generateText({
  userId: (session.user as { id: string }).id,
  prompt: nextPrompt,
  req,
  localize: true,
  quality: true,
});

let text = await generate(prompt);
let parsed: unknown;
try {
  parsed = extractJsonObject(text);
} catch (error) {
  if (data.step !== "learning_guides") throw error;
  parsed = null;
}

if (data.step === "learning_guides") {
  const expected = {
    coreSentenceCount: data.coreSentences.length,
    essentialQuestionCount: data.essentialQuestions.length,
    inquiryQuestionCount: data.inquiryQuestions.length,
  };
  let checked = validateStudentGuideBundle(parsed, expected);
  if (!checked.ok) {
    text = await generate(buildStudentGuideRepairPrompt(prompt, text, checked.issues));
    try {
      parsed = extractJsonObject(text);
    } catch {
      parsed = null;
    }
    checked = validateStudentGuideBundle(parsed, expected);
  }
  if (!checked.ok) {
    return NextResponse.json({
      error: "학생용 설명을 완전하게 만들지 못했어요. 다시 시도해 주세요.",
      detail: checked.issues.join("; "),
    }, { status: 502 });
  }
  return NextResponse.json(checked.value);
}
```

비학생용 단계의 기존 인공지능 오류와 JSON 해석 오류 처리는 그대로 유지한다.

- [ ] **Step 5: 생성 문구와 자동 보완 검사가 통과하는지 확인한다**

Run: `npx vitest run src/__tests__/unit-design.test.ts`

Expected: PASS

- [ ] **Step 6: 두 번째 구현을 커밋한다**

```bash
git add src/lib/unit-design-prompt.ts src/app/api/unit-design/generate/route.ts src/__tests__/unit-design.test.ts
git commit -m "feat: 학생용 설명 자동 보완 추가"
```

### Task 3: 설명 원문 서명과 최신 상태 판별

**Files:**
- Create: `src/lib/student-guide-source.ts`
- Create: `src/__tests__/student-guide-source.test.ts`
- Create: `src/__tests__/student-inquiry-guides-hook.test.tsx`
- Modify: `src/app/(teacher)/teacher-curriculum/useStudentInquiryGuides.ts`
- Modify: `src/app/(teacher)/teacher-curriculum/page.tsx:245-430`

**Interfaces:**
- Produces: `buildStudentGuideSourceSignature(input): string`
- Produces from hook: `hasFreshStudentGuides`, `hasStaleStudentGuides`, `clearStudentGuides`
- Consumes in page payload: only fresh `learningGuides` and `studentGuide`

- [ ] **Step 1: 같은 원문은 같은 서명, 수정된 원문은 다른 서명을 만드는 실패 검사를 작성한다**

```ts
import { describe, expect, it } from "vitest";
import { buildStudentGuideSourceSignature } from "@/lib/student-guide-source";

const input = {
  coreIdea: "생물은 환경과 관계를 맺는다.",
  coreSentences: ["생물은 서로 연결된다."],
  essentialQuestions: ["생태계는 어떻게 유지될까?"],
  inquiryQuestions: [{ type: "factual" as const, content: "생산자는 무엇일까?" }],
};

describe("학생용 설명 원문 서명", () => {
  it("공백을 정리한 같은 원문에는 같은 서명을 만든다", () => {
    expect(buildStudentGuideSourceSignature(input)).toBe(buildStudentGuideSourceSignature({
      ...input,
      coreIdea: "  생물은 환경과 관계를 맺는다.  ",
    }));
  });

  it("질문 내용이나 유형이 바뀌면 다른 서명을 만든다", () => {
    expect(buildStudentGuideSourceSignature(input)).not.toBe(buildStudentGuideSourceSignature({
      ...input,
      inquiryQuestions: [{ type: "conceptual", content: "생산자는 무엇일까?" }],
    }));
  });
});
```

- [ ] **Step 2: 새 검사가 모듈 부재로 실패하는지 확인한다**

Run: `npx vitest run src/__tests__/student-guide-source.test.ts`

Expected: FAIL with unresolved import

- [ ] **Step 3: 안정적인 원문 서명을 구현한다**

```ts
import type { InquiryQuestion } from "@/app/(teacher)/teacher-curriculum/types";

export interface StudentGuideSourceInput {
  coreIdea: string;
  coreSentences: string[];
  essentialQuestions: string[];
  inquiryQuestions: Pick<InquiryQuestion, "type" | "content">[];
}

const clean = (value: string) => value.trim().replace(/\s+/g, " ");

export function buildStudentGuideSourceSignature(input: StudentGuideSourceInput): string {
  return JSON.stringify({
    coreIdea: clean(input.coreIdea),
    coreSentences: input.coreSentences.map(clean),
    essentialQuestions: input.essentialQuestions.map(clean),
    inquiryQuestions: input.inquiryQuestions
      .filter((question) => clean(question.content))
      .map((question) => ({ type: question.type, content: clean(question.content) })),
  });
}
```

- [ ] **Step 4: 생성 훅이 성공한 원문 서명과 최신 상태를 관리하도록 검사부터 확장한다**

`src/__tests__/student-inquiry-guides-hook.test.tsx`에 다음 동작을 추가한다. 파일이 없으면 새로 만들고 `renderHook`, `act`를 사용한다.

```ts
expect(result.current.hasFreshStudentGuides).toBe(false);
await act(() => result.current.handleGenerateStudentGuides());
expect(result.current.hasFreshStudentGuides).toBe(true);
rerender({ questions: [{ type: "factual", content: "바뀐 질문" }] });
expect(result.current.hasFreshStudentGuides).toBe(false);
expect(result.current.hasStaleStudentGuides).toBe(true);
```

Run: `npx vitest run src/__tests__/student-guide-source.test.ts src/__tests__/student-inquiry-guides-hook.test.tsx`

Expected: FAIL because the hook does not expose freshness

- [ ] **Step 5: 생성 훅에 최신 상태를 구현한다**

```ts
const sourceSignature = buildStudentGuideSourceSignature({
  coreIdea,
  coreSentences,
  essentialQuestions,
  inquiryQuestions: questions,
});
const [generatedSourceSignature, setGeneratedSourceSignature] = useState<string | null>(null);
const hasStudentGuides = Boolean(learningGuides) || questions.some((question) => question.studentGuide);
const hasFreshStudentGuides = hasStudentGuides && generatedSourceSignature === sourceSignature;
const hasStaleStudentGuides = hasStudentGuides && generatedSourceSignature !== sourceSignature;
```

성공적으로 묶음을 적용한 직후 `setGeneratedSourceSignature(sourceSignature)`를 호출한다. `clearStudentGuides`는 다음처럼 모든 설명과 서명을 함께 지운다.

```ts
const clearStudentGuides = () => {
  setLearningGuides(undefined);
  setQuestions((previous) => previous.map(({ studentGuide: _studentGuide, ...question }) => question));
  setGeneratedSourceSignature(null);
};
```

- [ ] **Step 6: 다섯째 단계 진입과 저장 자료가 최신 설명만 사용하도록 바꾼다**

`handleGoStep5`에서는 `inquiry` 응답의 질문 유형과 내용만 적용하고, 학생용 설명 동시 결과를 적용하지 않는다.

```ts
clearStudentGuides();
setInquiryQuestions(data.inquiryQuestions.map((question: InquiryQuestion) => ({
  type: question.type,
  content: question.content,
})));
```

저장 대상 질문과 설명은 최신 상태일 때만 포함한다.

```ts
const selectedInquiryQuestions = inquiryQuestions
  .map((question) => {
    const studentGuide = hasFreshStudentGuides
      ? normalizeStudentInquiryGuide(question.studentGuide)
      : undefined;
    return {
      type: question.type,
      content: question.content.trim(),
      ...(studentGuide ? { studentGuide } : {}),
    };
  })
  .filter((question) => question.content);

// 현재 buildDesignPayload 안의 두 속성을 아래 값으로 교체한다.
learningGuides: hasFreshStudentGuides ? learningGuides : undefined,
inquiryQuestions: selectedInquiryQuestions,
```

- [ ] **Step 7: 최신 상태 관련 검사가 통과하는지 확인한다**

Run: `npx vitest run src/__tests__/student-guide-source.test.ts src/__tests__/student-inquiry-guides-hook.test.tsx src/__tests__/question-class-create-flow.test.ts`

Expected: PASS

- [ ] **Step 8: 세 번째 구현을 커밋한다**

```bash
git add src/lib/student-guide-source.ts src/__tests__/student-guide-source.test.ts src/__tests__/student-inquiry-guides-hook.test.tsx 'src/app/(teacher)/teacher-curriculum/useStudentInquiryGuides.ts' 'src/app/(teacher)/teacher-curriculum/page.tsx' src/__tests__/question-class-create-flow.test.ts
git commit -m "feat: 학생용 설명 최신 상태 추적"
```

### Task 4: 다섯째 단계 질문 편집과 배포 자료 확인 분리

**Files:**
- Create: `src/app/(teacher)/teacher-curriculum/InquiryQuestionEditor.tsx`
- Create: `src/app/(teacher)/teacher-curriculum/InquiryDistributionReview.tsx`
- Create: `src/__tests__/curriculum-inquiry-step.render.test.tsx`
- Modify: `src/app/(teacher)/teacher-curriculum/CurriculumInquiryStep.tsx`
- Modify: `src/app/(teacher)/teacher-curriculum/CurriculumCreateFlow.tsx`
- Modify: `src/components/shared/StudentLearningGuideEditor.tsx`
- Modify: `src/components/shared/StudentInquiryGuideEditor.tsx`
- Modify: `src/__tests__/student-learning-guide-editor.render.test.tsx`
- Modify: `messages/ko.json`
- Modify: `messages/en.json`

**Interfaces:**
- `InquiryQuestionEditor`: 질문 유형과 내용 편집만 담당
- `InquiryDistributionReview`: 단원 원문, 최신 상태, 설명 생성과 편집을 담당
- `CurriculumInquiryStep`: `view: "edit" | "review"` 전환과 저장 설정 배치를 담당

- [ ] **Step 1: 편집 화면과 확인 화면 전환의 실패 검사를 작성한다**

```tsx
const baseProps: ComponentProps<typeof CurriculumInquiryStep> = {
  visible: true,
  inquiryQuestions: [
    { type: "factual", content: "생산자는 무엇일까?" },
    { type: "conceptual", content: "먹이 관계는 어떻게 이어질까?" },
    { type: "controversial", content: "개발을 제한해야 할까?" },
  ],
  coreIdea: "생물은 환경과 관계를 맺는다.",
  coreSentences: ["생물은 서로 연결된다."],
  essentialQuestions: ["생태계는 어떻게 유지될까?"],
  learningGuides: undefined,
  hasFreshStudentGuides: false,
  hasStaleStudentGuides: false,
  selectedInquiryCount: 3,
  dragInquiryIndex: null,
  inquiryAddType: "factual",
  saveDate: "2026-07-18",
  saveGrade: "5",
  saveTitle: "",
  curriculumData: {
    id: "area-1",
    subject: "과학",
    gradeRange: "5-6",
    area: "생물과 환경",
    coreIdea: "생물은 환경과 관계를 맺는다.",
    knowledgeItems: [],
    processItems: [],
    valueItems: [],
    middleKnowledgeItems: [],
    middleProcessItems: [],
    middleValueItems: [],
    achievements: [],
    units: [],
  },
  students: [],
  targetClasses: [],
  targetClassValue: "all",
  selectedStudentIds: [],
  sessionIsActive: true,
  defaultQuestionPublic: true,
  sessionLikesVisible: true,
  sessionCommentsVisible: true,
  isSaving: false,
  isGeneratingGuides: false,
  canSaveDesign: false,
  lastDesignAction: null,
  onSetDragInquiryIndex: vi.fn(),
  onDropInquiry: vi.fn(),
  onMoveInquiry: vi.fn(),
  onUpdateInquiry: vi.fn(),
  onRemoveInquiry: vi.fn(),
  onInquiryAddTypeChange: vi.fn(),
  onAddInquiry: vi.fn(),
  onSaveDateChange: vi.fn(),
  onSaveGradeChange: vi.fn(),
  onSaveTitleChange: vi.fn(),
  onTargetClassChange: vi.fn(),
  onSelectedStudentIdsChange: vi.fn(),
  onVisibilitySettingsChange: vi.fn(),
  onSaveAndCreateSession: vi.fn(),
  onSaveOnly: vi.fn(),
  onGenerateGuides: vi.fn(),
  onLearningGuidesChange: vi.fn(),
};

function InquiryStepHarness({ initialTitle = "" }: { initialTitle?: string }) {
  const [title, setTitle] = useState(initialTitle);
  return <CurriculumInquiryStep {...baseProps} saveTitle={title} onSaveTitleChange={setTitle} />;
}

it("처음에는 질문 편집만 보이고 완료 뒤 배포 자료를 보여준다", async () => {
  const user = userEvent.setup();
  render(<InquiryStepHarness />);

  expect(screen.getByText("사실적 질문", { exact: false })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "학생용 설명 만들기" })).not.toBeInTheDocument();
  expect(screen.queryByText("저장 정보")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "탐구 질문 만들기 완료" }));

  expect(screen.getByRole("heading", { name: "학생 배포 자료 확인" })).toBeInTheDocument();
  expect(screen.getByText("생물은 환경과 관계를 맺는다.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "학생용 설명 만들기" })).toBeInTheDocument();
  expect(screen.getByText("저장 정보")).toBeInTheDocument();
});

it("확인 화면의 원문은 읽기 전용이고 단원명 입력은 위쪽 표시와 동기화된다", async () => {
  const user = userEvent.setup();
  render(<InquiryStepHarness />);
  await user.click(screen.getByRole("button", { name: "탐구 질문 만들기 완료" }));

  expect(screen.queryByDisplayValue("생물은 환경과 관계를 맺는다.")).not.toBeInTheDocument();
  expect(screen.getByText("질문 수업을 만들 때 단원명을 입력해 주세요")).toBeInTheDocument();
  await user.type(screen.getByPlaceholderText("예: 식물의 한살이"), "생태계와 환경");
  expect(screen.getByText("생태계와 환경")).toBeInTheDocument();
});
```

- [ ] **Step 2: 기존 한 화면 구조 때문에 검사가 실패하는지 확인한다**

Run: `npx vitest run src/__tests__/curriculum-inquiry-step.render.test.tsx`

Expected: FAIL because student guide and save controls are visible before completion and the completion button is missing

- [ ] **Step 3: 질문 전용 편집 구성 요소를 추출한다**

```ts
interface InquiryQuestionEditorProps {
  questions: InquiryQuestion[];
  selectedCount: number;
  dragIndex: number | null;
  addType: InquiryQuestion["type"];
  onSetDragIndex: (index: number | null) => void;
  onDrop: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onUpdate: (index: number, patch: Partial<InquiryQuestion>) => void;
  onRemove: (index: number) => void;
  onAddTypeChange: (type: InquiryQuestion["type"]) => void;
  onAdd: (type: InquiryQuestion["type"]) => void;
  onComplete: () => void;
}
```

기존 질문 카드에서 `StudentInquiryGuideEditor`를 제거한다. 아래 완료 버튼을 추가한다.

```tsx
<Button
  type="button"
  variant="gradient"
  className="h-11 w-full text-base font-semibold"
  disabled={selectedCount === 0}
  onClick={onComplete}
>
  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
  {t("completeInquiryQuestions")}
</Button>
```

- [ ] **Step 4: 배포 자료 확인 구성 요소와 원문 아래 설명 표시를 구현한다**

`InquiryDistributionReview`는 다음 속성을 받는다.

```ts
interface InquiryDistributionReviewProps {
  unitTitle: string;
  coreIdea: string;
  coreSentences: string[];
  essentialQuestions: string[];
  inquiryQuestions: InquiryQuestion[];
  learningGuides?: StudentLearningGuides;
  hasFreshStudentGuides: boolean;
  hasStaleStudentGuides: boolean;
  isGeneratingGuides: boolean;
  onGenerateGuides: () => void;
  onLearningGuidesChange: (value: StudentLearningGuides) => void;
  onInquiryGuideChange: (index: number, guide: StudentInquiryGuide) => void;
  onBackToEdit: () => void;
}
```

단원명은 다음 중립 영역으로 표시한다.

```tsx
<section data-student-guide-section="unit-title" className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/50">
  <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-100">{t("studentGuideUnitTitle")}</h3>
  <p className="mt-2 text-base font-semibold text-foreground">
    {unitTitle.trim() || t("unitTitlePending")}
  </p>
</section>
```

`StudentLearningGuideEditor`에 `coreIdea`, `showEditors`, `emptyMessage` 속성을 추가한다. 각 색상 영역에서 원문을 먼저 표시하고 `showEditors`가 참일 때만 설명 입력을 표시한다.

```tsx
<div data-student-guide-source="core-idea" className="mt-3 rounded-lg border border-amber-200/70 bg-background/85 px-3 py-2.5 text-sm text-foreground dark:border-amber-800/50">
  {coreIdea}
</div>
{showEditors ? (
  <div className="mt-3 grid gap-3 lg:grid-cols-2">
    <div className="space-y-1 lg:col-span-2">
      <Label htmlFor={`${fieldId}-core-explanation`}>{t("coreIdeaExplanationLabel")}</Label>
      <textarea
        id={`${fieldId}-core-explanation`}
        rows={2}
        value={coreIdeaGuide.explanation}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
        onChange={(event) => onChange({
          ...current,
          coreIdea: { ...coreIdeaGuide, explanation: event.target.value },
        })}
      />
    </div>
  </div>
) : (
  <p className="mt-3 rounded-lg border border-dashed border-amber-300/70 bg-background/60 px-3 py-3 text-xs text-muted-foreground dark:border-amber-700/60">
    {emptyMessage}
  </p>
)}
```

기존 생활 속 연결과 핵심 낱말 입력도 같은 `showEditors` 조건 안으로 옮긴다. 핵심 문장과 핵심 질문은 각 원문 카드 바로 아래에 기존 설명 입력을 둔다. 탐구 질문은 초록 영역에서 읽기 전용 원문을 먼저 표시하고, 최신 설명이 있을 때만 `StudentInquiryGuideEditor`를 바로 아래에 펼쳐 표시한다.

- [ ] **Step 5: 다섯째 단계에 두 화면 상태를 연결한다**

```ts
const [view, setView] = useState<"edit" | "review">("edit");
const cardRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (!visible) setView("edit");
}, [visible]);

const showReview = () => {
  setView("review");
  requestAnimationFrame(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
};
```

`view === "edit"`이면 `InquiryQuestionEditor`만 표시한다. `view === "review"`이면 `InquiryDistributionReview`와 기존 저장 정보, 대상, 공개 설정, 저장 버튼을 표시한다. 배포 자료 확인 제목은 `학생 배포 자료 확인`으로 바꾼다.

- [ ] **Step 6: 한국어와 영어 문구를 추가한다**

```json
{
  "completeInquiryQuestions": "탐구 질문 만들기 완료",
  "reviewDistributionTitle": "학생 배포 자료 확인",
  "reviewDistributionDesc": "학생에게 보여 줄 단원 자료와 설명을 확인하고 질문 수업을 만드세요.",
  "backToInquiryEdit": "탐구 질문 수정하기",
  "studentGuideUnitTitle": "단원명",
  "unitTitlePending": "질문 수업을 만들 때 단원명을 입력해 주세요",
  "studentGuideEmpty": "학생용 설명 만들기를 누르면 원문 아래에 쉬운 설명이 나타나요.",
  "studentGuideStale": "원문이 바뀌었어요. 학생용 설명을 다시 만들어 주세요.",
  "noInquiryToComplete": "내용이 있는 탐구 질문을 한 개 이상 작성해 주세요."
}
```

영어 파일에는 같은 뜻의 자연스러운 영어 문구를 넣는다.

- [ ] **Step 7: 화면 전환과 영역별 색상 검사가 통과하는지 확인한다**

Run: `npx vitest run src/__tests__/curriculum-inquiry-step.render.test.tsx src/__tests__/student-learning-guide-editor.render.test.tsx src/__tests__/question-class-create-flow.test.ts`

Expected: PASS

- [ ] **Step 8: 네 번째 구현을 커밋한다**

```bash
git add 'src/app/(teacher)/teacher-curriculum/InquiryQuestionEditor.tsx' 'src/app/(teacher)/teacher-curriculum/InquiryDistributionReview.tsx' 'src/app/(teacher)/teacher-curriculum/CurriculumInquiryStep.tsx' 'src/app/(teacher)/teacher-curriculum/CurriculumCreateFlow.tsx' src/components/shared/StudentLearningGuideEditor.tsx src/components/shared/StudentInquiryGuideEditor.tsx src/__tests__/curriculum-inquiry-step.render.test.tsx src/__tests__/student-learning-guide-editor.render.test.tsx src/__tests__/question-class-create-flow.test.ts messages/ko.json messages/en.json
git commit -m "feat: 탐구 질문 배포 자료 확인 화면 추가"
```

### Task 5: 저장 연결, 전체 흐름 검사, 배포 준비

**Files:**
- Modify: `e2e/wizard.spec.ts`
- Modify only if an uncovered regression is found: files changed in Tasks 1-4

**Interfaces:**
- Consumes: completed edit-to-review flow, validated guide bundle, fresh-only save payload
- Produces: browser-tested production build ready for landing

- [ ] **Step 1: 실제 교사 흐름 검사를 새 화면 순서로 바꾼다**

```ts
// 다섯째 단계에는 질문 편집만 보인다.
await expect(page.getByText("먹이 사슬과 먹이 그물은 어떻게 다를까?")).toBeVisible();
await expect(page.getByRole("button", { name: "학생용 설명 만들기" })).toHaveCount(0);
await expect(page.getByText("저장 정보")).toHaveCount(0);

// 완료 뒤 배포 자료와 생성 기능이 보인다.
await page.getByRole("button", { name: "탐구 질문 만들기 완료" }).click();
await expect(page.getByRole("heading", { name: "학생 배포 자료 확인" })).toBeVisible();
await expect(page.locator('[data-student-guide-section="unit-title"]')).toBeVisible();
await expect(page.locator('[data-student-guide-section="core-idea"]')).toHaveClass(/bg-amber-50\/70/);
await expect(page.locator('[data-student-guide-section="core-sentence"]')).toHaveClass(/bg-sky-50\/70/);
await expect(page.locator('[data-student-guide-section="essential-question"]')).toHaveClass(/bg-violet-50\/70/);
await expect(page.locator('[data-student-guide-section="inquiry-question"]')).toHaveClass(/bg-emerald-50\/70/);

await page.getByRole("button", { name: "학생용 설명 만들기" }).click();
await expect(page.getByLabel("핵심 아이디어 핵심 낱말"))
  .toHaveValue(/생태계: 생물과 환경이 서로 관계를 맺는 체계/);
await expect(page.getByText("식물이 양분을 만들 때 필요한 조건을 찾는 질문이에요.")).toBeVisible();
```

- [ ] **Step 2: 브라우저 검사가 기존 한 화면 기대를 버리고 새 흐름을 검증하는지 확인한다**

Run: `CI=1 npx playwright test e2e/wizard.spec.ts --project=chromium`

Expected: PASS with one wizard test; if the local server sandbox blocks port 3000, rerun the same command with approved elevated execution

- [ ] **Step 3: 변경 파일 무결성을 확인한다**

Run: `git diff --check`

Expected: no output and exit code 0

- [ ] **Step 4: 코드 검사와 전체 단위 검사를 실행한다**

Run: `npm run lint`

Expected: exit code 0

Run: `npm test`

Expected: all test files and tests pass

- [ ] **Step 5: 실제 자료 저장소 점검을 포함한 배포용 빌드를 실행한다**

Run: `npm run build`

Expected: schema, security, TypeScript, Next.js production build all pass

- [ ] **Step 6: 생성된 파일이 변경 목록에 들어오지 않도록 확인한다**

Run: `git status --short`

Expected: only intended source, message, test, and plan files; if `next-env.d.ts` changed only because of build, restore its committed import line with `apply_patch`

- [ ] **Step 7: 최종 검증 결과를 커밋한다**

```bash
git add e2e/wizard.spec.ts
git commit -m "test: 탐구 질문 배포 자료 흐름 검증"
```

- [ ] **Step 8: 원격 기본 브랜치와의 선후 관계를 확인하고 푸시한다**

```bash
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
git push origin HEAD:main
```

Expected: `origin/main` is an ancestor and push fast-forwards `main`

- [ ] **Step 9: 운영 배포 완료와 운영 주소 응답을 확인한다**

```bash
npx vercel list
npx vercel inspect https://questioning-based-inquiry.vercel.app --wait
curl -I -L --max-time 30 https://questioning-based-inquiry.vercel.app/teacher-curriculum
```

Expected: latest production deployment is ready; the protected teacher page redirects to login and the login page returns 200

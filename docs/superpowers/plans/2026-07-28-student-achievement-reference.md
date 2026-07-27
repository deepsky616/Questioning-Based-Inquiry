# Student Achievement Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생 질문하기 참고자료에 성취기준과 학생 눈높이 설명을 핵심 아이디어 다음 순서로 표시하고 김질문 체험 자료와 운영 사이트에서도 확인할 수 있게 한다.

**Architecture:** `learning_guides` 제이슨에 성취기준 번호별 설명을 저장하며 기존 데이터베이스 구조를 유지한다. 학생 참고자료 길찾기는 저장된 설명을 우선 사용하고, 예전 설계에는 교육과정 해설을 번호로 찾아 대체한다. 공용 참고자료 보기가 다섯 영역의 순서와 색상을 담당하고 기존 번역 길찾기는 새 본문과 설명까지 번역한다.

**Tech Stack:** Next.js, React, TypeScript, Prisma, PostgreSQL, Zod, Vitest, Testing Library, next-intl, Vercel

## Global Constraints

- 참고자료 순서는 핵심 아이디어, 성취기준, 핵심 문장, 핵심 질문, 탐구 질문이다.
- 성취기준 영역은 밝은 화면과 어두운 화면 모두 읽기 쉬운 청록 계열을 사용한다.
- 학생이 페이지를 열 때 인공지능을 새로 호출하지 않는다.
- 기존 설계는 교육과정 해설을 대체 설명으로 사용하고 찾지 못하면 원문만 표시한다.
- 김질문 체험 자료에는 성취기준과 쉬운 설명을 명시적으로 저장한다.
- 학생 참고자료 조회 권한과 질문 작성 흐름은 바꾸지 않는다.

---

### Task 1: 성취기준 학생용 설명 자료형과 완전성 검사

**Files:**
- Modify: `src/lib/student-learning-guide.ts`
- Modify: `src/lib/student-learning-guide-schema.ts`
- Modify: `src/lib/student-guide-completeness.ts`
- Modify: `src/lib/student-guide-source.ts`
- Modify: `src/lib/unit-design-prompt.ts`
- Modify: `src/app/api/unit-design/generate/route.ts`
- Test: `src/__tests__/student-learning-guide.test.ts`
- Test: `src/__tests__/student-guide-completeness.test.ts`
- Test: `src/__tests__/student-guide-source.test.ts`
- Test: `src/__tests__/unit-design.test.ts`

**Interfaces:**
- Consumes: `Achievement { code: string; content: string }`
- Produces: `StudentAchievementGuide { index: number; explanation: string }`
- Produces: `StudentLearningGuides.achievements: StudentAchievementGuide[]`
- Produces: `StudentGuideExpectedCounts.achievementCount: number`

- [ ] **Step 1: 성취기준 설명 정규화와 완전성 실패 검사를 작성한다**

```ts
expect(normalizeStudentLearningGuides({
  achievements: [
    { index: 0, explanation: "물을 세 가지 모습으로 구분하고 변화를 살펴보는 목표예요." },
    { index: -1, explanation: "버릴 설명" },
  ],
  coreSentences: [],
  essentialQuestions: [],
})?.achievements).toEqual([
  { index: 0, explanation: "물을 세 가지 모습으로 구분하고 변화를 살펴보는 목표예요." },
]);

expect(validateStudentGuideBundle(bundleWithoutAchievementGuides, {
  achievementCount: 1,
  coreSentenceCount: 1,
  essentialQuestionCount: 1,
  inquiryQuestionCount: 1,
})).toMatchObject({ ok: false });
```

- [ ] **Step 2: 새 검사만 실행해 성취기준 설명 기능이 없어서 실패하는지 확인한다**

Run: `npm test -- src/__tests__/student-learning-guide.test.ts src/__tests__/student-guide-completeness.test.ts`

Expected: `achievements`가 정규화되지 않고 `achievementCount` 검사가 없어서 실패한다.

- [ ] **Step 3: 자료형, 스키마, 정규화, 번호 완전성 검사를 구현한다**

```ts
export interface StudentAchievementGuide {
  index: number;
  explanation: string;
}

export interface StudentLearningGuides {
  coreIdea?: StudentCoreIdeaGuide;
  achievements: StudentAchievementGuide[];
  coreSentences: StudentCoreSentenceGuide[];
  essentialQuestions: StudentEssentialQuestionGuide[];
}
```

`studentLearningGuidesSchema`에는 최대 30개의 `{ index, explanation }`을 받는 `achievements` 배열을 추가하고 기본값을 빈 배열로 둔다. `normalizeStudentLearningGuides`는 음수 번호와 빈 설명을 제거하고 설명을 500자로 제한한다. `validateStudentGuideBundle`은 `achievementCount`와 정확히 일치하는 연속 번호를 요구한다.

- [ ] **Step 4: 생성 원본 서명에 성취기준을 포함하는 실패 검사를 작성한다**

```ts
const first = buildStudentGuideSourceSignature({
  coreIdea: "물의 상태",
  achievements: [{ code: "[4과10-01]", content: "물의 세 가지 상태를 안다." }],
  selectedKeywords: [],
  coreSentences: [],
  essentialQuestions: [],
  inquiryQuestions: [],
});
const second = buildStudentGuideSourceSignature({
  coreIdea: "물의 상태",
  achievements: [{ code: "[4과10-02]", content: "물의 상태 변화를 관찰한다." }],
  selectedKeywords: [],
  coreSentences: [],
  essentialQuestions: [],
  inquiryQuestions: [],
});
expect(first).not.toBe(second);
```

- [ ] **Step 5: 서명 검사를 실행해 같은 값으로 계산되어 실패하는지 확인한다**

Run: `npm test -- src/__tests__/student-guide-source.test.ts`

Expected: 성취기준이 서명에 없어서 두 값이 같다는 실패가 나온다.

- [ ] **Step 6: `StudentGuideSourceInput`과 생성 요청에 성취기준을 추가한다**

```ts
export interface StudentGuideSourceInput {
  coreIdea: string;
  achievements: Achievement[];
  selectedKeywords: string[];
  coreSentences: string[];
  essentialQuestions: string[];
  inquiryQuestions: Pick<InquiryQuestion, "type" | "content">[];
}
```

서명에는 공백을 정리한 `code`와 `content`를 순서대로 넣는다.

- [ ] **Step 7: 인공지능 안내문과 응답 완전성 실패 검사를 작성한다**

```ts
expect(prompt).toContain("[선택 성취기준]");
expect(prompt).toContain("[4과10-01]");
expect(prompt).toContain("learningGuides.achievements");
expect(prompt).toContain("모든 성취기준");
```

생성 길찾기 검사는 성취기준 설명이 빠진 첫 응답을 거부하고, 두 번째 완전한 응답을 반환하는지 확인한다.

- [ ] **Step 8: 생성 검사를 실행해 안내문과 예상 개수 누락으로 실패하는지 확인한다**

Run: `npm test -- src/__tests__/unit-design.test.ts`

Expected: 성취기준 안내문과 `achievementCount`가 없어서 새 검사가 실패한다.

- [ ] **Step 9: 성취기준 원문, 출력 규칙, 예상 개수를 생성 흐름에 연결한다**

```json
{
  "learningGuides": {
    "achievements": [
      {
        "index": 0,
        "explanation": "이 단원에서 물의 세 가지 모습과 변화를 찾아 설명할 수 있어야 한다는 뜻이에요."
      }
    ]
  }
}
```

안내문은 원문을 바꾸지 않고 모든 성취기준에 학생 눈높이 한두 문장과 원래 번호를 요구한다. 생성 길찾기는 `achievementCount: data.achievements.length`를 완전성 검사에 전달한다.

- [ ] **Step 10: Task 1 검사를 다시 실행해 모두 통과하는지 확인한다**

Run: `npm test -- src/__tests__/student-learning-guide.test.ts src/__tests__/student-guide-completeness.test.ts src/__tests__/student-guide-source.test.ts src/__tests__/unit-design.test.ts`

Expected: 모든 검사가 통과한다.

- [ ] **Step 11: Task 1을 커밋한다**

```bash
git add src/lib/student-learning-guide.ts src/lib/student-learning-guide-schema.ts src/lib/student-guide-completeness.ts src/lib/student-guide-source.ts src/lib/unit-design-prompt.ts src/app/api/unit-design/generate/route.ts src/__tests__/student-learning-guide.test.ts src/__tests__/student-guide-completeness.test.ts src/__tests__/student-guide-source.test.ts src/__tests__/unit-design.test.ts
git commit -m "feat: 성취기준 학생용 설명 생성 추가"
```

### Task 2: 교사 생성과 편집 흐름 연결

**Files:**
- Modify: `src/app/(teacher)/teacher-curriculum/useStudentInquiryGuides.ts`
- Modify: `src/app/(teacher)/teacher-curriculum/page.tsx`
- Modify: `src/app/(teacher)/teacher-curriculum/SavedDesignsTab.tsx`
- Modify: `src/components/shared/StudentLearningGuideEditor.tsx`
- Test: `src/__tests__/curriculum-inquiry-step.render.test.tsx`
- Test: `src/__tests__/saved-designs-tab.render.test.tsx`

**Interfaces:**
- Consumes: `StudentLearningGuides.achievements`
- Produces: 생성 요청의 `achievements`와 저장되는 최신 성취기준 설명

- [ ] **Step 1: 새 설계와 저장 설계에서 성취기준을 생성 요청에 포함하는 실패 검사를 작성한다**

```ts
expect(JSON.parse(fetchMock.mock.calls.at(-1)?.[1]?.body as string)).toMatchObject({
  step: "learning_guides",
  achievements: [{ code: "[4과10-01]", content: "물이 세 가지 상태로 변할 수 있음을 안다." }],
});
```

성취기준 본문을 수정하면 학생용 설명이 오래된 상태가 되는 검사도 추가한다.

- [ ] **Step 2: 화면 검사를 실행해 요청 본문과 오래된 상태 처리가 빠져 실패하는지 확인한다**

Run: `npm test -- src/__tests__/curriculum-inquiry-step.render.test.tsx src/__tests__/saved-designs-tab.render.test.tsx`

Expected: 생성 요청에 `achievements`가 없고 서명이 바뀌지 않아 실패한다.

- [ ] **Step 3: 새 설계 생성 훅에 `achievements`를 전달한다**

```ts
useStudentInquiryGuides({
  questions: inquiryQuestions,
  coreIdea: selectedCoreIdeaLines.join("\n"),
  achievements: getSelectedAchievements(),
  selectedKeywords,
  coreSentences: selectedCoreSentences,
  essentialQuestions: selectedEssentialQuestions,
  // 기존 콜백 유지
});
```

훅은 서명과 `learning_guides` 생성 요청 모두 같은 성취기준 배열을 사용하고 완전성 검사에 성취기준 개수를 전달한다.

- [ ] **Step 4: 저장 설계의 생성, 서명, 정리 번호 다시 연결을 구현한다**

저장 설계 생성 요청에는 빈 줄을 제거한 `editAchievements`를 전달한다. `remapStudentLearningGuides`는 다음 서명을 사용한다.

```ts
remapStudentLearningGuides(
  value,
  achievementSourceIndexes,
  coreSentenceSourceIndexes,
  essentialQuestionSourceIndexes,
)
```

성취기준 삭제로 번호가 달라질 때 설명 번호도 같은 방식으로 다시 연결한다.

- [ ] **Step 5: 교사 확인 화면의 성취기준 아래에 쉬운 설명을 표시한다**

```tsx
const guide = current.achievements.find((item) => item.index === index);
{guide?.explanation && (
  <div data-student-understanding-guide="achievement">
    <p>{t("easyExplanation")}</p>
    <p>{guide.explanation}</p>
  </div>
)}
```

- [ ] **Step 6: Task 2 검사를 다시 실행해 모두 통과하는지 확인한다**

Run: `npm test -- src/__tests__/curriculum-inquiry-step.render.test.tsx src/__tests__/saved-designs-tab.render.test.tsx`

Expected: 모든 검사가 통과한다.

- [ ] **Step 7: Task 2를 커밋한다**

```bash
git add src/app/\(teacher\)/teacher-curriculum/useStudentInquiryGuides.ts src/app/\(teacher\)/teacher-curriculum/page.tsx src/app/\(teacher\)/teacher-curriculum/SavedDesignsTab.tsx src/components/shared/StudentLearningGuideEditor.tsx src/__tests__/curriculum-inquiry-step.render.test.tsx src/__tests__/saved-designs-tab.render.test.tsx
git commit -m "feat: 성취기준 설명을 교사 생성 흐름에 연결"
```

### Task 3: 학생 참고자료 길찾기와 예전 자료 대체 설명

**Files:**
- Create: `src/lib/student-achievement-reference.ts`
- Modify: `src/app/api/sessions/[id]/design-context/route.ts`
- Modify: `src/app/api/sessions/[id]/design-context/translate/route.ts`
- Modify: `src/app/(student)/student-ask/types.ts`
- Test: `src/__tests__/design-context-route.test.ts`
- Test: `src/__tests__/design-context-translate-route.test.ts`
- Test: `src/__tests__/student-achievement-reference.test.ts`

**Interfaces:**
- Produces: `normalizeAchievements(value: unknown): Achievement[]`
- Produces: `withAchievementGuideFallback(guides, achievements, gradeRange, subject, area): StudentLearningGuides | undefined`

- [ ] **Step 1: 저장 설명 우선과 교육과정 해설 대체 동작의 실패 검사를 작성한다**

```ts
expect(withAchievementGuideFallback(
  { achievements: [{ index: 0, explanation: "저장된 쉬운 설명" }], coreSentences: [], essentialQuestions: [] },
  [{ code: "[4과10-01]", content: "물의 세 가지 상태를 안다." }],
  "3-4",
  "과학",
  "물의 상태 변화",
)?.achievements[0].explanation).toBe("저장된 쉬운 설명");

expect(withAchievementGuideFallback(
  { achievements: [], coreSentences: [], essentialQuestions: [] },
  [{ code: "[4과10-01]", content: "물의 세 가지 상태를 안다." }],
  "3-4",
  "과학",
  "물의 상태 변화",
)?.achievements[0].explanation).toContain("물");
```

- [ ] **Step 2: 도움 함수 검사를 실행해 함수가 없어 실패하는지 확인한다**

Run: `npm test -- src/__tests__/student-achievement-reference.test.ts`

Expected: 모듈이나 함수가 없어서 실패한다.

- [ ] **Step 3: 성취기준 정규화와 대체 설명 결합 함수를 구현한다**

번호 비교는 대괄호와 공백 차이를 제거해 수행한다. 저장된 설명을 가장 먼저 사용하고, 빠진 번호만 `getCurriculumAchievementDetail(gradeRange, subject, area)?.explanations`에서 찾는다. 저장 설명과 교육과정 해설이 모두 없으면 해당 번호의 설명을 만들지 않는다.

- [ ] **Step 4: 일반 참고자료 길찾기가 성취기준을 반환하는 실패 검사를 작성한다**

```ts
expect(body.context.achievements).toEqual([
  { code: "[4과10-01]", content: "물이 세 가지 상태로 변할 수 있음을 안다." },
]);
expect(body.context.learningGuides.achievements[0].explanation).toBe("학생용 쉬운 설명");
```

- [ ] **Step 5: 길찾기 검사를 실행해 `selected_achievements`가 조회되지 않아 실패하는지 확인한다**

Run: `npm test -- src/__tests__/design-context-route.test.ts src/__tests__/design-context-translate-route.test.ts`

Expected: 응답에 `achievements`가 없고 번역 항목에도 포함되지 않아 실패한다.

- [ ] **Step 6: 일반 조회와 번역 조회에 성취기준을 연결한다**

두 질의에 `selected_achievements`를 추가하고 정규화한 뒤 대체 설명을 합친다. 번역 항목은 성취기준 `content`와 설명 `explanation`을 포함하며 `code`는 번역하지 않는다.

```ts
interface DesignReferenceContext {
  achievements: Achievement[];
  learningGuides?: StudentLearningGuides;
}
```

- [ ] **Step 7: Task 3 검사를 다시 실행해 모두 통과하는지 확인한다**

Run: `npm test -- src/__tests__/student-achievement-reference.test.ts src/__tests__/design-context-route.test.ts src/__tests__/design-context-translate-route.test.ts`

Expected: 모든 검사가 통과한다.

- [ ] **Step 8: Task 3을 커밋한다**

```bash
git add src/lib/student-achievement-reference.ts src/app/api/sessions/\[id\]/design-context/route.ts src/app/api/sessions/\[id\]/design-context/translate/route.ts src/app/\(student\)/student-ask/types.ts src/__tests__/student-achievement-reference.test.ts src/__tests__/design-context-route.test.ts src/__tests__/design-context-translate-route.test.ts
git commit -m "feat: 학생 참고자료에 성취기준 자료 제공"
```

### Task 4: 학생 화면 다섯 영역 표시

**Files:**
- Modify: `src/components/shared/DesignReferenceView.tsx`
- Modify: `messages/ko.json`
- Modify: `messages/en.json`
- Test: `src/__tests__/student-ask-result.render.test.tsx`
- Test: `src/__tests__/student-ask-tablet-layout.test.ts`

**Interfaces:**
- Consumes: `DesignReference.achievements`
- Consumes: `StudentLearningGuides.achievements`

- [ ] **Step 1: 성취기준 영역 순서, 내용, 설명, 색상, 번호의 실패 검사를 작성한다**

```ts
const coreIdea = container.querySelector('[data-design-reference-section="core-idea"]');
const achievement = container.querySelector('[data-design-reference-section="achievement"]');
const coreSentence = container.querySelector('[data-design-reference-section="core-sentence"]');
expect(coreIdea?.compareDocumentPosition(achievement as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
expect(achievement?.compareDocumentPosition(coreSentence as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
expect(achievement).toHaveTextContent("[4과10-01]");
expect(achievement).toHaveTextContent("학생용 쉬운 설명");
expect(achievement?.className).toContain("dark:");
```

- [ ] **Step 2: 학생 화면 검사를 실행해 성취기준 영역이 없어 실패하는지 확인한다**

Run: `npm test -- src/__tests__/student-ask-result.render.test.tsx src/__tests__/student-ask-tablet-layout.test.ts`

Expected: 성취기준 영역과 다섯 영역 번호가 없어서 실패한다.

- [ ] **Step 3: 성취기준 영역과 동적 번호를 구현한다**

성취기준이 있으면 번호는 `1, 2, 3, 4, 5`가 되고, 없으면 기존 `1, 2, 3, 4`를 유지한다. 성취기준 영역은 다음 계열을 사용한다.

```tsx
className="rounded-lg border border-teal-200/80 bg-teal-50/70 p-3 dark:border-teal-800/60 dark:bg-teal-950/20"
```

각 성취기준 원문 아래에서 같은 번호의 설명을 찾아 `쉽게 풀어보기`로 표시한다.

- [ ] **Step 4: 한국어와 영어 이름을 추가한다**

```json
{
  "achievements": "성취기준",
  "achievementsDesc": "이 단원에서 배우고 할 수 있어야 하는 내용을 알려줘요."
}
```

영어 값은 `Achievement standards`, `What you should understand and be able to do in this unit.`로 둔다.

- [ ] **Step 5: Task 4 검사를 다시 실행해 모두 통과하는지 확인한다**

Run: `npm test -- src/__tests__/student-ask-result.render.test.tsx src/__tests__/student-ask-tablet-layout.test.ts`

Expected: 모든 검사가 통과한다.

- [ ] **Step 6: Task 4를 커밋한다**

```bash
git add src/components/shared/DesignReferenceView.tsx messages/ko.json messages/en.json src/__tests__/student-ask-result.render.test.tsx src/__tests__/student-ask-tablet-layout.test.ts
git commit -m "feat: 학생 참고자료에 성취기준 영역 표시"
```

### Task 5: 김질문 체험 자료 보강

**Files:**
- Modify: `scripts/seed-usb-demo.mjs`
- Modify: `src/__tests__/demo-seed.test.ts`

**Interfaces:**
- Produces: 모든 `DEMO_UNIT_DESIGN_BLUEPRINTS` 항목의 `achievements`
- Produces: 모든 체험 `learningGuides.achievements`

- [ ] **Step 1: 모든 체험 설계에 성취기준과 설명이 있어야 한다는 실패 검사를 작성한다**

```ts
for (const design of DEMO_UNIT_DESIGN_BLUEPRINTS) {
  expect(design.achievements.length).toBeGreaterThan(0);
  expect(design.learningGuides.achievements).toHaveLength(design.achievements.length);
  expect(design.learningGuides.achievements.every((guide, index) =>
    guide.index === index && guide.explanation.trim()
  )).toBe(true);
}
```

- [ ] **Step 2: 체험 자료 검사를 실행해 성취기준이 없어 실패하는지 확인한다**

Run: `npm test -- src/__tests__/demo-seed.test.ts`

Expected: 체험 설계에 `achievements`가 없어 실패한다.

- [ ] **Step 3: 체험 도움 함수와 여섯 설계의 성취기준을 추가한다**

`learningGuide`는 `achievementExplanations`를 받아 번호가 있는 설명 배열로 변환한다. 체험 설계에는 다음 기준을 사용한다.

| 설계 | 성취기준 |
| --- | --- |
| 주장과 근거 | `[4국02-05] 글이나 자료의 출처가 믿을 만한지 판단한다.` |
| 지역 문제 | `[4사09-01] 생활 주변의 문제를 파악하고 합리적으로 해결한다.` |
| 물의 세 가지 상태 | `[4과10-01] 물이 세 가지 상태로 변할 수 있음을 알고 주변의 예를 찾는다.` |
| 표와 그래프 | `[4수04-03] 자료를 수집하고 그래프로 나타내어 해석한다.` |
| 온도와 상태 변화 | `[4과10-02] 물의 상태가 변할 때 나타나는 모습을 관찰한다.` |
| 환경을 생각하는 선택 | `[4사07-01] 자원이 한정되어 있어 선택이 필요함을 이해하고 합리적인 선택 방법을 찾는다.` |

각 쉬운 설명은 해당 수업에서 학생이 무엇을 알아보고 할 수 있어야 하는지 한 문장으로 작성한다. `tx.unitDesign.create`에는 `achievements: design.achievements`를 전달한다.

- [ ] **Step 4: Task 5 검사를 다시 실행해 통과하는지 확인한다**

Run: `npm test -- src/__tests__/demo-seed.test.ts`

Expected: 검사가 통과한다.

- [ ] **Step 5: Task 5를 커밋한다**

```bash
git add scripts/seed-usb-demo.mjs src/__tests__/demo-seed.test.ts
git commit -m "feat: 김질문 참고자료에 성취기준 추가"
```

### Task 6: 전체 검증, 기본 가지 병합, 운영 배포

**Files:**
- Verify: all modified files
- Merge target: `main`
- Deploy target: `https://questioning-based-inquiry.vercel.app`

**Interfaces:**
- Consumes: Tasks 1 through 5
- Produces: 운영 사이트에서 확인 가능한 학생 성취기준 참고자료

- [ ] **Step 1: 전체 자동 검사를 실행한다**

Run: `npm test`

Expected: 모든 검사 파일과 검사가 통과한다.

- [ ] **Step 2: 코드 검사와 운영 빌드를 실행한다**

Run: `npm run lint`

Expected: 종료값 0

Run: `npm run build`

Expected: 데이터베이스 구조 검사와 Next.js 운영 빌드가 모두 통과한다.

- [ ] **Step 3: 작업 가지 상태와 차이를 확인한다**

Run: `git status --short --branch`

Expected: 추적 파일 변경이 없고 작업 가지가 깨끗하다.

Run: `git diff main...HEAD --check`

Expected: 출력 없이 종료값 0

- [ ] **Step 4: 작업 가지를 원격에 올린다**

```bash
git push -u origin fix/student-question-analysis-retry
```

- [ ] **Step 5: 기본 가지를 최신화하고 작업 가지를 병합한다**

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git merge --no-ff fix/student-question-analysis-retry -m "merge: 학생 성취기준 참고자료 추가"
```

병합 충돌이 있으면 관련 파일의 최신 기본 가지 동작과 승인된 설계를 함께 유지하고 전체 검사를 다시 실행한다.

- [ ] **Step 6: 기본 가지를 원격에 올린다**

```bash
git push origin main
```

로컬 `main`과 `refs/heads/main`의 원격 커밋 값이 같은지 확인한다.

- [ ] **Step 7: 운영 배포를 수행하고 완료 상태를 확인한다**

Run: `npx vercel --prod`

Expected: 운영 별칭이 `https://questioning-based-inquiry.vercel.app`에 연결되고 배포 상태가 준비 완료가 된다.

- [ ] **Step 8: 운영 김질문 체험 자료를 다시 만든다**

Run: `npm run demo:seed`

Expected: 여섯 참고자료가 다시 만들어지고 성취기준과 설명이 저장된다. 실행 전에 연결된 데이터베이스가 운영 대상인지 확인한다.

- [ ] **Step 9: 운영 화면을 실제로 확인한다**

김질문 체험 학생으로 들어가 오늘 질문수업을 선택하고 참고자료를 펼친다. 다음을 확인한다.

```text
핵심 아이디어
성취기준
[4과10-02]
쉽게 풀어보기
핵심 문장
핵심 질문
탐구 질문
```

브라우저 요청에서 `/api/sessions/usb-demo-session-today/design-context`가 200을 반환하고 응답의 `achievements`와 `learningGuides.achievements`가 비어 있지 않아야 한다.

- [ ] **Step 10: 배포 결과를 기록한다**

최종 보고에는 작업 가지 커밋, 기본 가지 병합 커밋, 원격 일치 여부, 전체 검사 수, 운영 배포 주소, 김질문 화면 확인 결과를 포함한다.

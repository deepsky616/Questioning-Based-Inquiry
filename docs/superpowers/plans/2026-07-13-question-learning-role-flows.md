# 역할별 질문학습 흐름과 연습 진단 구현 계획

> **에이전트 작업자 필수 하위 기술:** 각 구현 작업은 `superpowers:subagent-driven-development`를 사용하고 통합 검증은 `superpowers:executing-plans`로 실행한다. 모든 단계는 확인 상자(`- [ ]`)로 추적한다.

**목표:** 공통 14장 질문학습을 유지하면서 학생은 연습과 실제 질문 작성으로, 교사는 수업 활용과 학급 진단으로 이어지게 한다.

**구조:** 공통 슬라이드에는 역할별 완료 행동만 주입하고, 교사용 활용 자료는 별도 읽기 전용 구성요소로 둔다. 질문 초안은 학생별 임시 저장소를 거쳐 한 번만 전달한다. 진단은 새 데이터 표 없이 기존 연습 시도를 순수 집계 함수로 바꿔 학생 개인 조회와 교사 학급 조회가 함께 사용한다.

**기술 구성:** Next.js 16, React 19, TypeScript, next-intl, TanStack Query, Prisma 5, PostgreSQL, Vitest, Testing Library, Playwright

## 전체 제약

- 학생과 교사는 같은 14장 핵심 학습 자료를 사용한다.
- 학생과 교사의 역할 차이는 완료 행동, 교사용 수업 활용과 진단 화면에만 둔다.
- 데이터베이스 스키마, 마이그레이션, 기존 질문, 포인트와 연습 시도 기록 방식을 바꾸지 않는다.
- 임시 초안은 학생별 키, 작성 학생, 형식 버전, 200자와 30분 유효 시간을 검증하고 한 번 읽은 뒤 삭제한다.
- 현재 질문이 마지막 분석 본문과 다르면 예전 분류 결과로 저장하지 않는다.
- 진단 기간은 최근 30일이고 학생당 최근 100개를 상한으로 둔다.
- 같은 서울 날짜의 같은 문항, 모드와 퀴즈 축 반복 시도는 가장 최근 결과 하나만 진단에 반영한다.
- 유형별 진단은 고정된 내장 문항만 사용하고 교사 문항과 인공지능 실시간 문항은 제외한다.
- `quizType=closure` 결과는 닫힌·열린 축에만, `quizType=cognitive` 결과는 사실적·개념적·논쟁적 축에만 반영한다.
- 학생 순위, 과제 배정과 권한 경계 전면 보완은 이번 범위에서 제외한다.
- 한국어와 영어 화면 문구를 함께 추가한다.
- 작은 화면에서 표 대신 세로 행을 사용하고, 탭·펼침·초점 복귀와 움직임 감소 설정을 지킨다.

---

## 1단계: 학습, 연습, 실제 질문 작성 연결

### 작업 1: 역할별 질문학습 완료 행동과 교사용 수업 활용

**파일:**
- 생성: `src/lib/question-teaching-guide-data.ts`
- 생성: `src/components/teacher/TeacherQuestionLearningGuide.tsx`
- 수정: `src/components/shared/QuestionLearningExperience.tsx`
- 수정: `src/components/shared/QuestionDetectiveSlides.tsx`
- 수정: `src/components/shared/QuestionLearningSlideContent.tsx`
- 수정: `src/app/(student)/student-question-learning/page.tsx`
- 수정: `src/app/(teacher)/teacher-question-learning/page.tsx`
- 수정: `messages/ko.json`
- 수정: `messages/en.json`
- 시험: `src/__tests__/question-learning.render.test.tsx`
- 시험: `src/__tests__/question-learning-architecture.test.ts`
- 생성 시험: `src/__tests__/question-teaching-guide-data.test.ts`

**경계:**
- 입력: `audience: "student" | "teacher"`
- 출력: `QuestionLearningExperience`가 역할별 보기와 완료 행동을 조합한다.
- 출력: `QuestionDetectiveSlides`는 `completionActions?: ReactNode`만 받고 역할 경로를 모른다.
- 출력: `QUESTION_TEACHING_GUIDE`는 여섯 항목과 네 개의 확정 문구 필드를 제공한다.

- [ ] **단계 1: 역할별 경계와 교사용 자료의 실패 시험 작성**

```ts
it("학생과 교사 학습 페이지가 역할을 명시한다", () => {
  expect(studentLearning).toContain('audience="student"');
  expect(teacherLearning).toContain('audience="teacher"');
  expect(slideContent).not.toContain("student-practice");
  expect(slideContent).not.toContain("teacher-practice");
});
```

```ts
import { describe, expect, it } from "vitest";
import { QUESTION_TEACHING_GUIDE } from "@/lib/question-teaching-guide-data";

describe("교사용 질문학습 활용 자료", () => {
  it("여섯 핵심 주제와 네 필드의 확정 문구를 제공한다", () => {
    expect(QUESTION_TEACHING_GUIDE).toHaveLength(6);
    expect(QUESTION_TEACHING_GUIDE.map((item) => item.id)).toEqual([
      "twoAxes", "openClosed", "factual", "conceptual", "controversial", "comparison",
    ]);
    expect(QUESTION_TEACHING_GUIDE.map(({ id, objective, misconception, prompt, followUp }) => ({
      id, objective, misconception, prompt, followUp,
    }))).toEqual([
      {
        id: "twoAxes",
        objective: "답의 범위와 답에 필요한 사고를 서로 다른 기준으로 분류한다.",
        misconception: "사실적 질문은 항상 닫혀 있고 논쟁적 질문은 항상 열려 있다고 생각한다. 질문의 첫 낱말만 보고 유형을 정한다.",
        prompt: "이 질문은 답의 범위와 답에 필요한 사고를 각각 어떻게 분류할 수 있을까요?",
        followUp: "두 기준 가운데 하나만 바꾸려면 질문과 근거가 어떻게 달라져야 할까요?",
      },
      {
        id: "openClosed",
        objective: "받아들일 수 있는 답의 범위를 판단하고 사고의 깊이와 분리한다.",
        misconception: "왜, 어떻게가 있으면 모두 열린 질문이라고 생각한다. 닫힌 질문은 언제나 단순하다고 생각한다.",
        prompt: "이 질문의 답은 자료에서 하나로 확인되나요, 여러 근거 있는 답이 가능한가요?",
        followUp: "답이 여러 개라면 아무 답이나 가능한가요? 좋은 답에 필요한 근거는 무엇인가요?",
      },
      {
        id: "factual",
        objective: "기억, 관찰, 조사, 계산이나 정해진 절차로 확인할 정보를 묻는다.",
        misconception: "사실적 질문은 답이 반드시 하나라고 생각한다. 어떻게와 왜가 들어가면 사실적 질문이 아니라고 생각한다.",
        prompt: "이 질문에 답하려면 어떤 자료, 관찰, 계산이나 절차가 필요한가요?",
        followUp: "답을 확인한 사람이 같은 방법으로 다시 확인할 수 있나요?",
      },
      {
        id: "conceptual",
        objective: "여러 사실을 연결해 관계, 원리, 의미와 영향을 설명한다.",
        misconception: "왜가 들어간 모든 질문을 개념적 질문으로 분류한다. 근거 없는 느낌이나 의견도 개념적 설명이라고 생각한다.",
        prompt: "따로 알고 있는 어떤 사실들을 연결해야 이 질문에 답할 수 있나요?",
        followUp: "한 사실만 외워서 답할 수 있나요? 어떤 관계를 설명해야 하나요?",
      },
      {
        id: "controversial",
        objective: "충돌하는 가치, 선택과 책임을 근거로 비교해 판단한다.",
        misconception: "사람마다 답이 다르면 모두 논쟁적 질문이라고 생각한다. 토론을 상대를 이기는 활동으로 생각한다.",
        prompt: "이 선택에서 서로 부딪히는 가치와 책임은 무엇인가요?",
        followUp: "반대 입장에서 가장 강한 근거는 무엇이며, 어떤 조건에서 판단이 달라질 수 있나요?",
      },
      {
        id: "comparison",
        objective: "같은 질문 낱말을 써도 필요한 사고와 근거에 따라 유형이 달라짐을 설명한다.",
        misconception: "대표 낱말 목록을 정답표처럼 외우고 질문 전체가 요구하는 사고를 보지 않는다.",
        prompt: "세 질문이 모두 어떻게로 시작해도 서로 다른 유형인 까닭은 무엇인가요?",
        followUp: "한 질문을 다른 유형으로 바꾸려면 답에 필요한 사고와 근거를 어떻게 바꿔야 하나요?",
      },
    ]);
  });
});
```

- [ ] **단계 2: 실패 확인**

```bash
npm test -- src/__tests__/question-learning-architecture.test.ts src/__tests__/question-teaching-guide-data.test.ts
```

예상: 역할 속성, 새 자료 파일과 완료 행동이 없어 실패한다.

- [ ] **단계 3: 교사용 자료와 역할별 경험 구현**

```ts
export interface QuestionTeachingGuideItem {
  id: "twoAxes" | "openClosed" | "factual" | "conceptual" | "controversial" | "comparison";
  title: string;
  objective: string;
  misconception: string;
  prompt: string;
  followUp: string;
  focus: "closed" | "open" | "factual" | "conceptual" | "controversial" | null;
}

export const QUESTION_TEACHING_GUIDE: readonly QuestionTeachingGuideItem[] = [
  {
    id: "twoAxes",
    title: "질문의 두 분류 축",
    objective: "답의 범위와 답에 필요한 사고를 서로 다른 기준으로 분류한다.",
    misconception: "사실적 질문은 항상 닫혀 있고 논쟁적 질문은 항상 열려 있다고 생각한다. 질문의 첫 낱말만 보고 유형을 정한다.",
    prompt: "이 질문은 답의 범위와 답에 필요한 사고를 각각 어떻게 분류할 수 있을까요?",
    followUp: "두 기준 가운데 하나만 바꾸려면 질문과 근거가 어떻게 달라져야 할까요?",
    focus: null,
  },
];
```

나머지 다섯 항목은 설계 문서의 확정 문구를 그대로 넣는다.

```tsx
export function QuestionDetectiveSlides({ completionActions }: { completionActions?: ReactNode }) {
  return (
    <QuestionLearningSlideContent
      completionActions={completionActions}
      slide={slide}
      typeLabel={typeLabel}
      checkNext={t("checkNext")}
      checkRestart={t("checkRestart")}
      checkIndex={checkIndex}
      checkPromptRef={checkPromptRef}
      selectedType={selectedType}
      onSelectType={setSelectedType}
      onMoveCheck={moveCheck}
    />
  );
}
```

`QuestionLearningExperience`는 `audience`와 교사 보기 상태를 받고, 교사 화면에서는 실제 탭과 패널 식별값을 사용한다. 핵심 상태 전환은 다음과 같다.

```tsx
export type QuestionLearningAudience = "student" | "teacher";

export function QuestionLearningExperience({ audience }: { audience: QuestionLearningAudience }) {
  const [teacherView, setTeacherView] = useState<"learning" | "teaching">("learning");
  const learningTabRef = useRef<HTMLButtonElement>(null);
  const teachingTabRef = useRef<HTMLButtonElement>(null);
  const teachingTitleRef = useRef<HTMLHeadingElement>(null);
  const showTeaching = () => {
    setTeacherView("teaching");
    requestAnimationFrame(() => teachingTitleRef.current?.focus());
  };
  const moveTeacherTab = (event: React.KeyboardEvent, current: "learning" | "teaching") => {
    const next = event.key === "Home" ? "learning"
      : event.key === "End" ? "teaching"
      : event.key === "ArrowLeft" || event.key === "ArrowRight"
        ? current === "learning" ? "teaching" : "learning"
        : null;
    if (!next) return;
    event.preventDefault();
    setTeacherView(next);
    requestAnimationFrame(() => (next === "learning" ? learningTabRef : teachingTabRef).current?.focus());
  };
  const actions = audience === "student" ? (
    <Button asChild><Link href="/student-practice">{t("startPractice")}</Link></Button>
  ) : (
    <div className="flex flex-wrap gap-2">
      <Button asChild><Link href="/teacher-practice">{t("tryPractice")}</Link></Button>
      <Button variant="outline" onClick={showTeaching}>{t("viewTeachingGuide")}</Button>
    </div>
  );
  return teacherView === "learning"
    ? <QuestionDetectiveSlides completionActions={actions} />
    : <TeacherQuestionLearningGuide titleRef={teachingTitleRef} onBack={() => setTeacherView("learning")} />;
}
```

교사 화면은 조건 분기 바깥에 다음 탭 계약을 실제로 렌더한다.

```tsx
<div role="tablist" aria-label={t("teacherViewsLabel")}>
  <button
    ref={learningTabRef}
    id="question-learning-view-learning"
    role="tab"
    aria-selected={teacherView === "learning"}
    aria-controls="question-learning-panel-learning"
    tabIndex={teacherView === "learning" ? 0 : -1}
    onClick={() => setTeacherView("learning")}
    onKeyDown={(event) => moveTeacherTab(event, "learning")}
  >
    {t("learningView")}
  </button>
  <button
    ref={teachingTabRef}
    id="question-learning-view-teaching"
    role="tab"
    aria-selected={teacherView === "teaching"}
    aria-controls="question-learning-panel-teaching"
    tabIndex={teacherView === "teaching" ? 0 : -1}
    onClick={() => setTeacherView("teaching")}
    onKeyDown={(event) => moveTeacherTab(event, "teaching")}
  >
    {t("teachingView")}
  </button>
</div>
<section
  id={`question-learning-panel-${teacherView}`}
  role="tabpanel"
  aria-labelledby={`question-learning-view-${teacherView}`}
>
  {teacherView === "learning"
    ? <QuestionDetectiveSlides completionActions={actions} />
    : <TeacherQuestionLearningGuide titleRef={teachingTitleRef} onBack={() => setTeacherView("learning")} />}
</section>
```

역할 페이지는 `audience="student"`와 `audience="teacher"`를 각각 넘긴다.

- [ ] **단계 4: 렌더 시험과 정적 검사**

```tsx
renderWithIntl(<QuestionLearningExperience audience="teacher" />);
fireEvent.click(screen.getByRole("tab", { name: "14 / 14" }));
expect(screen.getByRole("link", { name: "직접 연습하기" })).toHaveAttribute("href", "/teacher-practice");
fireEvent.click(screen.getByRole("button", { name: "수업 활용 보기" }));
expect(screen.getByRole("heading", { name: "수업 활용" })).toHaveFocus();
expect(screen.getAllByText("자주 생기는 혼동")).toHaveLength(6);
const teachingTab = screen.getByRole("tab", { name: "수업 활용" });
const teachingPanel = screen.getByRole("tabpanel");
expect(teachingTab).toHaveAttribute("aria-selected", "true");
expect(teachingTab).toHaveAttribute("aria-controls", teachingPanel.id);
expect(teachingPanel).toHaveAttribute("aria-labelledby", teachingTab.id);
fireEvent.keyDown(teachingTab, { key: "Home" });
const learningTab = screen.getByRole("tab", { name: "학습 내용" });
expect(learningTab).toHaveFocus();
expect(learningTab).toHaveAttribute("aria-selected", "true");
fireEvent.keyDown(learningTab, { key: "ArrowRight" });
expect(screen.getByRole("tab", { name: "수업 활용" })).toHaveFocus();
```

```bash
npm test -- src/__tests__/question-learning.render.test.tsx src/__tests__/question-learning-architecture.test.ts src/__tests__/question-teaching-guide-data.test.ts
npx eslint src/components/shared/QuestionLearningExperience.tsx src/components/shared/QuestionDetectiveSlides.tsx src/components/shared/QuestionLearningSlideContent.tsx src/components/teacher/TeacherQuestionLearningGuide.tsx src/lib/question-teaching-guide-data.ts
```

- [ ] **단계 5: 커밋**

```bash
git add src/lib/question-teaching-guide-data.ts src/components/teacher/TeacherQuestionLearningGuide.tsx src/components/shared/QuestionLearningExperience.tsx src/components/shared/QuestionDetectiveSlides.tsx src/components/shared/QuestionLearningSlideContent.tsx src/app/'(student)'/student-question-learning/page.tsx src/app/'(teacher)'/teacher-question-learning/page.tsx messages/ko.json messages/en.json src/__tests__/question-learning.render.test.tsx src/__tests__/question-learning-architecture.test.ts src/__tests__/question-teaching-guide-data.test.ts
git commit -m "feat(learning): tailor completion flows by role"
```

### 작업 2: 학생별 연습 질문 초안 전달

**파일:**
- 생성: `src/lib/practice-draft.ts`
- 수정: `src/components/shared/QuestionPracticeView.tsx`
- 수정: `src/app/(student)/student-practice/page.tsx`
- 수정: `src/app/(teacher)/teacher-practice/page.tsx`
- 수정: `src/app/(student)/student-ask/page.tsx`
- 수정: `messages/ko.json`
- 수정: `messages/en.json`
- 생성 시험: `src/__tests__/practice-draft.test.ts`
- 생성 시험: `src/__tests__/question-practice-handoff.render.test.tsx`

**경계:**
- 입력: `writePracticeDraft(storage, studentId, input, now?)`
- 출력: `consumePracticeDraft(storage, studentId, now?)`가 유효한 초안 한 개 또는 `null`을 반환하고 현재 학생 키를 삭제한다.
- 출력: `QuestionPracticeView`는 `audience`와 학생 식별값을 받아 학생 성공 결과에만 전달 행동을 보여 준다.

- [ ] **단계 1: 임시 초안 실패 시험 작성**

```ts
import { describe, expect, it } from "vitest";
import { consumePracticeDraft, practiceDraftKey, writePracticeDraft } from "@/lib/practice-draft";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

class ThrowingStorage extends MemoryStorage {
  constructor(private operation: "get" | "set" | "remove") { super(); }
  override getItem(key: string) { if (this.operation === "get") throw new Error("blocked"); return super.getItem(key); }
  override setItem(key: string, value: string) { if (this.operation === "set") throw new Error("blocked"); super.setItem(key, value); }
  override removeItem(key: string) { if (this.operation === "remove") throw new Error("blocked"); super.removeItem(key); }
}

describe("연습 질문 임시 초안", () => {
  it("현재 학생의 30분 이내 초안을 한 번만 읽는다", () => {
    const storage = new MemoryStorage();
    writePracticeDraft(storage, "s1", {
      content: "환경 보호를 위해 일회용품 사용을 제한해야 할까요?",
      mode: "create",
      target: "controversial",
    }, new Date("2026-07-13T00:00:00Z"));
    expect(consumePracticeDraft(storage, "s1", new Date("2026-07-13T00:10:00Z"))?.content).toContain("일회용품");
    expect(consumePracticeDraft(storage, "s1", new Date("2026-07-13T00:10:01Z"))).toBeNull();
  });

  it("다른 학생과 30분이 지난 초안을 거부한다", () => {
    const storage = new MemoryStorage();
    writePracticeDraft(storage, "s1", { content: "질문입니다", mode: "transform", target: "open" }, new Date("2026-07-13T00:00:00Z"));
    expect(consumePracticeDraft(storage, "s2", new Date("2026-07-13T00:01:00Z"))).toBeNull();
    expect(consumePracticeDraft(storage, "s1", new Date("2026-07-13T00:31:00Z"))).toBeNull();
  });

  it.each([
    ["작성 학생 불일치", { version: 1, studentId: "s2", createdAt: "2026-07-13T00:00:00Z", content: "질문입니다", mode: "create", target: "conceptual" }],
    ["지원하지 않는 버전", { version: 2, studentId: "s1", createdAt: "2026-07-13T00:00:00Z", content: "질문입니다", mode: "create", target: "conceptual" }],
    ["미래 생성 시각", { version: 1, studentId: "s1", createdAt: "2026-07-13T00:02:00Z", content: "질문입니다", mode: "create", target: "conceptual" }],
    ["200자 초과", { version: 1, studentId: "s1", createdAt: "2026-07-13T00:00:00Z", content: "가".repeat(201), mode: "create", target: "conceptual" }],
  ])("%s 값을 거부하고 현재 키를 지운다", (_name, value) => {
    const storage = new MemoryStorage();
    storage.setItem(practiceDraftKey("s1"), JSON.stringify(value));
    expect(consumePracticeDraft(storage, "s1", new Date("2026-07-13T00:01:00Z"))).toBeNull();
    expect(storage.getItem(practiceDraftKey("s1"))).toBeNull();
  });

  it("잘못된 JSON을 거부하고 현재 키를 지운다", () => {
    const storage = new MemoryStorage();
    storage.setItem(practiceDraftKey("s1"), "{");
    expect(consumePracticeDraft(storage, "s1", new Date("2026-07-13T00:01:00Z"))).toBeNull();
    expect(storage.getItem(practiceDraftKey("s1"))).toBeNull();
  });

  it("임시 저장소가 차단되어도 예외를 밖으로 내보내지 않는다", () => {
    const input = { content: "질문입니다", mode: "create", target: "conceptual" } as const;
    expect(writePracticeDraft(new ThrowingStorage("set"), "s1", input)).toBe(false);
    expect(consumePracticeDraft(new ThrowingStorage("get"), "s1")).toBeNull();
    const removeBlocked = new ThrowingStorage("remove");
    MemoryStorage.prototype.setItem.call(removeBlocked, practiceDraftKey("s1"), JSON.stringify({
      version: 1, studentId: "s1", createdAt: new Date().toISOString(), ...input,
    }));
    expect(consumePracticeDraft(removeBlocked, "s1")).toBeNull();
  });
});
```

- [ ] **단계 2: 실패 확인**

```bash
npm test -- src/__tests__/practice-draft.test.ts
```

예상: `practice-draft` 모듈이 없어 실패한다.

- [ ] **단계 3: 학생별 초안 저장 구현**

```ts
const DRAFT_VERSION = 1;
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_LENGTH = 200;
const KEY_PREFIX = "question-lab:practice-draft";

export interface PracticeDraftInput {
  content: string;
  mode: "transform" | "create";
  target: "open" | "conceptual" | "controversial";
}

interface StoredPracticeDraft extends PracticeDraftInput {
  version: typeof DRAFT_VERSION;
  studentId: string;
  createdAt: string;
}

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const practiceDraftKey = (studentId: string) => `${KEY_PREFIX}:${studentId}`;

export function writePracticeDraft(storage: DraftStorage, studentId: string, input: PracticeDraftInput, now = new Date()) {
  const content = input.content.trim().slice(0, MAX_LENGTH);
  if (!studentId || !content) return false;
  const value: StoredPracticeDraft = { version: DRAFT_VERSION, studentId, createdAt: now.toISOString(), ...input, content };
  try {
    storage.setItem(practiceDraftKey(studentId), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
```

`consumePracticeDraft`는 현재 학생 키를 읽고 먼저 삭제한다. `getItem`이나 `removeItem`이 실패하면 예외를 내보내지 않고 `null`을 반환한다. 그 뒤 JSON 형식, 버전, 작성 학생, 허용 모드와 목표, 1~200자, 유효한 생성 시각을 확인한 뒤에만 반환한다. 생성 시각과 현재 시각의 차이는 `0` 이상 30분 이하여야 하므로 미래 값도 거부하며, 파싱 실패도 `null`로 처리한다. 저장 실패 때 `useQuestionInClass`는 입력을 그대로 유지하고 `draftSaveFailed`를 같은 화면에 표시한다.

- [ ] **단계 4: 연습 성공 행동과 질문하기 소비 구현**

```ts
interface QuestionPracticeViewProps {
  audience: "student" | "teacher";
  studentId?: string;
}
```

```tsx
const useQuestionInClass = () => {
  if (audience !== "student" || !studentId) return;
  const saved = writePracticeDraft(window.sessionStorage, studentId, {
    content: input,
    mode: tab === "transform" ? "transform" : "create",
    target: activeTarget,
  });
  if (!saved) {
    setCheckError(t("draftSaveFailed"));
    return;
  }
  router.push("/student-ask?draft=practice");
};
```

학생 연습 페이지는 `useSession`과 `getSessionUser`로 학생 식별값을 넘기고 교사 페이지는 `audience="teacher"`만 넘긴다. 학생 질문하기는 다음처럼 한 번 소비한다.

```tsx
const draftAppliedRef = useRef(false);
useEffect(() => {
  if (!user.id || draftAppliedRef.current || searchParams.get("draft") !== "practice") return;
  draftAppliedRef.current = true;
  const draft = consumePracticeDraft(window.sessionStorage, user.id);
  if (!draft) return;
  setContent(draft.content);
  setDraftAnnouncement(t("practiceDraftLoaded"));
  requestAnimationFrame(() => textareaRef.current?.focus());
}, [searchParams, t, user.id]);
```

- [ ] **단계 5: 렌더 시험과 정적 검사**

`question-practice-handoff.render.test.tsx`는 학생 성공 결과에만 `이 질문으로 질문하기`가 나타나고 교사와 분류 퀴즈에는 없음을 확인한다. `sessionStorage`와 `router.push`를 가짜 구현으로 바꾸고 저장값에 현재 학생 식별값이 들어가는지 단언한다.

```bash
npm test -- src/__tests__/practice-draft.test.ts src/__tests__/question-practice-handoff.render.test.tsx
npx eslint src/lib/practice-draft.ts src/components/shared/QuestionPracticeView.tsx src/app/'(student)'/student-practice/page.tsx src/app/'(teacher)'/teacher-practice/page.tsx src/app/'(student)'/student-ask/page.tsx
```

- [ ] **단계 6: 커밋**

```bash
git add src/lib/practice-draft.ts src/components/shared/QuestionPracticeView.tsx src/app/'(student)'/student-practice/page.tsx src/app/'(teacher)'/teacher-practice/page.tsx src/app/'(student)'/student-ask/page.tsx messages/ko.json messages/en.json src/__tests__/practice-draft.test.ts src/__tests__/question-practice-handoff.render.test.tsx
git commit -m "feat(practice): hand student questions into class sessions"
```

### 작업 3: 피드백을 유지하는 안전한 다시 쓰기

**파일:**
- 생성: `src/lib/student-ask-analysis.ts`
- 수정: `src/app/(student)/student-ask/page.tsx`
- 수정: `src/app/(student)/student-ask/StudentAskInputCard.tsx`
- 수정: `src/app/(student)/student-ask/StudentAskResultCard.tsx`
- 수정: `messages/ko.json`
- 수정: `messages/en.json`
- 생성 시험: `src/__tests__/student-ask-analysis.test.ts`
- 생성 시험: `src/__tests__/student-ask-result.render.test.tsx`

**경계:**
- 입력: 현재 질문과 마지막 분석 묶음
- 출력: `isAnalysisCurrent(content, snapshot)`이 저장 가능 여부를 한곳에서 결정한다.
- 출력: 이전 결과는 참고용으로 유지하되 현재 질문이 달라지면 저장 행동을 막는다.

- [ ] **단계 1: 저장 일관성 실패 시험 작성**

```ts
import { describe, expect, it } from "vitest";
import { isAnalysisCurrent } from "@/lib/student-ask-analysis";

describe("질문 분석 묶음", () => {
  const snapshot = { content: "왜 비가 올까요?", result: { cognitive: "conceptual" } } as const;
  it("현재 질문과 분석 당시 질문이 같을 때만 저장할 수 있다", () => {
    expect(isAnalysisCurrent(" 왜 비가 올까요? ", snapshot)).toBe(true);
    expect(isAnalysisCurrent("비는 어떻게 만들어질까요?", snapshot)).toBe(false);
    expect(isAnalysisCurrent("", snapshot)).toBe(false);
  });
});
```

- [ ] **단계 2: 실패 확인과 최소 도우미 구현**

```bash
npm test -- src/__tests__/student-ask-analysis.test.ts
```

```ts
export interface AnalysisSnapshot<T> {
  content: string;
  result: T;
}

export function isAnalysisCurrent<T>(content: string, snapshot: AnalysisSnapshot<T> | null) {
  const normalized = content.trim();
  return Boolean(normalized && snapshot && snapshot.content === normalized);
}
```

- [ ] **단계 3: 질문하기 상태를 분석 묶음으로 전환**

```tsx
const [analysis, setAnalysis] = useState<AnalysisSnapshot<ClassificationResult> | null>(null);
const result = analysis?.result ?? null;
const analysisCurrent = isAnalysisCurrent(content, analysis);

const handleClassify = async () => {
  const normalized = content.trim();
  if (!canAsk) return;
  if (!normalized) {
    toast({ variant: "destructive", description: t("enterQuestion") });
    return;
  }
  setIsLoading(true);
  try {
    const response = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: normalized }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || t("classifyFailed"));
    setAnalysis({ content: normalized, result: data });
  } catch (error) {
    toast({
      variant: "destructive",
      description: error instanceof Error ? error.message : t("classifyError"),
    });
  } finally {
    setIsLoading(false);
  }
};

const handleSave = async () => {
  if (!canAsk || !analysis || !isAnalysisCurrent(content, analysis)) {
    toast({ variant: "destructive", description: t("reanalyzeBeforeSave") });
    return;
  }
  setIsSaving(true);
  try {
    const response = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: analysis.content,
        closure: analysis.result.closure,
        cognitive: analysis.result.cognitive,
        closureScore: analysis.result.closureScore,
        cognitiveScore: analysis.result.cognitiveScore,
        sessionId: selectedSessionId,
        flagged: analysis.result.inappropriate ?? false,
        flagReason: analysis.result.inappropriateReason ?? "",
      }),
    });
    if (!response.ok) throw new Error(t("saveFailed"));
    const saved = await response.json().catch(() => null);
    setExistingQuestion({ id: typeof saved?.id === "string" ? saved.id : "saved", content: analysis.content });
    setQuestionSessionIds((current) => new Set(current).add(selectedSessionId));
    setSaveComplete(true);
  } catch {
    toast({ variant: "destructive", description: t("saveError") });
  } finally {
    setIsSaving(false);
  }
};
```

기존 함수 안의 실제 `fetch`는 유지하고 상태 설정과 저장 전 조건만 위 계약으로 바꾼다. `다시 쓰기`는 내용을 지우지 않고 입력으로 초점을 돌린다. `예시를 초안으로 사용`은 개선 예시를 200자로 제한해 입력에 넣고 저장을 막은 상태로 만든다.

- [ ] **단계 4: 결과 화면 상태 시험 작성**

```tsx
renderWithIntl(
  <StudentAskResultCard
    result={result}
    analyzedContent="왜 비가 올까요?"
    analysisCurrent={false}
    saveComplete={false}
    isSaving={false}
    onRewrite={onRewrite}
    onUseImprovedExample={onUseImprovedExample}
    onSave={onSave}
  />,
);
expect(screen.getByText("수정한 질문을 다시 분석해 주세요.")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "질문 저장" })).toBeDisabled();
fireEvent.click(screen.getByRole("button", { name: "예시를 초안으로 사용" }));
expect(onUseImprovedExample).toHaveBeenCalledWith(result.improvedExample);
```

- [ ] **단계 5: 집중 검증과 커밋**

```bash
npm test -- src/__tests__/student-ask-analysis.test.ts src/__tests__/student-ask-result.render.test.tsx src/__tests__/student-ask-tablet-layout.test.ts
npx eslint src/lib/student-ask-analysis.ts src/app/'(student)'/student-ask/page.tsx src/app/'(student)'/student-ask/StudentAskInputCard.tsx src/app/'(student)'/student-ask/StudentAskResultCard.tsx
git diff --check
git add src/lib/student-ask-analysis.ts src/app/'(student)'/student-ask/page.tsx src/app/'(student)'/student-ask/StudentAskInputCard.tsx src/app/'(student)'/student-ask/StudentAskResultCard.tsx messages/ko.json messages/en.json src/__tests__/student-ask-analysis.test.ts src/__tests__/student-ask-result.render.test.tsx
git commit -m "fix(ask): preserve feedback through question rewrites"
```

### 작업 4: 1단계 통합 검증

**파일:**
- 생성 시험: `e2e/question-learning-flow.spec.ts`
- 수정: `e2e/helpers/test-db.ts`

**경계:**
- 학생: 학습 마지막 장에서 연습 성공과 실제 질문 초안으로 이동한다.
- 교사: 학습 내용에서 수업 활용과 직접 연습으로 이동한다.

- [ ] **단계 1: 학생과 교사 전체 흐름 시험 작성**

학생 시험은 기존 합성 학생과 활성 수업 세션을 사용한다. 연습 은행은 빈 추가 은행, 연습 판정은 목표 달성 응답으로 가로채 실제 인공지능 호출을 막는다.

```ts
await page.route("**/api/practice/bank", (route) => route.fulfill({ json: { quiz: [], transform: [], create: [] } }));
await page.route("**/api/points/practice", (route) => route.fulfill({ json: {
  classification: { closure: "open", cognitive: "conceptual", reasoning: "관계를 설명합니다." },
  achieved: true,
  awarded: 3,
} }));
await page.goto("/student-question-learning");
await page.getByRole("tab", { name: "14 / 14" }).click();
await page.getByRole("link", { name: "질문연습 시작" }).click();
await page.getByRole("tab", { name: "질문 만들기" }).click();
await page.getByRole("textbox").fill("숲이 줄어들면 지역의 기후에는 어떤 영향을 줄까요?");
await page.getByRole("button", { name: "확인하기" }).click();
await page.getByRole("button", { name: "이 질문으로 질문하기" }).click();
await expect(page).toHaveURL(/student-ask\?draft=practice/);
await expect(page.locator("#content")).toHaveValue("숲이 줄어들면 지역의 기후에는 어떤 영향을 줄까요?");
```

교사 시험은 `수업 활용 보기` 뒤 제목 초점, 여섯 활용 항목과 직접 연습 이동을 확인한다.

- [ ] **단계 2: 브라우저 검증과 1단계 전체 검증**

```bash
npx playwright test e2e/question-learning-flow.spec.ts --project=chromium --project=tablet
npm test
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

예상: 학생과 교사 흐름, 전체 단위 시험, 린트, 형 검사, 데이터베이스 검사와 운영 빌드가 모두 통과한다. 이 검증 전에는 2단계를 시작하지 않는다.

- [ ] **단계 3: 시험 커밋**

```bash
git add e2e/question-learning-flow.spec.ts e2e/helpers/test-db.ts
git commit -m "test(learning): cover role-based question flows"
```

---

## 2단계: 기존 시도를 이용한 학생과 교사 진단

### 작업 5: 진단 집계와 추천 순수 함수

**파일:**
- 생성: `src/lib/practice-diagnostics.ts`
- 생성 시험: `src/__tests__/practice-diagnostics.test.ts`

**경계:**
- 입력: 최근 30일, 학생당 최대 100개의 `PracticeAttemptInput[]`
- 출력: 활동 시도, 중복을 줄인 진단 시도, 모드별 지표, 다섯 유형 지표와 추천 한 개
- 출력: `practiceSelectionForRecommendation`이 화면에서 허용할 탭, 축과 문항 제한을 반환한다.

- [ ] **단계 1: 유형 축 오염과 반복 시도의 실패 시험 작성**

```ts
import { describe, expect, it } from "vitest";
import { buildPracticeDiagnostic, type PracticeAttemptInput } from "@/lib/practice-diagnostics";

const attempt = (overrides: Partial<PracticeAttemptInput>): PracticeAttemptInput => ({
  id: "base",
  studentId: "s1",
  mode: "quiz",
  itemId: "q01",
  quizType: "closure",
  correct: true,
  createdAt: new Date("2026-07-13T01:00:00Z"),
  ...overrides,
});

it("퀴즈 정오는 실제로 물은 축 하나에만 반영한다", () => {
  const result = buildPracticeDiagnostic([
    attempt({ id: "a1", quizType: "closure", correct: false }),
    attempt({ id: "a2", quizType: "cognitive", correct: true, createdAt: new Date("2026-07-13T02:00:00Z") }),
  ]);
  expect(result.types.closed).toMatchObject({ attempts: 1, correct: 0 });
  expect(result.types.factual).toMatchObject({ attempts: 1, correct: 1 });
});

it("같은 서울 날짜의 같은 문항과 축은 가장 최근 결과만 진단한다", () => {
  const result = buildPracticeDiagnostic([
    attempt({ id: "old", correct: false, createdAt: new Date("2026-07-13T00:00:00Z") }),
    attempt({ id: "new", correct: true, createdAt: new Date("2026-07-13T03:00:00Z") }),
  ]);
  expect(result.activityAttempts).toBe(2);
  expect(result.diagnosticAttempts).toBe(1);
  expect(result.overall).toMatchObject({ attempts: 1, correct: 1, accuracy: 100 });
});
```

교사 문항 식별값과 `itemId=null` 인공지능 문항이 유형 지표에 들어가지 않는 시험도 추가한다.

- [ ] **단계 2: 실패 확인과 형식 구현**

```bash
npm test -- src/__tests__/practice-diagnostics.test.ts
```

```ts
export type PracticeFocus = "closed" | "open" | "factual" | "conceptual" | "controversial";

export interface PracticeAttemptInput {
  id: string;
  studentId: string;
  mode: string;
  itemId: string | null;
  quizType: string | null;
  correct: boolean;
  createdAt: Date;
}

export interface AccuracyMetric {
  attempts: number;
  correct: number;
  accuracy: number | null;
}

export interface PracticeDiagnostic {
  activityAttempts: number;
  diagnosticAttempts: number;
  overall: AccuracyMetric;
  modes: Record<"quiz" | "transform" | "create", AccuracyMetric>;
  types: Record<PracticeFocus, AccuracyMetric>;
  unknownTypeAttempts: number;
  recommendation: PracticeRecommendation;
}

export type PracticeRecommendation =
  | { kind: "collect"; tab: "quiz"; quizMode: "cognitive"; focus: null }
  | { kind: "focus"; tab: "quiz"; quizMode: "closure" | "cognitive"; focus: PracticeFocus }
  | { kind: "advance"; tab: "transform"; quizMode: null; focus: null };
```

- [ ] **단계 3: 중복 제거, 지표와 추천 구현**

구현 순서를 다음으로 고정한다.

1. 최신 시도부터 정렬한다.
2. 서울 날짜, 학생, 모드, 문항 식별값 또는 `ai`, 퀴즈 축을 중복 키로 만든다.
3. 중복 키마다 가장 최근 하나만 진단 시도로 남긴다.
4. 전체 및 모드 지표는 모든 진단 시도를 사용한다. `transform-ai`는 `transform`, `create-ai`는 `create`로 묶는다.
5. 유형 지표는 내장 `PRACTICE_QUIZ_BANK`과 `PRACTICE_TRANSFORM_BANK` 식별값만 사용한다.
6. 퀴즈는 `quizType` 축 하나만, 바꾸기는 문항 목표 하나만 반영한다.
7. 설계의 표본 3개, 80퍼센트와 동률 순서로 추천을 만든다.

- [ ] **단계 4: 일곱 추천 이동 시험과 구현**

```ts
expect(practiceSelectionForRecommendation({ kind: "focus", tab: "quiz", quizMode: "closure", focus: "open" })).toEqual({
  tab: "quiz", quizMode: "closure", focus: "open",
});
expect(practiceSelectionForRecommendation({ kind: "advance", tab: "transform", quizMode: null, focus: null })).toEqual({
  tab: "transform", quizMode: "cognitive", focus: null,
});
```

자료 없음, 다섯 유형 각각과 전체 숙달의 일곱 결과를 모두 단언한다.

- [ ] **단계 5: 집중 검증과 커밋**

```bash
npm test -- src/__tests__/practice-diagnostics.test.ts
npx eslint src/lib/practice-diagnostics.ts src/__tests__/practice-diagnostics.test.ts
git diff --check
git add src/lib/practice-diagnostics.ts src/__tests__/practice-diagnostics.test.ts
git commit -m "feat(practice): derive mastery from recent attempts"
```

### 작업 6: 학생 개인 진단과 맞춤 연습 이동

**파일:**
- 생성: `src/lib/practice-selection.ts`
- 생성: `src/app/api/practice/progress/route.ts`
- 생성: `src/components/student/PracticeProgressSummary.tsx`
- 수정: `src/app/(student)/student-practice/page.tsx`
- 수정: `src/app/(teacher)/teacher-practice/page.tsx`
- 수정: `src/components/shared/QuestionPracticeView.tsx`
- 수정: `messages/ko.json`
- 수정: `messages/en.json`
- 생성 시험: `src/__tests__/practice-progress-route.test.ts`
- 생성 시험: `src/__tests__/practice-progress-summary.render.test.tsx`
- 생성 시험: `src/__tests__/practice-selection.test.ts`
- 수정 시험: `src/__tests__/question-practice-data.test.ts`

**경계:**
- 학생 본인의 최근 30일 시도 101개를 읽어 100개만 진단하고 `capped`를 반환한다.
- 진단 띠의 추천 링크는 허용된 `tab`, `quizMode`, `focus`만 사용한다.
- 질문연습은 추천 문항 묶음이 비면 전체 문항으로 안전하게 돌아간다.

- [ ] **단계 1: 학생 본인 범위와 상한 실패 시험 작성**

```ts
vi.mock("@/lib/db", () => ({ prisma: { practiceAttempt: { findMany: vi.fn() } } }));

it("학생 본인의 최근 30일 시도 101개를 요청하고 100개만 진단한다", async () => {
  mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
  mFindMany.mockResolvedValue(makeAttempts(101));
  const data = await (await GET()).json();
  expect(mFindMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { studentId: "s1", createdAt: { gte: expect.any(Date) } },
    orderBy: { createdAt: "desc" },
    take: 101,
  }));
  expect(data.capped).toBe(true);
  expect(data.activityAttempts).toBe(100);
});
```

비로그인 401과 교사 403도 추가한다.

- [ ] **단계 2: 실패 확인과 조회 경로 구현**

```bash
npm test -- src/__tests__/practice-progress-route.test.ts
```

```ts
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const thirtyDaysAgo = (now = new Date()) => new Date(now.getTime() - THIRTY_DAYS_MS);

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  if (session.user.role !== "STUDENT") return NextResponse.json({ error: "학생만 접근할 수 있습니다" }, { status: 403 });
  const studentId = session.user.id;
  const attempts = await prisma.practiceAttempt.findMany({
    where: { studentId, createdAt: { gte: thirtyDaysAgo() } },
    orderBy: { createdAt: "desc" },
    take: 101,
  });
  return NextResponse.json({ ...buildPracticeDiagnostic(attempts.slice(0, 100)), capped: attempts.length > 100 });
}
```

- [ ] **단계 3: 추천 선택 파서와 문항 제한 구현**

```ts
export interface PracticeSelection {
  tab: "quiz" | "transform" | "create";
  quizMode: "closure" | "cognitive";
  focus: PracticeFocus | null;
}

export function parsePracticeSelection(params: Pick<URLSearchParams, "get">): PracticeSelection {
  const tab = params.get("tab");
  const quizMode = params.get("quizMode");
  const focus = params.get("focus");
  const safeTab = tab === "transform" || tab === "create" ? tab : "quiz";
  const safeQuizMode = quizMode === "closure" ? "closure" : "cognitive";
  let safeFocus: PracticeFocus | null = null;
  if (safeQuizMode === "closure" && (focus === "closed" || focus === "open")) safeFocus = focus;
  if (safeQuizMode === "cognitive" && (focus === "factual" || focus === "conceptual" || focus === "controversial")) safeFocus = focus;
  return { tab: safeTab, quizMode: safeQuizMode, focus: safeTab === "quiz" ? safeFocus : null };
}

export function practiceSelectionSearch(selection: PracticeSelection) {
  const params = new URLSearchParams({ tab: selection.tab, quizMode: selection.quizMode });
  if (selection.focus) params.set("focus", selection.focus);
  return params.toString();
}

interface QuestionPracticeViewProps {
  audience: "student" | "teacher";
  studentId?: string;
  initialSelection?: PracticeSelection;
}
```

공통 파서 시험은 잘못된 탭, 축과 유형을 기본값으로 되돌리고 `closure`와 `cognitive` 축에 맞는 유형만 유지하며, 직렬화한 값을 다시 읽으면 같은 선택이 됨을 단언한다. 학생과 교사 페이지가 모두 `parsePracticeSelection(searchParams)` 결과를 `initialSelection`에 넘긴다. 교사의 바깥 보기는 작업 7에서 별도 `view` 값으로 읽는다. 활성 문항은 다음처럼 제한한다.

```ts
const focusedQuizBank = useMemo(() => {
  if (!focus) return quizBank;
  const filtered = quizBank.filter((item) =>
    quizMode === "closure" ? item.closure === focus : item.cognitive === focus,
  );
  return filtered.length > 0 ? filtered : quizBank;
}, [focus, quizBank, quizMode]);
```

축이나 초점이 바뀌면 새 문항 묶음, 답과 지급 상태를 초기화한다.

- [ ] **단계 4: 학생 진단 띠와 네 상태 시험 구현**

`PracticeProgressSummary`는 `/api/practice/progress`를 읽고 불러오는 중, 실패와 다시 시도, 자료 없음, 진단 완료를 별도 분기로 렌더한다.

```tsx
if (query.isError) {
  return <div role="alert"><span>{t("progressLoadFailed")}</span><Button onClick={() => query.refetch()}>{t("retry")}</Button></div>;
}
if (!query.data || query.data.diagnosticAttempts === 0) {
  return <div><p>{t("progressEmpty")}</p><Link href="/student-practice?tab=quiz&quizMode=cognitive">{t("startClassification")}</Link></div>;
}
```

렌더 시험은 네 상태, 추천 주소와 학생 순위 문구가 없음을 확인한다.

- [ ] **단계 5: 집중 검증과 커밋**

```bash
npm test -- src/__tests__/practice-progress-route.test.ts src/__tests__/practice-progress-summary.render.test.tsx src/__tests__/practice-selection.test.ts src/__tests__/question-practice-data.test.ts
npx eslint src/lib/practice-selection.ts src/app/api/practice/progress/route.ts src/components/student/PracticeProgressSummary.tsx src/app/'(student)'/student-practice/page.tsx src/app/'(teacher)'/teacher-practice/page.tsx src/components/shared/QuestionPracticeView.tsx
git diff --check
git add src/lib/practice-selection.ts src/app/api/practice/progress/route.ts src/components/student/PracticeProgressSummary.tsx src/app/'(student)'/student-practice/page.tsx src/app/'(teacher)'/teacher-practice/page.tsx src/components/shared/QuestionPracticeView.tsx messages/ko.json messages/en.json src/__tests__/practice-progress-route.test.ts src/__tests__/practice-progress-summary.render.test.tsx src/__tests__/practice-selection.test.ts src/__tests__/question-practice-data.test.ts
git commit -m "feat(practice): recommend exercises from student mastery"
```

### 작업 7: 교사 학급 진단과 수업 활용 연결

**파일:**
- 수정: `src/app/api/teacher/practice-stats/route.ts`
- 수정: `src/app/(teacher)/teacher-practice/page.tsx`
- 수정: `src/components/teacher/TeacherQuestionLearningGuide.tsx`
- 수정: `messages/ko.json`
- 수정: `messages/en.json`
- 수정 시험: `src/__tests__/practice-stats-route.test.ts`
- 생성 시험: `src/__tests__/teacher-practice-diagnostics.render.test.tsx`

**경계:**
- 담당 학생마다 최근 30일, 최근 101개를 한 묶음 조회로 읽고 100개를 진단한다.
- 기존 오늘·주간 포인트와 성공 횟수 필드를 유지한다.
- 교사 화면은 `view=try|bank|stats`로 바깥 보기를, 공통 `tab|quizMode|focus`로 안쪽 연습 상태를 구분하고 학급 요약, 학생별 진단과 유형 필터를 제공한다.
- 표본 없음 행동은 내장 연습 미리보기와 학생용 주소 복사이며 문항 은행과 구분한다.

- [ ] **단계 1: 담당 학생 범위와 학생별 상한 실패 시험 작성**

```ts
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    pointLog: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

it("담당 학생 시도만 학생당 100개까지 진단하고 기존 포인트를 유지한다", async () => {
  mAttempts.mockResolvedValue([
    { id: "a1", studentId: "s1", mode: "quiz", itemId: "q01", quizType: "closure", correct: true, createdAt: new Date() },
  ]);
  const data = await (await GET()).json();
  expect(data.summary.activityAttempts).toBe(1);
  expect(data.students.find((student: { id: string }) => student.id === "s1")).toMatchObject({
    todayPoints: 0,
    weekPoints: 0,
    activityAttempts: 1,
    diagnosticAttempts: 1,
  });
});

it("학교 정보가 없어도 같은 성공 응답 모양을 유지한다", async () => {
  mTeacher.mockResolvedValue({ school: null });
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    summary: { activityAttempts: 0, diagnosticAttempts: 0 },
    students: [],
  });
});
```

담당 학생이 아닌 행 제외와 한 학생 101개가 `capped=true`와 100개 분석이 되는 시험도 추가한다. 학교 미설정과 담당 학생 없음 등 모든 성공 분기에서 `{ summary, students }` 응답 모양을 단언한다.

- [ ] **단계 2: 학생별 상한 묶음 조회와 응답 구현**

```ts
const emptySummary = buildPracticeDiagnostic([]);
if (!teacher?.school) return NextResponse.json({ summary: emptySummary, students: [] });
if (studentIds.length === 0) return NextResponse.json({ summary: emptySummary, students: [] });
const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const rows = await prisma.$queryRaw<PracticeAttemptInput[]>(Prisma.sql`
  SELECT id,
         student_id AS "studentId",
         mode,
         item_id AS "itemId",
         quiz_type AS "quizType",
         correct,
         created_at AS "createdAt"
  FROM (
    SELECT id, student_id, mode, item_id, quiz_type, correct, created_at,
           ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY created_at DESC) AS row_number
    FROM practice_attempts
    WHERE student_id IN (${Prisma.join(studentIds)})
      AND created_at >= ${cutoff}
  ) ranked
  WHERE row_number <= 101
  ORDER BY created_at DESC
`);
```

각 학생은 101번째 존재 여부를 `capped`로 두고 앞 100개만 진단한다. 학급 요약은 학생별 앞 100개를 합쳐 같은 순수 함수로 계산한다.

- [ ] **단계 3: 교사 화면 요약, 필터와 펼침 행 구현**

주소의 `view=try|bank|stats`를 교사 바깥 보기로 읽고 `focus`는 공통 `parsePracticeSelection` 결과로만 받는다. 큰 화면은 표, 작은 화면은 학생별 세로 행을 사용한다. `useQuery`의 `isError`와 `refetch`를 사용해 불러오기 실패를 `role="alert"`와 다시 시도 단추로 표시하며, 이때 자료 없음 화면을 보여 주지 않는다.

```tsx
<button
  type="button"
  aria-expanded={expandedStudentId === student.id}
  aria-controls={`practice-student-${student.id}`}
  onClick={() => setExpandedStudentId((current) => current === student.id ? null : student.id)}
>
  {student.name}
</button>
```

학급 요약은 활동 시도, 진단 시도, 정답률과 가장 약한 유형을 표시한다. 학생 세부 영역은 모드와 유형별 지표를 보여 준다.

- [ ] **단계 4: 표본 없음 행동과 교사 학습 연결 구현**

```ts
const quizMode = item.focus === "closed" || item.focus === "open" ? "closure" : "cognitive";
const selection = practiceSelectionSearch({ tab: "quiz", quizMode, focus: item.focus });
const statsHref = `/teacher-practice?view=stats&${selection}`;
const previewHref = `/teacher-practice?view=try&${selection}`;
const studentHref = `/student-practice?${selection}`;
```

표본이 없으면 `내장 연습 미리보기`와 `학생용 연습 주소 복사`를 보여 준다. 복사 실패는 알리고 `문항 은행 관리`는 별도 보조 행동으로 표시한다.

- [ ] **단계 5: 렌더 시험, 집중 검증과 커밋**

```tsx
expect(screen.getByText("학급 정답률")).toBeInTheDocument();
expect(screen.getByRole("button", { name: /가학생/ })).toHaveAttribute("aria-expanded", "false");
fireEvent.click(screen.getByRole("button", { name: /가학생/ }));
expect(screen.getByText("사고 유형별 정답률")).toBeVisible();
expect(screen.getByRole("link", { name: "내장 연습 미리보기" })).toHaveAttribute("href", expect.stringContaining("focus=conceptual"));
```

오류 응답 렌더 시험은 `role="alert"`와 다시 시도 단추가 나타나고 자료 없음 문구가 숨겨짐을 확인한다. 주소 연결 시험은 `/teacher-practice?view=try&tab=quiz&quizMode=cognitive&focus=conceptual`을 읽었을 때 교사 바깥 보기가 `try`이고 `QuestionPracticeView`가 개념적 분류 문항만 받는지 확인한다.

```bash
npm test -- src/__tests__/practice-stats-route.test.ts src/__tests__/teacher-practice-diagnostics.render.test.tsx
npx eslint src/app/api/teacher/practice-stats/route.ts src/app/'(teacher)'/teacher-practice/page.tsx src/components/teacher/TeacherQuestionLearningGuide.tsx
git diff --check
git add src/app/api/teacher/practice-stats/route.ts src/app/'(teacher)'/teacher-practice/page.tsx src/components/teacher/TeacherQuestionLearningGuide.tsx messages/ko.json messages/en.json src/__tests__/practice-stats-route.test.ts src/__tests__/teacher-practice-diagnostics.render.test.tsx
git commit -m "feat(teacher): diagnose class question practice"
```

### 작업 8: 2단계 통합 검증과 마무리

**파일:**
- 수정: `e2e/question-learning-flow.spec.ts`
- 수정: `e2e/helpers/test-db.ts`

**경계:**
- 학생 추천이 실제 제한 문항 연습으로 이동한다.
- 교사 수업 활용 유형이 학급 진단 필터와 내장 연습 미리보기로 이어진다.
- 최종 작업 트리와 원격 `main`이 같은 커밋을 가리킨다.

- [ ] **단계 1: 진단 브라우저 흐름 추가**

```ts
await page.route("**/api/practice/progress", (route) => route.fulfill({ json: {
  activityAttempts: 8,
  diagnosticAttempts: 5,
  overall: { attempts: 5, correct: 2, accuracy: 40 },
  modes: {
    quiz: { attempts: 5, correct: 2, accuracy: 40 },
    transform: { attempts: 0, correct: 0, accuracy: null },
    create: { attempts: 0, correct: 0, accuracy: null },
  },
  types: {
    closed: { attempts: 0, correct: 0, accuracy: null },
    open: { attempts: 0, correct: 0, accuracy: null },
    factual: { attempts: 0, correct: 0, accuracy: null },
    conceptual: { attempts: 3, correct: 1, accuracy: 33 },
    controversial: { attempts: 0, correct: 0, accuracy: null },
  },
  unknownTypeAttempts: 0,
  capped: false,
  recommendation: { kind: "focus", tab: "quiz", quizMode: "cognitive", focus: "conceptual" },
} }));
await page.goto("/student-practice");
await page.getByRole("link", { name: /개념적 질문 연습/ }).click();
await expect(page).toHaveURL(/quizMode=cognitive.*focus=conceptual/);
await expect(page.getByText("개념적 질문 집중")).toBeVisible();
```

교사 흐름은 수업 활용의 개념적 질문에서 학생 현황으로 이동하고 `focus=conceptual` 필터, 표본 없음 미리보기와 학생용 주소 복사를 확인한다.

- [ ] **단계 2: 역할별 네 화면 크기 브라우저 검증**

```bash
npx playwright test e2e/question-learning.spec.ts e2e/question-learning-flow.spec.ts --project=chromium --project=tablet
```

`question-learning-flow.spec.ts`에서 크로미엄은 320x800, 390x844, 1440x1000을 맡고 태블릿은 820x1180을 맡는다. 학생과 교사 진단 띠, 펼침 행, 탭, 초점과 가로 넘침을 확인한다.

- [ ] **단계 3: 전체 검증**

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
git diff --check
git status --short --branch
```

예상:
- 전체 단위 시험 실패 0개
- 린트 오류와 경고 0개
- 형 검사 오류 0개
- 데이터베이스 차이, 구조와 접근 보안 검사 통과
- 운영 빌드와 모든 페이지 생성 통과
- 추적하지 않은 구현 파일 없음

- [ ] **단계 4: 통합 시험 커밋**

```bash
git add e2e/question-learning-flow.spec.ts e2e/helpers/test-db.ts
git commit -m "test(learning): cover mastery-guided role flows"
```

- [ ] **단계 5: 원격 갱신과 푸시**

```bash
git fetch origin main
git status --short --branch
git push origin main
git ls-remote origin refs/heads/main
```

원격에 새 커밋이 있으면 차이를 검토한 뒤 일반 푸시 가능 여부를 다시 판단한다. 강제 푸시는 사용하지 않는다.

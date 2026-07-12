# 공통 질문학습 슬라이드 구현 계획

> **작업자 필수 절차:** `superpowers:subagent-driven-development`를 사용해 아래 작업을 시험 우선으로 하나씩 구현하고, 각 작업 뒤 명세 검토와 코드 품질 검토를 진행한다.

**목표:** 학생과 교사가 같은 보완된 질문학습 슬라이드를 역할별 경로에서 보고, 두 질문연습 화면에서는 역할별 자세히 보기 링크가 있는 짧은 요약만 보도록 만든다.

**구조:** 한국어 고정 학습 자료는 `question-detective-content.ts` 한곳에서 관리한다. 전체 학습은 공통 `QuestionLearningExperience`와 `QuestionDetectiveSlides`를 재사용하고, 연습 요약은 `QuestionLearningSummary`가 `detailsHref`만 받아 역할별 페이지에서 조합한다. 메뉴 배열은 각 역할 레이아웃에서 정확한 순서로 관리한다.

**기술 구성:** Next.js 16, React 19, TypeScript, Tailwind CSS, next-intl, Lucide React, Vitest, Testing Library, Playwright

## 전체 제약

- 학생 메뉴는 정확히 `대시보드, 질문학습, 질문연습, 질문하기, 질문탐구, 질문놀이, 설정` 순서다.
- 교사 메뉴는 정확히 `대시보드, 질문학습, 질문연습, 탐구질문, 수업세션, 질문조회, 질문놀이, 학생관리, 설정` 순서다.
- 학생 경로는 `/student-question-learning`, 교사 경로는 `/teacher-question-learning`이다.
- 두 역할은 같은 14장 전체 학습 경험을 사용한다.
- 질문연습에는 짧은 요약과 역할별 자세히 보기 링크만 두고 전체 슬라이드를 넣지 않는다.
- 학습 완료, 현재 장, 즉석 확인 결과와 포인트는 저장하지 않으며 데이터베이스, Prisma, 마이그레이션과 API를 바꾸지 않는다.
- 교사의 직접 해보기, 문항 은행, 학생 현황과 기존 포인트 기능을 유지한다.
- 학습 본문은 한국어 고정 자료로 유지하고 메뉴, 페이지 제목, 조작 단추와 접근성 이름은 한국어·영어 번역 키를 함께 제공한다.
- 표지는 새 1536x864 비트맵 그림을 사용하고 원본 교수 인터뷰 화면은 재사용하지 않는다.
- 본문 시각 기호는 Lucide 아이콘을 사용하며 새 꾸러미를 설치하지 않는다.
- 큰 화면은 16:9 무대를 유지하고 320픽셀과 390픽셀 화면에서는 내용 높이로 늘어나며 비교 자료를 세로로 표시한다.
- 이전·다음·진행 조작은 최소 44픽셀이고, 방향키와 처음·끝 키, `tabpanel`, `aria-live`, 활성 진행 항목 하나의 로빙 초점을 지원한다.
- 움직임 감소 설정에서는 장 전환과 상태 변화 효과를 제거해도 내용과 조작을 그대로 사용할 수 있어야 한다.
- 현재 작업 폴더의 미완성 변경은 되돌리지 않고 목표 구조에 맞게 고쳐 사용한다.

---

### 작업 1: 학습 자료 계약 바로잡기

**파일:**
- 수정: `src/lib/question-detective-content.ts`
- 수정: `src/__tests__/question-detective-content.test.ts`

**연결 규약:**
- 제공: `QUESTION_TYPE_FORMULA_GUIDE`, `QUESTION_TRIO_TABLE`, `INQUIRY_STEPS`
- 새로 제공: `QUESTION_ANSWER_RANGE_GUIDE`, `QUESTION_CLASSIFICATION_AXES`, `QUESTION_WORD_HINT`, `QUESTION_LEARNING_CHECKS`, `QuestionLearningCheck`
- `QuestionLearningCheck.answer`는 기존 `Cognitive` 자료형을 사용한다.

- [ ] **1단계: 보완된 정의와 즉석 확인 자료의 실패 시험 작성**

```ts
expect(QUESTION_TYPE_FORMULA_GUIDE[0].definition).toMatch(/기억|관찰/);
expect(QUESTION_TYPE_FORMULA_GUIDE[0].definition).toMatch(/조사|계산|절차/);
expect(QUESTION_TYPE_FORMULA_GUIDE[2].definition).not.toContain("생각의 전쟁터");
expect(QUESTION_ANSWER_RANGE_GUIDE.closed.example).not.toEqual(QUESTION_ANSWER_RANGE_GUIDE.open.example);
expect(QUESTION_CLASSIFICATION_AXES).toHaveLength(2);
expect(QUESTION_WORD_HINT).toContain("단서");
expect(QUESTION_WORD_HINT).toContain("사고");
expect(QUESTION_LEARNING_CHECKS).toHaveLength(3);
expect(QUESTION_LEARNING_CHECKS.map((item) => item.answer)).toEqual([
  "factual",
  "conceptual",
  "controversial",
]);
for (const item of QUESTION_LEARNING_CHECKS) {
  expect(item.prompt.length).toBeGreaterThan(10);
  expect(item.explanation.length).toBeGreaterThan(10);
}
```

- [ ] **2단계: 자료 시험이 실패하는지 확인**

실행: `npm test -- src/__tests__/question-detective-content.test.ts`

예상: 새 상수가 없고 기존 사실적·논쟁적 정의가 조건을 만족하지 않아 실패한다.

- [ ] **3단계: 단일 자료 원본 보완**

```ts
export interface QuestionLearningCheck {
  id: string;
  prompt: string;
  answer: Cognitive;
  explanation: string;
}

export const QUESTION_CLASSIFICATION_AXES = [
  { key: "answerRange", title: "답의 범위", description: "닫힌 질문과 열린 질문을 구분해요." },
  { key: "thinkingPurpose", title: "생각의 목적과 깊이", description: "사실적, 개념적, 논쟁적 질문을 구분해요." },
] as const;

export const QUESTION_WORD_HINT =
  "왜, 어떻게 같은 질문 낱말은 단서일 뿐이에요. 답할 때 필요한 사고와 근거를 보고 질문 유형을 판단해요.";

export const QUESTION_LEARNING_CHECKS: QuestionLearningCheck[] = [
  {
    id: "check-factual",
    prompt: "우리 반에서 오늘 출석한 학생은 몇 명인가요?",
    answer: "factual",
    explanation: "관찰하거나 세어 확인할 수 있는 정해진 정보를 묻기 때문에 사실적 질문이에요.",
  },
  {
    id: "check-conceptual",
    prompt: "숲이 줄어들면 지역의 기후에는 어떤 영향을 줄까요?",
    answer: "conceptual",
    explanation: "여러 사실을 연결해 숲과 기후의 관계를 설명해야 하므로 개념적 질문이에요.",
  },
  {
    id: "check-controversial",
    prompt: "환경 보호를 위해 일회용품 사용을 법으로 제한해야 할까요?",
    answer: "controversial",
    explanation: "환경 보호와 선택의 자유라는 가치를 근거로 판단해야 하므로 논쟁적 질문이에요.",
  },
];
```

`QUESTION_ANSWER_RANGE_GUIDE`에는 같은 광합성 주제로 닫힌 질문과 열린 질문의 정의 및 서로 다른 예시를 둔다. 사실적 정의는 기억, 관찰, 조사, 계산 또는 정해진 절차로 확인 가능한 정보를 포함하도록 고친다. `왜`와 `어떻게`는 단서일 뿐 답에 필요한 사고가 기준임을 넣고, 논쟁적 정의는 근거를 나누는 토론 어조로 바꾼다. 석굴암 산 이름은 `무엇인가요`로 유지하고, 사실적 방법 질문은 자료, 관찰, 조사 또는 정해진 절차로 확인 가능할 때라는 조건을 명시한다.

- [ ] **4단계: 자료 시험 통과 확인**

실행: `npm test -- src/__tests__/question-detective-content.test.ts`

예상: 모든 자료 시험이 통과한다.

- [ ] **5단계: 자료 변경 커밋**

```bash
git add src/lib/question-detective-content.ts src/__tests__/question-detective-content.test.ts
git commit -m "feat(learning): refine question learning content"
```

---

### 작업 2: 질문연습에서 전체 학습 분리하기

**파일:**
- 새 파일: `src/components/shared/QuestionLearningSummary.tsx`
- 새 파일: `src/__tests__/question-learning-architecture.test.ts`
- 수정: `src/components/shared/QuestionPracticeView.tsx`
- 수정: `src/app/(student)/student-practice/page.tsx`
- 수정: `src/app/(teacher)/teacher-practice/page.tsx`
- 삭제 유지: `src/components/shared/QuestionTypeGuide.tsx`

**연결 규약:**
- 제공: `QuestionLearningSummary({ detailsHref }: { detailsHref: string })`
- `QuestionPracticeView()`는 연습 기능만 제공하고 학습 구성요소나 역할 경로를 알지 않는다.

- [ ] **1단계: 역할별 요약 조합을 고정하는 실패 시험 작성**

```ts
expect(practiceView).not.toContain("QuestionDetectiveSlides");
expect(practiceView).not.toContain("student-question-learning");
expect(practiceView).not.toContain("teacher-question-learning");
expect(studentPractice).toContain("QuestionLearningSummary");
expect(studentPractice).toContain('detailsHref="/student-question-learning"');
expect(teacherPractice).toContain("QuestionLearningSummary");
expect(teacherPractice).toContain('detailsHref="/teacher-question-learning"');
expect(studentLearning).toContain("QuestionLearningExperience");
expect(teacherLearning).toContain("QuestionLearningExperience");
```

- [ ] **2단계: 구조 시험이 실패하는지 확인**

실행: `npm test -- src/__tests__/question-learning-architecture.test.ts`

예상: 요약 구성요소가 없고 공용 연습 화면이 전체 슬라이드를 직접 가져와 실패한다.

- [ ] **3단계: 짧은 학습 요약 구성요소 작성**

```tsx
export interface QuestionLearningSummaryProps {
  detailsHref: string;
}

export function QuestionLearningSummary({ detailsHref }: QuestionLearningSummaryProps) {
  const t = useTranslations("questionLearning");
  const tCls = useTranslations("classification");
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardContent className="pt-6">
        <SectionToggle title={t("summaryTitle")} open={open} onToggle={() => setOpen((value) => !value)} className="w-full" />
        {open && (
          <div className="mt-4 space-y-4">
            <p>{QUESTION_CLASSIFICATION_AXES.map((axis) => `${axis.title}: ${axis.description}`).join(" · ")}</p>
            <p>{QUESTION_WORD_HINT}</p>
            <div className="grid gap-3 md:grid-cols-3">
              {QUESTION_TYPE_FORMULA_GUIDE.map((guide) => (
                <article key={guide.typeKey}>
                  <h3>{tCls(`${guide.typeKey}.label`)}</h3>
                  <p>{guide.tagline}</p>
                  <p>{guide.formulas[0].examples[0]}</p>
                </article>
              ))}
            </div>
            <Button asChild><Link href={detailsHref}>{t("viewFull")}</Link></Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

하늘색, 초록, 장미색 강조를 사용하고 유형별 대표 예시는 한 개씩만 표시한다. 긴 정의, 아홉 공식, 비교 자료, 탐구 단계와 즉석 확인은 넣지 않는다.

- [ ] **4단계: 공용 연습 보기의 학습 상태와 전체 슬라이드 제거**

`QuestionPracticeView.tsx`에서 `QuestionDetectiveSlides`, `SectionToggle`, `showLearn`과 상단 학습 카드를 제거하고 분류, 바꾸기, 만들기 연습은 그대로 둔다. 학생 연습 페이지는 `QuestionLearningSummary`를 `QuestionPracticeView` 앞에 넣고, 교사 페이지는 `try` 탭 안에서 포인트 안내 다음에 교사 요약을 넣는다.

- [ ] **5단계: 구조와 기존 연습 시험 통과 확인**

실행: `npm test -- src/__tests__/question-learning-architecture.test.ts src/__tests__/question-practice-data.test.ts src/__tests__/practice-custom.test.ts`

예상: 역할별 링크와 연습 기능 보존 시험이 모두 통과한다.

- [ ] **6단계: 연습 분리 커밋**

```bash
git add src/components/shared/QuestionLearningSummary.tsx src/components/shared/QuestionPracticeView.tsx src/components/shared/QuestionTypeGuide.tsx src/app/\(student\)/student-practice/page.tsx src/app/\(teacher\)/teacher-practice/page.tsx src/__tests__/question-learning-architecture.test.ts
git commit -m "refactor(practice): separate question learning summary"
```

---

### 작업 3: 공통 14장 슬라이드와 역할별 학습 페이지 만들기

**파일:**
- 수정: `src/components/shared/QuestionDetectiveSlides.tsx`
- 새 파일: `src/components/shared/QuestionLearningExperience.tsx`
- 새 파일: `src/app/(student)/student-question-learning/page.tsx`
- 새 파일: `src/app/(teacher)/teacher-question-learning/page.tsx`
- 새 파일: `src/__tests__/question-learning.render.test.tsx`
- 새 파일: `public/question-learning-cover.png`

**연결 규약:**
- 제공: `QuestionDetectiveSlides()`와 `QUESTION_LEARNING_SLIDES`
- 제공: `QuestionLearningExperience()`
- 두 역할 페이지는 프롭 없이 같은 `QuestionLearningExperience`를 렌더한다.
- 즉석 확인은 `QUESTION_LEARNING_CHECKS`와 화면 지역 상태만 사용한다.

- [ ] **1단계: 이동, 접근성, 즉석 확인의 실패 렌더 시험 작성**

```tsx
renderWithIntl(<QuestionDetectiveSlides />);
expect(screen.getByRole("tabpanel")).toHaveTextContent("질문 탐정단");
expect(screen.getAllByRole("tab").filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
fireEvent.click(screen.getByRole("button", { name: ko.questionLearning.next }));
expect(screen.getByText("2 / 14")).toBeInTheDocument();
fireEvent.keyDown(screen.getByTestId("question-learning-stage"), { key: "End" });
expect(screen.getByText("14 / 14")).toBeInTheDocument();
fireEvent.keyDown(screen.getByTestId("question-learning-stage"), { key: "Home" });
expect(screen.getByText("1 / 14")).toBeInTheDocument();
```

즉석 확인 시험에서는 13장으로 이동한 뒤 사실적 선택을 누르고 설명이 표시되는지, `global.fetch`가 호출되지 않는지 검사한다.

- [ ] **2단계: 렌더 시험이 실패하는지 확인**

실행: `npm test -- src/__tests__/question-learning.render.test.tsx`

예상: 14장 자료, 접근성 속성, 키보드 이동과 즉석 확인이 없어 실패한다.

- [ ] **3단계: 표지 비트맵 그림 생성과 크기 확인**

그림 생성 도구에 다음 요청을 사용한다.

```text
1536x864 교육용 디지털 삽화. 초등학생 세 명이 밝은 교실 탐구 공간에서 돋보기, 질문 카드, 연결 선과 균형 저울 모형을 살펴보며 사실, 관계, 근거 있는 선택을 발견하는 장면. 맑은 하늘색, 초록, 장미색을 균형 있게 사용하고 보라색은 작은 강조에만 사용한다. 화면 왼쪽에는 제목을 올릴 수 있는 차분하고 밝은 여백을 둔다. 글자, 숫자, 상표, 테두리, 어두운 분위기는 넣지 않는다.
```

결과를 `public/question-learning-cover.png`에 두고 `sips -g pixelWidth -g pixelHeight public/question-learning-cover.png`로 1536x864인지 확인한다.

- [ ] **4단계: 14장 자료 순서와 슬라이드 무대 구현**

```ts
export const QUESTION_LEARNING_SLIDES = [
  "cover",
  "whyQuestions",
  "twoAxes",
  "openClosed",
  "inquiryDepth",
  "factualDefinition",
  "factualFormulas",
  "conceptualDefinition",
  "conceptualFormulas",
  "controversialDefinition",
  "controversialFormulas",
  "comparison",
  "check",
  "synthesis",
] as const;
```

표지는 `next/image`로 새 비트맵을 보여준다. 정의 장은 `Search`, `Link2`, `Scale`, `Lightbulb` 같은 Lucide 아이콘을 사용한다. 비교 장은 큰 화면 표와 작은 화면 세로 목록을 각각 제공한다. 확인 장은 현재 문항 한 개와 세 유형 선택, 정답 설명, 다음 문항 조작을 표시하며 저장이나 통신을 하지 않는다. 전환에는 `motion-reduce:transition-none`을 적용한다.

- [ ] **5단계: 키보드와 접근성 계약 구현**

무대는 `data-testid="question-learning-stage"`, `tabIndex={0}`, `onKeyDown`을 갖고 `ArrowLeft`, `ArrowRight`, `Home`, `End`를 경계 안에서 처리한다. 본문은 `role="tabpanel"`과 활성 진행 항목을 가리키는 `aria-labelledby`를 사용한다. 현재 장 알림은 `aria-live="polite"`로 제공한다. 진행 단추는 활성 항목만 `tabIndex={0}`, 나머지는 `-1`이며 최소 높이와 너비가 44픽셀이다.

- [ ] **6단계: 공통 경험과 역할별 페이지 작성**

```tsx
export function QuestionLearningExperience() {
  const t = useTranslations("questionLearning");
  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <QuestionDetectiveSlides />
    </div>
  );
}
```

학생과 교사 `page.tsx`는 각각 `QuestionLearningExperience`만 렌더한다.

- [ ] **7단계: 슬라이드와 구조 시험 통과 확인**

실행: `npm test -- src/__tests__/question-learning.render.test.tsx src/__tests__/question-learning-architecture.test.ts src/__tests__/question-detective-content.test.ts`

예상: 14장, 이동, 접근성, 지역 확인 문제와 공통 경험 재사용 시험이 모두 통과한다.

- [ ] **8단계: 공통 학습 화면 커밋**

```bash
git add public/question-learning-cover.png src/components/shared/QuestionDetectiveSlides.tsx src/components/shared/QuestionLearningExperience.tsx src/app/\(student\)/student-question-learning/page.tsx src/app/\(teacher\)/teacher-question-learning/page.tsx src/__tests__/question-learning.render.test.tsx src/__tests__/question-learning-architecture.test.ts
git commit -m "feat(learning): add shared question learning slides"
```

---

### 작업 4: 번역, 보호 경로와 메뉴 순서 연결하기

**파일:**
- 수정: `messages/ko.json`
- 수정: `messages/en.json`
- 수정: `src/app/(student)/layout.tsx`
- 수정: `src/app/(teacher)/layout.tsx`
- 수정: `src/__tests__/student-navigation-order.test.ts`
- 새 파일: `src/__tests__/teacher-navigation-order.test.ts`
- 수정: `src/__tests__/route-access.test.ts`
- 수정: `e2e/route-protection.spec.ts`

**연결 규약:**
- 새 메뉴 키: `nav.questionLearning`
- 새 번역 묶음: `questionLearning.title`, `subtitle`, `summaryTitle`, `viewFull`, `previous`, `next`, `slideNavigation`, `slideProgress`, `checkNext`, `checkRestart`

- [ ] **1단계: 학생과 교사 전체 메뉴 순서의 실패 시험 작성**

```ts
const expectedStudentPages = [
  "/student-dashboard",
  "/student-question-learning",
  "/student-practice",
  "/student-ask",
  "/student-questions",
  "/student-question-play",
  "/student-settings",
];

const expectedTeacherPages = [
  "/teacher-dashboard",
  "/teacher-question-learning",
  "/teacher-practice",
  "/teacher-curriculum",
  "/teacher-sessions",
  "/teacher-questions",
  "/teacher-question-play",
  "/teacher-students",
  "/teacher-settings",
];
```

각 경로의 문자열 위치가 모두 존재하고 앞 항목보다 뒤에 있는지 검사한다. 역할 판정 시험에는 두 새 경로가 각각 `STUDENT`, `TEACHER`를 반환하는 단언을 추가한다.

- [ ] **2단계: 메뉴와 번역 시험이 실패하는지 확인**

실행: `npm test -- src/__tests__/student-navigation-order.test.ts src/__tests__/teacher-navigation-order.test.ts src/__tests__/route-access.test.ts src/__tests__/i18n-parity.test.ts`

예상: 새 메뉴 경로와 번역 키가 없어 실패한다.

- [ ] **3단계: 정확한 메뉴 배열 반영**

```ts
const STUDENT_PAGES = [
  { href: "/student-dashboard", key: "dashboard" },
  { href: "/student-question-learning", key: "questionLearning" },
  { href: "/student-practice", key: "practice" },
  { href: "/student-ask", key: "ask" },
  { href: "/student-questions", key: "explore" },
  { href: "/student-question-play", key: "questionPlay" },
  { href: "/student-settings", key: "settings" },
] as const;

const TEACHER_PAGES = [
  { href: "/teacher-dashboard", key: "dashboard" },
  { href: "/teacher-question-learning", key: "questionLearning" },
  { href: "/teacher-practice", key: "practice" },
  { href: "/teacher-curriculum", key: "curriculum" },
  { href: "/teacher-sessions", key: "sessions" },
  { href: "/teacher-questions", key: "questions" },
  { href: "/teacher-question-play", key: "questionPlay" },
  { href: "/teacher-students", key: "students" },
  { href: "/teacher-settings", key: "settings" },
] as const;
```

- [ ] **4단계: 한국어와 영어 번역 및 보호 경로 반영**

한국어 메뉴는 `질문학습`, 영어 메뉴는 `Question Learning`으로 둔다. 학습 제목, 요약, 조작, 진행과 즉석 확인 단추 키를 두 번역 파일에 같은 구조로 넣는다. 미인증 보호 경로 목록에는 학생과 교사 질문학습 경로를 추가한다.

- [ ] **5단계: 메뉴, 번역과 보호 경로 시험 통과 확인**

실행: `npm test -- src/__tests__/student-navigation-order.test.ts src/__tests__/teacher-navigation-order.test.ts src/__tests__/route-access.test.ts src/__tests__/i18n-parity.test.ts`

실행: `npx playwright test e2e/route-protection.spec.ts --project=chromium`

예상: 전체 메뉴 순서, 번역 짝과 두 새 보호 경로가 모두 통과한다.

- [ ] **6단계: 메뉴와 번역 커밋**

```bash
git add messages/ko.json messages/en.json src/app/\(student\)/layout.tsx src/app/\(teacher\)/layout.tsx src/__tests__/student-navigation-order.test.ts src/__tests__/teacher-navigation-order.test.ts src/__tests__/route-access.test.ts e2e/route-protection.spec.ts
git commit -m "feat(navigation): add question learning for both roles"
```

---

### 작업 5: 전체 회귀와 실제 화면 검증

**파일:**
- 검증 대상: 작업 1부터 4까지에서 변경한 학습 자료, 공통 구성요소, 역할별 페이지, 메뉴, 번역과 시험 파일
- 저장소 밖 임시 화면 자료: `/private/tmp/qbi-question-learning/`

- [ ] **1단계: 관련 시험과 변경 형식 확인**

실행: `npm test -- src/__tests__/question-detective-content.test.ts src/__tests__/question-learning-architecture.test.ts src/__tests__/question-learning.render.test.tsx src/__tests__/student-navigation-order.test.ts src/__tests__/teacher-navigation-order.test.ts src/__tests__/i18n-parity.test.ts src/__tests__/route-access.test.ts`

실행: `git diff --check`

예상: 모든 시험이 통과하고 공백 오류가 없다.

- [ ] **2단계: 전체 시험, 린트와 형 검사**

실행: `npm test`

실행: `npm run lint`

실행: `npx next typegen && npx tsc --noEmit`

예상: 세 명령이 오류 없이 끝난다.

- [ ] **3단계: 운영 묶음 생성 확인**

실행: `npm run build`

데이터베이스 연결 상태 때문에 저장소 검사 명령만 실패하면 해당 결과를 확인한 뒤 `DATABASE_URL='postgresql://user:pass@localhost:5432/db?schema=public' NEXTAUTH_SECRET='ci-dummy-secret' NEXTAUTH_URL='http://localhost:3000' npx next build`로 화면 코드의 운영 묶음 생성도 별도로 검증한다.

- [ ] **4단계: 실제 화면과 상호작용 검증**

개발 서버를 실행하고 학생과 교사 계정으로 다음 네 경로를 320x800, 390x844, 820x1180, 1440x1000에서 확인한다.

```text
/student-question-learning
/teacher-question-learning
/student-practice
/teacher-practice
```

14장을 모두 넘기면서 문서와 무대의 `scrollWidth <= clientWidth`, 표지 그림 `complete && naturalWidth > 0`, 최소 44픽셀 조작 영역, 작은 화면 비교 자료의 세로 배치, 밝은 화면과 어두운 화면, 움직임 감소 설정을 확인한다. 방향키와 처음·끝 키, 첫 장과 끝 장의 이동 경계, 즉석 확인 정답 설명과 새로 고침 뒤 초기화를 직접 검증한다. 화면 갈무리는 `/private/tmp/qbi-question-learning/`에 둔다.

- [ ] **5단계: 최종 변경 검토와 필요한 수정 커밋**

검토에서 발견한 문제가 있으면 실패 시험을 먼저 추가하고 수정한 뒤 관련 시험을 다시 실행한다.

```bash
git add messages/ko.json messages/en.json public/question-learning-cover.png \
  src/lib/question-detective-content.ts \
  src/components/shared/QuestionDetectiveSlides.tsx \
  src/components/shared/QuestionLearningExperience.tsx \
  src/components/shared/QuestionLearningSummary.tsx \
  src/components/shared/QuestionPracticeView.tsx \
  src/components/shared/QuestionTypeGuide.tsx \
  src/app/\(student\)/layout.tsx \
  src/app/\(student\)/student-practice/page.tsx \
  src/app/\(student\)/student-question-learning/page.tsx \
  src/app/\(teacher\)/layout.tsx \
  src/app/\(teacher\)/teacher-practice/page.tsx \
  src/app/\(teacher\)/teacher-question-learning/page.tsx \
  src/__tests__/question-detective-content.test.ts \
  src/__tests__/question-learning-architecture.test.ts \
  src/__tests__/question-learning.render.test.tsx \
  src/__tests__/student-navigation-order.test.ts \
  src/__tests__/teacher-navigation-order.test.ts \
  src/__tests__/route-access.test.ts \
  e2e/route-protection.spec.ts
git commit -m "fix(learning): polish responsive question learning"
```

수정할 문제가 없으면 빈 커밋을 만들지 않는다.

- [ ] **6단계: 원격 저장소 푸시와 확인**

실행: `git push origin main`

실행: `git status --short --branch`

예상: `main`이 `origin/main`과 일치하고 작업 대상 변경이 남지 않는다.

# 질문수업 만들기와 관리 통합 구현 계획

> **작업 에이전트 필수 지침:** 각 작업은 `superpowers:subagent-driven-development` 방식으로 구현하고, 시험 실패를 먼저 확인한 뒤 최소 구현으로 통과시킨다.

**목표:** 탐구질문과 수업세션 메뉴를 질문수업 하나로 통합하고 탐구질문 기반 수업을 주된 만들기 방식으로 부각한다.

**구조:** 기존 `/teacher-sessions`를 통합 진입과 관리 화면으로 유지하고 `/teacher-curriculum`은 탐구질문 만들기 전용 주소로 보존한다. 상단 메뉴는 주소 별칭을 이용해 두 화면을 질문수업 하나로 강조한다. 내부 자료 모형과 조회, 저장 주소는 바꾸지 않는다.

**기술:** Next.js, React, TypeScript, TanStack Query, next-intl, Prisma, Vitest, Playwright

## 전체 제약

- 자료 틀, 저장 자료와 내부 `session` 이름을 바꾸지 않는다.
- 기존 화면 주소와 조회, 저장 주소를 삭제하지 않는다.
- 탐구질문 수업 생성은 기존 설계 저장 뒤 수업 생성 순서를 유지한다.
- 간단 질문수업 생성 양식은 기본으로 닫는다.
- 사용자에게 보이는 한국어에 `수업세션`과 `수업 세션`을 남기지 않는다.
- 생성 실패 시 입력과 현재 화면을 보존한다.

---

### Task 1: 질문수업 단일 메뉴와 주소 별칭

**파일:**
- 수정: `src/components/shared/AppNav.tsx`
- 수정: `src/components/shared/PageNav.tsx`
- 수정: `src/app/(teacher)/layout.tsx`
- 수정: `messages/ko.json`
- 수정: `messages/en.json`
- 수정 시험: `src/__tests__/teacher-navigation-order.test.ts`
- 생성 시험: `src/__tests__/navigation-aliases.test.tsx`

**입력과 출력:**
- `NavPage.aliases?: readonly string[]`는 대표 주소와 같은 메뉴로 취급할 추가 주소다.
- 교사 질문수업 항목은 `/teacher-sessions`를 대표 주소로, `/teacher-curriculum`을 별칭으로 사용한다.

- [ ] **단계 1: 실패 시험 작성**

```ts
expect(readTeacherPages()).toEqual([
  { href: "/teacher-dashboard", key: "dashboard" },
  { href: "/teacher-question-learning", key: "questionLearning" },
  { href: "/teacher-practice", key: "practice" },
  { href: "/teacher-sessions", key: "sessions" },
  { href: "/teacher-questions", key: "questions" },
  { href: "/teacher-question-play", key: "questionPlay" },
]);
expect(layoutSource).toContain('aliases: ["/teacher-curriculum"]');
```

렌더 시험은 현재 주소가 `/teacher-curriculum`일 때 질문수업 메뉴가 활성 상태인지 확인한다.

- [ ] **단계 2: 실패 확인**

```bash
npx vitest run src/__tests__/teacher-navigation-order.test.ts src/__tests__/navigation-aliases.test.tsx
```

- [ ] **단계 3: 별칭과 메뉴 구현**

`AppNav`와 `PageNav`가 대표 주소와 별칭을 같은 항목으로 판정하게 한다. 교사 페이지 목록에서 별도 탐구질문 항목을 제거하고 질문수업 항목에 별칭을 전달한다. 한국어 메뉴 이름은 `질문수업`으로 바꾼다.

- [ ] **단계 4: 시험 통과 확인과 커밋**

```bash
npx vitest run src/__tests__/teacher-navigation-order.test.ts src/__tests__/navigation-aliases.test.tsx
git add src/components/shared/AppNav.tsx src/components/shared/PageNav.tsx 'src/app/(teacher)/layout.tsx' messages/ko.json messages/en.json src/__tests__/teacher-navigation-order.test.ts src/__tests__/navigation-aliases.test.tsx
git commit -m "feat(nav): unify teacher question classes"
```

### Task 2: 질문수업 통합 진입과 간단 만들기

**파일:**
- 수정: `src/app/(teacher)/teacher-sessions/page.tsx`
- 수정: `src/app/(teacher)/teacher-sessions/TeacherSessionCreateCard.tsx`
- 수정: `src/app/(teacher)/teacher-sessions/TeacherSessionMonthList.tsx`
- 수정: `src/app/(teacher)/teacher-sessions/TeacherSessionRow.tsx`
- 수정: `messages/ko.json`
- 수정: `messages/en.json`
- 수정 시험: `src/__tests__/core-screen-layout-improvements.test.ts`
- 수정 시험: `src/__tests__/core-screen-component-split.test.ts`
- 생성 시험: `src/__tests__/question-class-hub.test.ts`

- [ ] **단계 1: 실패 검사 작성**

```ts
expect(sessionPage).toContain('href="/teacher-curriculum"');
expect(sessionPage).toContain("question-class-primary-action");
expect(sessionPage).toContain("quickCreateOpen");
expect(sessionPage).toContain("quickCreateOpen &&");
expect(sessionRow).toContain("badgeQuickQuestionClass");
expect(sessionRow).toContain("badgeInquiryQuestionClass");
```

- [ ] **단계 2: 실패 확인**

```bash
npx vitest run src/__tests__/question-class-hub.test.ts src/__tests__/core-screen-layout-improvements.test.ts src/__tests__/core-screen-component-split.test.ts
```

- [ ] **단계 3: 통합 진입 구현**

질문수업 화면 상단에 `탐구질문으로 수업 만들기` 주 단추와 `간단 질문수업 만들기` 보조 단추를 둔다. 보조 단추를 눌렀을 때만 기존 생성 구성 요소를 렌더한다. 생성 성공 뒤 양식을 닫고 새 행을 강조한다.

관리 행에는 `unitDesignId` 존재 여부에 따라 `탐구질문 수업` 또는 `간단 질문수업`을 표시한다. 기존 수정, 공개 설정, 참여 현황과 삭제 행동은 유지한다.

- [ ] **단계 4: 시험 통과 확인과 커밋**

```bash
npx vitest run src/__tests__/question-class-hub.test.ts src/__tests__/core-screen-layout-improvements.test.ts src/__tests__/core-screen-component-split.test.ts src/__tests__/sessions.test.ts
git add 'src/app/(teacher)/teacher-sessions' messages/ko.json messages/en.json src/__tests__/question-class-hub.test.ts src/__tests__/core-screen-layout-improvements.test.ts src/__tests__/core-screen-component-split.test.ts
git commit -m "feat(sessions): add question class hub"
```

### Task 3: 탐구질문 수업 생성 뒤 관리 연결

**파일:**
- 수정: `src/app/(teacher)/teacher-curriculum/page.tsx`
- 수정: `src/app/(teacher)/teacher-curriculum/CurriculumInquiryStep.tsx`
- 수정: `src/app/(teacher)/teacher-curriculum/SavedDesignsTab.tsx`
- 수정: `messages/ko.json`
- 수정: `messages/en.json`
- 생성 시험: `src/__tests__/question-class-create-flow.test.ts`
- 수정 시험: `src/__tests__/unit-design.test.ts`

- [ ] **단계 1: 실패 검사 작성**

```ts
expect(curriculumPage).toContain('router.push(`/teacher-sessions?session=${createdSession.id}`)');
expect(inquiryStep).toContain('t("createInquiryQuestionClass")');
expect(koreanMessages.curriculum.redeployToSession).toBe("이 설계로 새 수업 만들기");
```

- [ ] **단계 2: 실패 확인**

```bash
npx vitest run src/__tests__/question-class-create-flow.test.ts src/__tests__/unit-design.test.ts
```

- [ ] **단계 3: 성공 이동과 정확한 명칭 구현**

기존 두 요청이 모두 성공해 새 수업 식별값을 받은 경우에만 관리 화면으로 이동한다. 실패 분기는 현재 입력과 화면을 유지한다. 마지막 주 단추를 `탐구질문 수업 만들기`로 바꾸고 새 수업을 만드는 저장 목록 행동에서 `재배포` 표현을 제거한다.

- [ ] **단계 4: 시험 통과 확인과 커밋**

```bash
npx vitest run src/__tests__/question-class-create-flow.test.ts src/__tests__/unit-design.test.ts
git add 'src/app/(teacher)/teacher-curriculum' messages/ko.json messages/en.json src/__tests__/question-class-create-flow.test.ts src/__tests__/unit-design.test.ts
git commit -m "feat(curriculum): hand off created question classes"
```

### Task 4: 사용자 용어 전체 점검

**파일:**
- 수정: `messages/ko.json`
- 수정: `messages/en.json`
- 수정: 사용자에게 오류를 보여 주는 관련 `src` 파일
- 생성 시험: `src/__tests__/question-class-terminology.test.ts`

- [ ] **단계 1: 실패 시험 작성**

```ts
const koreanMessages = readFileSync("messages/ko.json", "utf8");
expect(koreanMessages).not.toMatch(/수업\s?세션/);
expect(JSON.parse(koreanMessages).nav.sessions).toBe("질문수업");
```

- [ ] **단계 2: 실패 확인**

```bash
npx vitest run src/__tests__/question-class-terminology.test.ts
```

- [ ] **단계 3: 문맥별 용어 수정**

기능 이름, 목록, 선택, 분석과 배포 문맥은 `질문수업`으로 바꾼다. 날짜, 대상, 참여처럼 화면 문맥이 분명한 곳은 `수업`으로 줄인다. 내부 식별자, 자료 모형, 주소와 로그인 세션은 바꾸지 않는다.

- [ ] **단계 4: 전체 점검과 커밋**

```bash
npx vitest run src/__tests__/question-class-terminology.test.ts
rg -n "수업 ?세션" messages/ko.json src --glob '*.tsx' --glob '*.ts'
git add messages/ko.json messages/en.json src src/__tests__/question-class-terminology.test.ts
git commit -m "refactor(copy): standardize question class terms"
```

### Task 5: 최종 회귀 검사

- [ ] **단계 1: 전체 단위 시험**

```bash
npm test
```

- [ ] **단계 2: 정적 검사와 운영 빌드**

```bash
npm run lint
npx tsc --noEmit
npm run build
```

- [ ] **단계 3: 실제 브라우저 검사**

교사 질문수업 진입, 탐구질문 주 행동, 간단 생성 펼침, 학생과 교사 우선순위 목록을 데스크톱과 태블릿에서 확인한다.

```bash
npx playwright test e2e/question-class-flow.spec.ts --project=chromium --project=tablet
```

- [ ] **단계 4: 원격 동기화와 푸시**

```bash
git fetch origin main
git merge --no-edit origin/main
npm test
git push origin main
git ls-remote origin refs/heads/main
```

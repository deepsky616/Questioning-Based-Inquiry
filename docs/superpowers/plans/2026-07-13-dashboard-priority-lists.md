# 역할별 오늘 할 일 우선순위 목록 구현 계획

> **작업 에이전트 필수 지침:** 각 작업은 `superpowers:subagent-driven-development` 방식으로 구현하고, 시험 실패를 먼저 확인한 뒤 최소 구현으로 통과시킨다.

**목표:** 교사와 학생 대시보드의 개별 할 일 카드를 역할별 최대 세 줄 우선순위 목록으로 바꾼다.

**구조:** 순수 집계 함수는 `src/lib/dashboard-priority-tasks.ts`에 두고, 공통 한 줄 표시는 `PriorityTaskList`가 담당한다. 역할별 카드 구성 요소는 제목, 조회 상태와 이동 행동만 조합한다. 기존 조회 경로와 저장 자료는 바꾸지 않는다.

**기술:** Next.js, React, TypeScript, TanStack Query, next-intl, Vitest, Testing Library

## 전체 제약

- 새 자료 표, 열과 자료 이전을 만들지 않는다.
- 교사 목록은 부적절 의심 활동, 추천 포인트, 지도 필요 학생 순서다.
- 학생 목록은 선생님 요청, 오늘 질문할 수업, 최근 놓친 수업 순서다.
- 값이 0인 항목은 숨기고 최대 세 줄만 보여 준다.
- 조회 준비 전이나 실패 상태를 완료로 표시하지 않는다.
- 댓글, 최근 포인트, 미래 수업과 배포 질문은 학생 오늘 할 일에서 제외한다.

---

### Task 1: 역할별 우선순위 집계

**파일:**
- 생성: `src/lib/dashboard-priority-tasks.ts`
- 생성 시험: `src/__tests__/dashboard-priority-tasks.test.ts`

**입력과 출력:**
- `buildTeacherPriorityCounts(input)`은 교사 항목 세 개를 우선순위 순으로 반환한다.
- `buildStudentPriorityCounts(input)`은 읽지 않은 교사 요청을 수업별로 한 번만 세고 오늘과 지난 미작성 수업의 겹침을 제거한다.

- [ ] **단계 1: 실패 시험 작성**

```ts
expect(buildTeacherPriorityCounts({
  flaggedCount: 2,
  pendingPointCount: 4,
  students: [
    { id: "s1", hasQuestion: false, remainingSessionCount: 1 },
    { id: "s2", hasQuestion: true, remainingSessionCount: 2 },
  ],
})).toEqual([
  { key: "flagged", count: 2 },
  { key: "points", count: 4 },
  { key: "attention", count: 2 },
]);

expect(buildStudentPriorityCounts({
  teacherRequests: [
    { id: "n1", sessionId: "today-1" },
    { id: "n2", sessionId: "today-1" },
  ],
  todayUnaskedSessionIds: ["today-1", "today-2"],
  pastUnaskedSessionIds: ["past-1"],
})).toEqual([
  { key: "teacherRequest", count: 1 },
  { key: "todayUnasked", count: 1 },
  { key: "pastUnasked", count: 1 },
]);
```

- [ ] **단계 2: 실패 확인**

```bash
npx vitest run src/__tests__/dashboard-priority-tasks.test.ts
```

기대 결과: 모듈이 없어 시험이 실패한다.

- [ ] **단계 3: 최소 집계 구현**

```ts
export type PriorityCountKey = "flagged" | "points" | "attention" | "teacherRequest" | "todayUnasked" | "pastUnasked";
export interface PriorityCount { key: PriorityCountKey; count: number }

export function buildTeacherPriorityCounts(input: TeacherPriorityInput): PriorityCount[] {
  const attention = new Set(
    input.students
      .filter((student) => !student.hasQuestion || student.remainingSessionCount > 0)
      .map((student) => student.id),
  ).size;
  return [
    { key: "flagged", count: input.flaggedCount },
    { key: "points", count: input.pendingPointCount },
    { key: "attention", count: attention },
  ].filter((item) => item.count > 0);
}
```

학생 함수는 `sessionId ?? notification id`를 고유 키로 사용하고 요청 수업 식별값을 오늘과 지난 목록에서 제외한다.

- [ ] **단계 4: 시험 통과 확인**

```bash
npx vitest run src/__tests__/dashboard-priority-tasks.test.ts
```

- [ ] **단계 5: 커밋**

```bash
git add src/lib/dashboard-priority-tasks.ts src/__tests__/dashboard-priority-tasks.test.ts
git commit -m "feat(dashboard): derive role priority tasks"
```

### Task 2: 공통 한 줄 목록과 교사 화면

**파일:**
- 생성: `src/components/shared/PriorityTaskList.tsx`
- 수정: `src/app/(teacher)/teacher-dashboard/TeacherTodayTasksCard.tsx`
- 수정: `src/app/(teacher)/teacher-dashboard/page.tsx`
- 수정: `src/app/(teacher)/teacher-students/page.tsx`
- 수정: `messages/ko.json`
- 수정: `messages/en.json`
- 생성 시험: `src/__tests__/priority-task-list.render.test.tsx`
- 수정 시험: `src/__tests__/core-screen-layout-improvements.test.ts`

**입력과 출력:**
- `PriorityTaskList`는 이미 정렬된 활성 항목 최대 세 개와 이동 처리를 받는다.
- 교사 카드는 `loading`, `ready`, `error` 상태를 받아 준비 전 완료 표시를 막는다.
- `filter=attention`은 질문 없음 또는 미작성 수업이 남은 학생 합집합을 보여 준다.

- [ ] **단계 1: 실패 시험 작성**

```tsx
render(<PriorityTaskList items={[
  { key: "a", label: "부적절 의심 활동", countLabel: "3건" },
  { key: "b", label: "검토할 추천 포인트", countLabel: "2건" },
  { key: "c", label: "지도가 필요한 학생", countLabel: "5명" },
  { key: "d", label: "숨길 항목", countLabel: "1건" },
]} onSelect={vi.fn()} />);
expect(screen.getAllByRole("button")).toHaveLength(3);
expect(screen.queryByText("숨길 항목")).not.toBeInTheDocument();
```

정적 검사에는 예전 교사 항목 `taskNoQuestionsTitle`, `taskUnfinishedSessionsTitle`, `taskDecliningTitle`을 조합하지 않는다는 기대를 추가한다.

- [ ] **단계 2: 실패 확인**

```bash
npx vitest run src/__tests__/priority-task-list.render.test.tsx src/__tests__/core-screen-layout-improvements.test.ts
```

- [ ] **단계 3: 목록과 조회 상태 구현**

`PriorityTaskList`는 `divide-y` 목록과 `ChevronRight` 아이콘을 사용한다. 교사 화면은 각 조회의 `isSuccess`, `isPending`, `isError`, `refetch`를 조합하고 준비된 실제 값만 집계 함수에 전달한다. 오류 상태에서는 다시 불러오기 단추를 제공한다.

교사 학생 화면은 `filter=attention`일 때 질문이 없거나 `sessionProgress.remaining > 0`인 학생만 남기고 활성 필터 안내와 해제 행동을 보여 준다.

- [ ] **단계 4: 관련 시험 통과 확인**

```bash
npx vitest run src/__tests__/dashboard-priority-tasks.test.ts src/__tests__/priority-task-list.render.test.tsx src/__tests__/core-screen-layout-improvements.test.ts
npx eslint src/components/shared/PriorityTaskList.tsx 'src/app/(teacher)/teacher-dashboard/page.tsx' 'src/app/(teacher)/teacher-dashboard/TeacherTodayTasksCard.tsx' 'src/app/(teacher)/teacher-students/page.tsx'
```

- [ ] **단계 5: 커밋**

```bash
git add src/components/shared/PriorityTaskList.tsx 'src/app/(teacher)/teacher-dashboard' 'src/app/(teacher)/teacher-students/page.tsx' messages/ko.json messages/en.json src/__tests__/priority-task-list.render.test.tsx src/__tests__/core-screen-layout-improvements.test.ts
git commit -m "feat(dashboard): prioritize teacher actions"
```

### Task 3: 학생 화면 단순화

**파일:**
- 수정: `src/app/(student)/student-dashboard/page.tsx`
- 수정: `src/app/(student)/student-dashboard/StudentDashboardTasksCard.tsx`
- 수정: `messages/ko.json`
- 수정: `messages/en.json`
- 수정 시험: `src/__tests__/student-dashboard-split.test.ts`
- 수정 시험: `src/__tests__/core-screen-layout-improvements.test.ts`

- [ ] **단계 1: 실패 검사 추가**

```ts
expect(pageSource).toContain("buildStudentPriorityCounts");
expect(pageSource).not.toContain('key: "futureUnasked"');
expect(pageSource).not.toContain('key: "shared"');
expect(pageSource).not.toContain('key: "comments"');
expect(pageSource).not.toContain('key: "points"');
expect(taskCardSource).toContain("PriorityTaskList");
expect(taskCardSource).not.toContain("progressPercent");
```

- [ ] **단계 2: 실패 확인**

```bash
npx vitest run src/__tests__/student-dashboard-split.test.ts src/__tests__/core-screen-layout-improvements.test.ts
```

- [ ] **단계 3: 학생 목록 구현**

질문, 수업과 알림 조회 상태를 별도로 추적한다. 읽지 않은 교사 요청, 오늘 미작성 수업과 지난 미작성 수업만 집계한다. 교사 요청 수업은 다른 두 항목에서 제외한다. 포인트 조회와 포인트 위치 강조 상태는 할 일에서 제거하되 기존 `PointsCard`는 유지한다.

- [ ] **단계 4: 시험 통과 확인**

```bash
npx vitest run src/__tests__/dashboard-priority-tasks.test.ts src/__tests__/priority-task-list.render.test.tsx src/__tests__/student-dashboard-split.test.ts src/__tests__/core-screen-layout-improvements.test.ts
npx eslint 'src/app/(student)/student-dashboard/page.tsx' 'src/app/(student)/student-dashboard/StudentDashboardTasksCard.tsx'
```

- [ ] **단계 5: 커밋**

```bash
git add 'src/app/(student)/student-dashboard' messages/ko.json messages/en.json src/__tests__/student-dashboard-split.test.ts src/__tests__/core-screen-layout-improvements.test.ts
git commit -m "feat(dashboard): focus student next actions"
```

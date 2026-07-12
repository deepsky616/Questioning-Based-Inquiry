# 학생 질문연습 메뉴 순서 구현 계획

> **에이전트 작업 필수 절차:** `superpowers:subagent-driven-development` 또는 `superpowers:executing-plans`를 사용하고, 동작 변경 전에 실패 시험을 확인한다.

**목표:** 학생 공통 이동 메뉴에서 질문연습을 질문하기 바로 왼쪽으로 옮긴다.

**구조:** 상단과 하단 이동 메뉴가 함께 사용하는 `STUDENT_PAGES` 배열의 자료 순서만 바꾼다. CSS 시각 순서는 사용하지 않아 표시 순서, 문서 순서, 키보드 이동 순서를 같게 유지한다.

**기술 구성:** Next.js, React, TypeScript, Vitest

## 전체 제약

- 최종 순서는 `홈 -> 질문연습 -> 질문하기 -> 질문탐구 -> 질문놀이 -> 설정`이다.
- 경로, 번역 문구, 화면 내용, 권한, API, 데이터베이스는 바꾸지 않는다.
- 다른 작업 중인 파일은 커밋에 포함하지 않는다.

---

### 작업 1: 학생 이동 메뉴 순서 변경

**파일:**
- 수정: `src/__tests__/student-navigation-order.test.ts`
- 수정: `src/app/(student)/layout.tsx`

**연결 규약:**
- 입력: `STUDENT_PAGES` 배열
- 출력: `AppNav`와 `PageNav`가 공유하는 새 메뉴 순서

- [ ] **1단계: 실패 시험 작성**

기존 시험의 이름과 순서 단언을 다음 요구로 바꾼다.

```ts
it("places practice immediately before asking in the student learning flow", () => {
  const practiceIndex = layoutSource.indexOf('{ href: "/student-practice", key: "practice" }');
  const askIndex = layoutSource.indexOf('{ href: "/student-ask", key: "ask" }');
  const exploreIndex = layoutSource.indexOf('{ href: "/student-questions", key: "explore" }');
  const playIndex = layoutSource.indexOf('{ href: "/student-question-play", key: "questionPlay" }');

  expect(practiceIndex).toBeGreaterThan(-1);
  expect(askIndex).toBeGreaterThan(-1);
  expect(exploreIndex).toBeGreaterThan(-1);
  expect(playIndex).toBeGreaterThan(-1);
  expect(practiceIndex).toBeLessThan(askIndex);
  expect(askIndex).toBeLessThan(exploreIndex);
  expect(exploreIndex).toBeLessThan(playIndex);
});
```

- [ ] **2단계: 실패 확인**

실행: `npm test -- --run src/__tests__/student-navigation-order.test.ts`

기대: 현재 질문연습이 질문하기 뒤에 있으므로 새 순서 시험이 실패한다.

- [ ] **3단계: 최소 구현**

`STUDENT_PAGES`와 바로 위 설명을 다음 순서로 바꾼다.

```ts
// 학습 흐름 순서: 홈(대시보드+상세 리포트 탭) -> 질문연습 -> 질문하기 -> 질문탐구 -> 질문놀이 -> 설정
const STUDENT_PAGES = [
  { href: "/student-dashboard", key: "dashboard" },
  { href: "/student-practice", key: "practice" },
  { href: "/student-ask", key: "ask" },
  { href: "/student-questions", key: "explore" },
  { href: "/student-question-play", key: "questionPlay" },
  { href: "/student-settings", key: "settings" },
] as const;
```

- [ ] **4단계: 관련 시험 통과 확인**

실행: `npm test -- --run src/__tests__/student-navigation-order.test.ts`

기대: 학생 순서와 공용 이동 메뉴 시험이 모두 통과한다.

- [ ] **5단계: 전체 검증**

실행:

```bash
npm test
npm run lint
npm run build
git diff --check
```

기대: 전체 시험, 린트, 데이터베이스 검사와 운영 빌드가 통과하고 공백 오류가 없다.

- [ ] **6단계: 커밋과 푸시**

```bash
git add 'src/app/(student)/layout.tsx' src/__tests__/student-navigation-order.test.ts
git commit -m "fix(student): place practice before asking"
git push origin main
```

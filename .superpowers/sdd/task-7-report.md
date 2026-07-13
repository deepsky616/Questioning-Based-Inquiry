# 작업 7 보고서

## 상태

`DONE_WITH_CONCERNS`

교사 담당 학급의 최근 질문 연습을 학생별 최신 100개로 진단하고, 기존 오늘 및 최근 7일 포인트와 성공 횟수를 함께 제공하도록 구현했다. 교사 화면에는 학급 요약, 유형 선택, 학생별 펼침 진단, 표본 없음 동작을 추가했고 수업 활용 자료에서 같은 선택 주소로 학급 진단을 열 수 있게 연결했다.

## 처음 실패한 시험

- `npm test -- src/__tests__/practice-stats-route.test.ts`
  - 처음 실행 결과: 9개 중 2개 통과, 7개 실패
  - 실패 원인: 기존 응답에 `summary`가 없고 원시 연습 시도 조회, 학생별 상한, 담당 밖 행 방어가 구현되지 않았다.
- `npm test -- src/__tests__/teacher-practice-diagnostics.render.test.tsx`
  - 처음 실행 결과: 7개 중 1개 통과, 6개 실패
  - 실패 원인: 주소의 `view=stats` 소비, 학급 요약과 학생 펼침, 오류 우선 표시, 표본 없음 동작, 복사 상태, 수업 활용 연결이 없었다.
- 이후 주소 동기화 시험도 먼저 실패를 확인했다.
  - 통계 주소의 `focus` 변경 뒤 유형 선택이 바뀌지 않았다.
  - 바깥 보기 탭 클릭 뒤 `view` 주소가 갱신되지 않았다.

## 구현 내용

- 최근 30일을 기준으로 담당 학생마다 `created_at DESC, id DESC` 순서의 최근 101개를 한 번에 조회한다.
- 원시 행을 허용된 담당 학생 식별값으로 다시 걸러 앞 100개만 진단하고, 101번째는 학생별 `capped`에만 반영한다.
- 학급 요약은 학생마다 앞 100개를 합쳐 공통 `buildPracticeDiagnostic`으로 계산한다.
- 학교 없음과 담당 학생 없음도 `{ summary, students }` 성공 응답 모양을 유지한다.
- 기존 담당 학급 범위, 학생 정렬, 오늘 및 최근 7일 포인트, 세 연습 모드의 성공 횟수를 보존한다.
- `view`는 교사 바깥 보기에, `tab`, `quizMode`, `focus`는 공통 연습 선택에 사용한다. 탭 클릭과 같은 경로의 주소 변경도 상태에 맞춘다.
- 통계 오류를 빈 자료보다 먼저 `role="alert"`로 표시하고 다시 시도를 제공한다.
- 단일 반응형 학생 행에서 한 개의 펼침 단추로 모드별 및 유형별 지표를 표시한다.
- 표본이 없는 선택 유형에는 내장 연습 미리보기, 전체 학생용 주소 복사, 문항 은행 관리를 나누어 제공하고 복사 성공과 실패를 알린다.
- 표본 부족으로 추천된 유형은 가장 약한 유형이라고 표시하지 않는다.
- 초점이 있는 수업 활용 항목은 공통 직렬화 함수로 `view=stats` 주소를 만든다.
- 데이터베이스 구조와 옮김 파일은 변경하지 않았다.

## 변경 파일

- `src/app/api/teacher/practice-stats/route.ts`
- `src/app/(teacher)/teacher-practice/page.tsx`
- `src/components/teacher/TeacherQuestionLearningGuide.tsx`
- `messages/ko.json`
- `messages/en.json`
- `src/__tests__/practice-stats-route.test.ts`
- `src/__tests__/teacher-practice-diagnostics.render.test.tsx`
- `.superpowers/sdd/task-7-report.md`

## 최종 검증

- `npm test -- src/__tests__/practice-stats-route.test.ts src/__tests__/teacher-practice-diagnostics.render.test.tsx`
  - 통과: 2개 파일, 18개 시험
- `npm test -- src/__tests__/practice-stats-route.test.ts src/__tests__/teacher-practice-diagnostics.render.test.tsx src/__tests__/question-learning.render.test.tsx src/__tests__/question-practice-handoff.render.test.tsx src/__tests__/practice-selection.test.ts`
  - 통과: 5개 파일, 48개 시험
- `npm run lint`
  - 통과
- `npx tsc --noEmit`
  - 통과
- `git diff --check`
  - 통과
- `npm test`
  - 작업 7 시험을 포함해 135개 파일 중 134개 통과, 1개 실패
  - 1036개 시험 중 1035개 통과, 1개 실패
  - 남은 실패는 작업 7 밖의 `src/__tests__/core-screen-component-split.test.ts`가 `PointReviewView`에서 정확한 `usePointReview()` 문자열을 기대하지만 동시 작업 구현은 `usePointReview({ classFilter })`를 사용하는 불일치다.
- 전체 빌드는 지시대로 실행하지 않았다. 작업 8에서 수행한다.

## 자체 검토와 우려

- 별도 검토에서 주소 상태 동기화와 최신 100개 선택 시험을 보강한 뒤 높은 위험은 남지 않았다고 확인했다.
- 전체 시험 한 건은 작업 7 밖의 동시 변경 때문에 실패한다. 해당 파일은 수정하거나 커밋하지 않았다.
- 실제 PostgreSQL을 사용한 원시 질의 통합 시험과 작은 화면의 자동 접근성 검사는 이번 작업 범위에 없다.

# 작업 6 보고서: 학생 개인 진단과 맞춤 연습 이동

## 결과

- 학생만 본인의 최근 30일 연습 시도를 조회하는 경로를 추가했다.
- 최근 시도는 최신순으로 101개까지 읽고 앞의 100개만 기존 진단 함수에 넘긴다. 101번째가 있으면 `capped: true`를 반환한다.
- 연습 주소의 `tab`, `quizMode`, `focus`를 허용 목록으로 읽고 쓰는 공통 선택 모듈을 추가했다.
- 학생과 교사 연습 페이지가 같은 선택 파서를 사용하고 공통 연습 화면에 `initialSelection`을 넘긴다.
- 학생 화면에 불러오기, 오류와 다시 시도, 자료 없음, 진단 완료의 네 상태를 가진 개인 진단 요약을 추가했다.
- 추천 유형에 맞는 분류 문항만 출제하되 일치 문항이 없으면 전체 문항 묶음으로 돌아간다.
- 현재 추천 초점을 `{유형} 집중`으로 표시하고 학생이 축을 직접 바꾸면 표시를 없앤다.
- 커스텀 문항이 도착해도 추천 초점과 다른 유형은 남은 문항 묶음에서 제외한다.
- 선택 변경 때 문항, 답, 지급 상태를 초기화하고 늦은 분류 지급 응답과 기존 판정 응답을 무효화한다.

## 시험 우선 증거

처음 실행한 명령:

```bash
npm test -- src/__tests__/practice-progress-route.test.ts src/__tests__/practice-progress-summary.render.test.tsx src/__tests__/practice-selection.test.ts src/__tests__/question-practice-data.test.ts
```

구현 전 결과는 시험 파일 4개가 모두 실패했다. 각 실패 원인은 새 조회 경로, 새 진단 요약 구성요소, 새 선택 모듈이 아직 없기 때문이었다. 오타나 잘못된 모킹 때문에 난 실패는 없었다.

구현 뒤 집중 검증:

```bash
npm test -- src/__tests__/practice-progress-route.test.ts src/__tests__/practice-progress-summary.render.test.tsx src/__tests__/practice-selection.test.ts src/__tests__/question-practice-data.test.ts src/__tests__/question-practice-handoff.render.test.tsx
```

- 시험 파일 5개 통과
- 시험 39개 통과
- 실패 0개

전체 검증:

```bash
npm test
npm run lint
npx tsc --noEmit --pretty false
git diff --check
```

- 전체 시험 파일 134개 통과
- 전체 시험 1021개 통과
- 전체 린트 통과
- 자료형 검사 통과
- 차이 공백 검사 통과

## 변경 파일

새 파일:

- `src/lib/practice-selection.ts`
- `src/app/api/practice/progress/route.ts`
- `src/components/student/PracticeProgressSummary.tsx`
- `src/__tests__/practice-progress-route.test.ts`
- `src/__tests__/practice-progress-summary.render.test.tsx`
- `src/__tests__/practice-selection.test.ts`
- `.superpowers/sdd/task-6-report.md`

수정 파일:

- `src/app/(student)/student-practice/page.tsx`
- `src/app/(teacher)/teacher-practice/page.tsx`
- `src/components/shared/QuestionPracticeView.tsx`
- `messages/ko.json`
- `messages/en.json`
- `src/__tests__/question-practice-data.test.ts`
- `src/__tests__/question-practice-handoff.render.test.tsx`

## 자체 검토

- 비로그인과 학생 아닌 역할에서는 데이터 조회를 하지 않는다.
- 조회 조건에 세션 학생 식별값만 사용하며 요청에서 학생 식별값을 받지 않는다.
- 날짜 하한, 최신순, 101개 조회, 100개 진단의 경계를 시험으로 고정했다.
- 주소 파서는 잘못된 탭, 축, 축과 맞지 않는 유형을 안전한 기본값으로 되돌린다.
- 직렬화한 선택을 다시 읽는 왕복과 학생 및 교사 페이지의 공통 파서 사용을 시험했다.
- 네 화면 상태, 추천 주소, 다시 시도 호출, 학생 순위 문구 부재를 렌더 시험으로 확인했다.
- 추천 유형 제한, 빈 문항 묶음 복귀, 커스텀 문항의 초점 유지, 현재 초점 표시를 시험했다.
- 선택 재렌더, 답과 지급 상태 초기화, 늦은 지급 응답 무시를 시험했다.
- 기존 인공지능 판정 요청 식별값 무효화 시험도 그대로 통과했다.
- 데이터베이스 구조와 마이그레이션은 바꾸지 않았다.

## 남은 제한과 우려

- 진단은 요구대로 최근 100개 시도만 사용하므로 최근 30일 안에 시도가 더 많아도 그 이전 시도는 결과에 포함되지 않는다.
- 진단 요약은 학생 본인 결과만 보여 주며 학급 비교나 순위 자료를 의도적으로 포함하지 않는다.
- 문항 묶음이 비는 경우 전체 묶음으로 돌아가므로 추천 유형의 커스텀 문항이 없어도 연습 화면은 멈추지 않는다.

## 검토 수정: 선택 전환 상태 초기화

검토에서 발견된 두 상태 유지 결함을 시험 우선으로 수정했다.

- 주소의 `initialSelection`이 바꾸기에서 만들기로 바뀔 때 이전 입력을 지운다.
- 분류 답을 제출한 뒤 직접 탭을 왕복하면 이전 답과 지급 상태를 지운다.
- 직접 탭을 떠날 때 지급 요청 식별값을 올려 늦은 이전 응답을 무시한다.

실패 확인:

```bash
npm test -- src/__tests__/question-practice-handoff.render.test.tsx
```

- 시험 11개 중 새 회귀 시험 2개 실패, 기존 시험 9개 통과
- 주소 선택 뒤 바꾸기 입력이 만들기 입력에 남아 실패
- 직접 탭 왕복 뒤 분류 정답 상태가 남아 실패

수정 뒤 검증:

```bash
npm test -- src/__tests__/question-practice-handoff.render.test.tsx
npm test -- src/__tests__/practice-progress-route.test.ts src/__tests__/practice-progress-summary.render.test.tsx src/__tests__/practice-selection.test.ts src/__tests__/question-practice-data.test.ts src/__tests__/question-practice-handoff.render.test.tsx
npm run lint
npx tsc --noEmit --pretty false
git diff --check
```

- 연습 화면 렌더 시험 11개 통과
- 작업 6 집중 시험 파일 5개, 시험 41개 통과
- 전체 린트 통과
- 자료형 검사 통과
- 차이 공백 검사 통과

이번 수정 파일:

- `src/components/shared/QuestionPracticeView.tsx`
- `src/__tests__/question-practice-handoff.render.test.tsx`
- `.superpowers/sdd/task-6-report.md`

추가 자체 검토:

- 주소 선택 변경은 `resetCheck`를 사용해 입력, 판정 결과, 오류, 진행 상태를 함께 초기화한다.
- 직접 다른 탭으로 이동할 때만 분류 답과 지급 요청을 무효화해 선택된 현재 탭을 다시 누르는 동작에는 영향을 주지 않는다.
- 늦은 지급 응답 뒤 새 분류 답을 제출해도 이전 99 포인트가 나타나지 않고 현재 1 포인트만 나타나는 시험으로 요청 경계를 확인했다.

# 질문놀이별 참여 방식 현황 구현 계획

> **에이전트 작업 필수 절차:** 동작 변경마다 실패 검사를 먼저 확인하고, 구현 뒤 관련 검사와 전체 검증을 실행한다.

**목표:** 질문놀이 학습 기록에 놀이별 혼자, 인공지능, 친구 참여 현황을 그래프와 정확한 수치로 제공한다.

**구조:** 학생 이력 서비스는 기존 완료 행을 놀이와 방식으로 다시 묶어 `gameModes`를 반환한다. 교사 화면은 이미 받은 놀이별 학생 통계에서 선택 학급만 걸러 같은 자료 계약으로 변환한다. 공용 그래프 구성 요소는 개인 횟수 그래프와 학급 참여율 및 완료율 전환 화면을 그린다.

**기술 구성:** Next.js, React, TypeScript, Prisma, PostgreSQL, Recharts, Vitest, Testing Library

## 전체 제약

- 기존 질문놀이 기록과 포인트 자료를 변경하지 않는다.
- 데이터베이스 구조를 변경하지 않는다.
- 기록이 있는 기본 놀이만 그래프와 표에 표시한다.
- 기존 최근 6주 변화와 전체 방식 요약은 유지한다.

---

### 작업 1: 놀이별 방식 집계 계약

**파일:**
- 수정: `src/lib/question-game-history.ts`
- 수정: `src/lib/question-game-history-service.ts`
- 시험: `src/__tests__/question-game-history-service.test.ts`
- 시험: `src/__tests__/question-game-learning-history.test.ts`

- [x] 실패 검사에 놀이, 방식, 완료 횟수, 참여 학생 수 결과를 추가한다.
- [x] 실패가 새 `gameModes` 자료가 없기 때문인지 확인한다.
- [x] 기존 완료 행에 학생 식별값을 포함하고 놀이와 방식별 집계를 추가한다.
- [x] 개인 이력 생성 함수도 같은 계약을 반환하게 한다.
- [x] 관련 단위 검사가 통과하는지 확인한다.

### 작업 2: 교사용 선택 학급 자료 변환

**파일:**
- 수정: `src/components/question-games/TeacherQuestionGameLearningOverview.tsx`
- 시험: `src/__tests__/teacher-question-game-learning-overview.render.test.tsx`

- [x] 선택 학급 밖 학생이 집계에서 제외되는 실패 검사를 추가한다.
- [x] 놀이별 각 방식의 참여 학생 수, 시작 횟수, 완료 횟수를 계산한다.
- [x] 선택 학급 학생 수를 공용 학습 기록 화면으로 전달한다.
- [x] 관련 화면 검사가 통과하는지 확인한다.

### 작업 3: 놀이별 방식 그래프와 표

**파일:**
- 수정: `src/components/question-games/QuestionGameLearningCharts.tsx`
- 수정: `src/components/question-games/QuestionGameLearningHistory.tsx`
- 수정: `messages/ko.json`
- 수정: `messages/en.json`
- 시험: `src/__tests__/question-game-learning-history.render.test.tsx`
- 시험: `src/__tests__/teacher-question-game-learning-overview.render.test.tsx`

- [x] 학생의 놀이별 방식 그래프 문구와 교사의 전환 단추 및 표를 실패 검사로 고정한다.
- [x] 학생은 완료 횟수, 교사는 학급 대비 참여율을 가로 막대로 표시한다.
- [x] 교사 화면에 참여 현황과 완료율 전환을 추가한다.
- [x] 참여 학생 수와 완료 횟수를 보여 주는 표와 화면 읽기용 요약을 추가한다.
- [x] 한국어와 영어 문구 구조가 같은지 확인한다.

### 작업 4: 전체 검증과 배포 저장소 반영

**파일:**
- 위 작업에서 변경한 파일 전체

- [x] 관련 검사와 전체 검사를 실행한다.
- [x] 형 검사, 코드 검사, 번역 자료 검사와 제품 빌드를 실행한다.
- [x] 개발 서버에서 화면 응답을 확인한다.

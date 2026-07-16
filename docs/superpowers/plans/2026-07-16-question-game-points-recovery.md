# 질문놀이 포인트 복구 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버가 확인한 친구 방 활동의 포인트를 빠짐없이 한 번만 지급하고, 혼자 및 도움 모드의 서버 실행 기반을 단계적으로 연결한다.

**Architecture:** 친구 방은 기존 버전 2 방 상태와 점수 근거 판독기를 그대로 사용하고 완료 저장 직후 멱등 보장 서비스를 실행한다. 혼자 및 도움 모드는 추가 전용 `GameRun`과 `GameActivity`를 도입해 화면 완료값이 아니라 서버 활동 기록으로 정산한다.

**Tech Stack:** Next.js 경로 처리기, TypeScript, Prisma, PostgreSQL, Vitest, Testing Library, Playwright

## Global Constraints

- 기존 사용자, 질문, 수업, 방, 포인트 기록을 옮기거나 다시 계산하지 않는다.
- `ExploreQuestionsView.tsx`, `MyQuestionsView.tsx`, `comment-draft-preservation.render.test.tsx`의 기존 작업을 건드리지 않는다.
- 클라이언트가 보낸 참가자, 활동 수, 점수, 완료값을 포인트 근거로 신뢰하지 않는다.
- 정상 완료가 아닌 방장 종료와 참가자 부족 종료에는 지급하지 않는다.
- 친구 방 120점, 혼자 30점, 도움 50점의 학생별 하루 상한을 적용한다.

---

### Task 1: 친구 방 지급 대상과 권한 경계

**Files:**
- Modify: `src/lib/question-games-data.ts`
- Modify: `src/lib/point-award-service.ts`
- Modify: `src/app/api/points/award/route.ts`
- Test: `src/__tests__/points-award-route.test.ts`

**Interfaces:**
- Consumes: 저장된 버전 2 `GameRoom`, 인증 사용자 식별값
- Produces: `ensureCompletedRoomGamePoints(body, userId)` 멱등 지급 함수

- [ ] 학생 방장을 포함한 실제 `STUDENT` 참가자를 지급 대상으로 고정하는 실패 시험을 추가한다.
- [ ] 교사 방장, 학생 방장, 일반 참가자가 같은 완료 실행을 보장할 수 있는 권한 시험을 추가한다.
- [ ] 완료 전, 비정상 종료, 방 비참가자 요청이 거절되는 시험을 추가한다.
- [ ] 실제 사용자 역할을 다시 조회하고 기존 실행 키와 잠금으로 지급하는 최소 구현을 추가한다.
- [ ] `npm test -- src/__tests__/points-award-route.test.ts`를 실행해 통과를 확인한다.

### Task 2: 완료 저장 직후 자동 지급과 복구

**Files:**
- Modify: `src/app/api/question-games/rooms/[code]/route.ts`
- Modify: `src/lib/question-game-award-publish-service.ts`
- Test: `src/__tests__/question-game-room-route.test.ts`
- Test: `src/__tests__/game-award-publish-route.test.ts`

**Interfaces:**
- Consumes: Task 1의 `ensureCompletedRoomGamePoints`
- Produces: 완료 명령 응답 전 자동 정산, 인증 참가자의 검증 결과 공개

- [ ] 정상 완료 명령이 저장된 뒤 자동 지급을 한 번 호출하는 실패 시험을 추가한다.
- [ ] 지급 호출 실패가 완료된 방 상태를 되돌리지 않고 다음 조회에서 복구되는 시험을 추가한다.
- [ ] 클라이언트 결과 본문 없이 실제 점수 기록만 공개되는 시험을 유지한다.
- [ ] 완료 저장 뒤 보장 서비스를 호출하고 결과 공개 권한을 현재 참가자로 넓힌다.
- [ ] 관련 경로 시험을 실행해 통과를 확인한다.

### Task 3: 결과 화면의 멱등 복구

**Files:**
- Modify: `src/app/(student)/student-question-play/games/RoomResult.tsx`
- Test: `src/__tests__/room-result-award.test.tsx`

**Interfaces:**
- Consumes: Task 1의 포인트 보장 경로, Task 2의 공개 결과
- Produces: 모든 인증 참가자가 실행별 한 번 시도하는 결과 화면

- [ ] 학생 방장과 일반 참가자가 완료 결과에서 보장 요청을 보내는 실패 시험을 추가한다.
- [ ] 같은 방 수명에서 다시 그려져도 겹친 요청을 만들지 않는 시험을 유지한다.
- [ ] 실패 안내와 재시도 단추가 학생에게도 보이는 시험을 추가한다.
- [ ] 역할과 방장 조건을 제거하고 서버 검증 완료 조건만으로 요청하도록 구현한다.
- [ ] `npm test -- src/__tests__/room-result-award.test.tsx`를 실행해 통과를 확인한다.

### Task 4: 친구 방 상한과 동시 처리

**Files:**
- Modify: `src/lib/points-policy.ts`
- Modify: `src/lib/point-award-service.ts`
- Test: `src/__tests__/points-award-route.test.ts`

**Interfaces:**
- Consumes: 승인된 친구 방 `PointLog.createdAt`, 완료 시각
- Produces: `DAILY_LIMITS.FRIEND = 120`을 적용한 원자 정산

- [ ] 상한 직전, 일부 남음, 이미 상한 도달 시험을 추가한다.
- [ ] 같은 실행의 동시 요청에서 총점과 기록이 한 번만 늘어나는 시험을 추가한다.
- [ ] 거래 안에서 학생 행을 정렬해 잠그고 남은 상한 안에서 항목별 점수를 줄이지 않는 단일 합계 정산을 구현한다.
- [ ] 점수 분석 실패가 기본 점수 지급을 막지 않는 시험을 추가한다.
- [ ] 관련 점수 시험을 실행해 통과를 확인한다.

### Task 5: 혼자 및 도움 모드 공통 실행 기반

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260716000000_add_question_game_runs/migration.sql`
- Create: `src/lib/question-game-run-service.ts`
- Create: `src/app/api/question-games/runs/route.ts`
- Create: `src/app/api/question-games/runs/[id]/actions/route.ts`
- Create: `src/app/api/question-games/runs/[id]/complete/route.ts`
- Create: `src/app/api/question-games/runs/[id]/result/route.ts`
- Test: `src/__tests__/question-game-run-routes.test.ts`

**Interfaces:**
- Produces: 실행 생성, 활동 명령, 완료, 결과 조회 경로와 `GameRun`, `GameActivity`

- [ ] 같은 생성 요청 식별값 재전송은 같은 실행을 돌려주고 다른 본문 재사용은 거절하는 시험을 추가한다.
- [ ] 실행 소유자와 현재 버전, 활동 순서, 요청 식별값을 검증하는 실패 시험을 추가한다.
- [ ] 서버 완료 조건을 만족한 실행만 일일 상한 안에서 한 번 지급하는 시험을 추가한다.
- [ ] 기존 행을 바꾸지 않는 추가 전용 마이그레이션과 서비스 경로를 구현한다.
- [ ] Prisma 검증과 실행 경로 시험을 통과시킨다.

### Task 6: 일곱 지역 놀이 세로 연결

**Files:**
- Create: `src/lib/question-game-run-engine.ts`
- Create: `src/lib/question-game-run-engines/relay.ts`
- Create: `src/lib/question-game-run-engines/turn-games.ts`
- Create: `src/lib/question-game-run-engines/ladder.ts`
- Create: `src/lib/question-game-run-engines/memory.ts`
- Create: `src/lib/question-game-run-engines/mystery.ts`
- Create: `src/lib/game-point-capabilities.ts`
- Create: `src/app/(student)/student-question-play/games/useGameRun.ts`
- Modify: `src/app/(student)/student-question-play/games/RelayGame.tsx`
- Modify: `src/app/(student)/student-question-play/games/DiceGame.tsx`
- Modify: `src/app/(student)/student-question-play/games/KabaGame.tsx`
- Modify: `src/app/(student)/student-question-play/games/LadderGame.tsx`
- Modify: `src/app/(student)/student-question-play/games/StoryDiceGame.tsx`
- Modify: `src/app/(student)/student-question-play/games/MemoryGame.tsx`
- Modify: `src/app/(student)/student-question-play/games/MysteryBoxGame.tsx`
- Test: `src/__tests__/points-award-single-route.test.ts`
- Test: `src/__tests__/question-game-local-points.test.tsx`

**Interfaces:**
- Consumes: Task 5의 실행 경로
- Produces: 서버 응답으로 진행하고 완료 결과에 실제 지급 내역을 표시하는 일곱 놀이

- [ ] 방장과 최소 두 명을 전제로 하는 방 판정기를 억지로 재사용하지 않고, 혼자 실행의 학생 한 명과 선택 인공지능 차례를 다루는 공통 실행 판정 계층을 만든다.
- [ ] 이어 말하기의 시작, 학생 질문, 완료를 서버 실행으로 바꾸고 시험을 통과시킨다.
- [ ] 질문 주사위, 까바놀이, 질문 사다리, 이야기 주사위를 같은 공통 훅에 연결한다.
- [ ] 짝 찾기와 미스터리 상자의 숨은 상태를 서버에 두고 화면에는 공개 상태만 반환한다.
- [ ] 인공지능 동작이 학생 활동 점수에 포함되지 않는 시험을 추가한다.
- [ ] 일곱 놀이의 혼자 및 도움 모드 완료와 중복 요청 시험을 통과시킨다.

### Task 7: 전체 검증과 배포 준비

**Files:**
- Modify: `docs/superpowers/specs/2026-07-16-question-game-points-recovery-design.md`
- Modify: `docs/superpowers/plans/2026-07-16-question-game-points-recovery.md`

**Interfaces:**
- Consumes: Task 1부터 Task 6까지의 구현
- Produces: 배포 가능한 검증 기록

- [ ] 관련 질문놀이와 포인트 시험 전체를 실행한다.
- [ ] `npm run build`를 실행해 형식과 서버 묶음을 검증한다.
- [ ] 개발 서버에서 학생 둘의 친구 방 완료와 학생 총점 증가를 화면 시험으로 확인한다.
- [ ] 혼자 및 도움 모드의 서버 실행과 상한 표시를 화면 시험으로 확인한다.
- [ ] 관련 파일만 단계적으로 커밋하고 원격 `main`에 푸시한다.

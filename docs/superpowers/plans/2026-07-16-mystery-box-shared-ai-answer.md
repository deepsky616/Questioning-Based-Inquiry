# 친구방 미스터리박스 혼합 답변 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 친구방 미스터리박스에서 규칙이 모르는 자연스러운 질문을 서버 에이아이로 판정하고 모든 참가자에게 같은 답을 안전하게 공유한다.

**Architecture:** 기존 동기식 방 판정기를 사전 검사로 유지한다. 규칙 결과가 `unknown`이면 상태를 바꾸지 않는 서버 전용 `resolution-required` 결과를 만들고, 에이아이 답을 바인딩한 해결값으로 같은 명령을 다시 판정한 뒤 기존 버전 조건 저장을 사용한다.

**Tech Stack:** Next.js, TypeScript, Vitest, Google Gen AI SDK, Zod, Prisma 기반 방 저장소

## Global Constraints

- 비밀 물건은 서버에만 둔다.
- 기존 출처 없는 방 기록을 계속 읽는다.
- 에이아이 실패 시 질문과 차례를 소비하지 않는다.
- 클라이언트가 보낸 답이나 답 출처는 신뢰하지 않는다.
- 에이아이 보완 호출은 사용자별 분당 스무 번으로 제한한다.

---

### Task 1: 상태 출처와 서버 전용 해결값

**Files:**
- Modify: `src/lib/mystery-box-rules.ts`
- Modify: `src/lib/question-game-room-engine.ts`
- Modify: `src/lib/question-game-room-engines/mystery.ts`
- Test: `src/__tests__/question-game-room-engine-mystery.test.ts`

**Interfaces:**
- Produces: `MysteryAnswerResolution`, 선택 항목 `answerSource?: "ai"`
- Consumes: 기존 `MysteryAnswer`, `classifyMysteryQuestion`

- [ ] **Step 1: 에이아이 출처 기록과 위조 해결값 거절 시험을 추가한다.**
- [ ] **Step 2: 시험을 실행해 새 동작이 아직 없어 실패하는지 확인한다.**
- [ ] **Step 3: 해결값의 물건, 사용자, 언어, 질문을 모두 비교하고 규칙 결과가 `unknown`일 때만 사용한다.**
- [ ] **Step 4: 기존 기록은 규칙으로, 에이아이 출처 기록은 허용 열거값과 상태 구조로 검증한다.**
- [ ] **Step 5: 방 판정기 시험을 다시 실행해 통과를 확인한다.**

### Task 2: 제한된 구조화 에이아이 호출

**Files:**
- Modify: `src/lib/ai.ts`
- Create: `src/lib/mystery-box-ai-answer.ts`
- Create: `src/__tests__/mystery-box-ai-answer.test.ts`
- Test: `src/__tests__/ai-failover.test.ts`

**Interfaces:**
- Produces: `findMysteryAiAnswerRequest`, `generateMysteryAiAnswer`
- Consumes: `generateJson`, `MysteryAnswerResolution`, 변경된 방 판정 결과

- [ ] **Step 1: 규칙의 모름 결과만 요청으로 추출하고 엄격한 답만 받는 실패 시험을 추가한다.**
- [ ] **Step 2: 시험을 실행해 새 모듈 부재로 실패하는지 확인한다.**
- [ ] **Step 3: 공통 에이아이 호출에 선택적인 출력 토큰, 시간 제한, 제이슨 응답 틀 값을 추가한다.**
- [ ] **Step 4: 신뢰하지 않는 질문 자료와 비밀 물건을 분리한 구조화 답변 서비스를 구현한다.**
- [ ] **Step 5: 서비스 시험과 기존 에이아이 전환 시험을 실행한다.**

### Task 3: 방 경로 연결과 실패 보존

**Files:**
- Modify: `src/app/api/question-games/rooms/[code]/route.ts`
- Modify: `src/__tests__/question-game-room-command-route.test.ts`
- Test: `src/__tests__/game-room-route.test.ts`
- Test: `src/__tests__/room-mystery-box.test.tsx`

**Interfaces:**
- Consumes: `findMysteryAiAnswerRequest`, `generateMysteryAiAnswer`, `MysteryAnswerResolution`
- Produces: 규칙 우선, 에이아이 보완, 단일 저장 응답 흐름

- [ ] **Step 1: 미등록 질문 보완, 규칙 질문 미호출, 실패 시 미저장 시험을 추가한다.**
- [ ] **Step 2: 시험을 실행해 방 경로가 에이아이 보완을 하지 않아 실패하는지 확인한다.**
- [ ] **Step 3: 사전 판정 뒤 별도 호출 제한을 적용하고 해결값으로 원래 명령을 다시 판정한다.**
- [ ] **Step 4: 키 없음과 모델 오류를 안전한 재시도 응답으로 바꾸고 입력 보존 동작을 확인한다.**
- [ ] **Step 5: 저장 충돌, 재실행, 공개 상태 비밀 제거 시험을 실행한다.**

### Task 4: 전체 검증

**Files:**
- Modify: 구현 중 변경된 파일만 해당

**Interfaces:**
- Consumes: 앞선 모든 작업 결과
- Produces: 배포 가능한 검증 결과

- [ ] **Step 1: 미스터리박스 관련 시험 묶음을 실행한다.**
- [ ] **Step 2: 전체 단위 시험과 정적 검사를 실행한다.**
- [ ] **Step 3: 환경 검사가 포함된 전체 빌드를 실행한다.**
- [ ] **Step 4: 변경 차이와 작업 트리를 검토해 비밀 노출 및 불필요한 변경이 없는지 확인한다.**
- [ ] **Step 5: 구현 변경을 하나의 명확한 커밋으로 기록한다.**

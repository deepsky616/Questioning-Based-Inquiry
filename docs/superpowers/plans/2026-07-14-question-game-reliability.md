# 질문놀이 진행과 동기화 보완 구현 계획

> **작업 에이전트 안내:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`를 사용해 작업별 구현, 요구사항 검토와 코드 품질 검토를 진행한다. 모든 단계는 확인란 순서대로 진행한다.

**목표:** 일곱 질문놀이의 친구 방 인원, 라운드, 차례, 자동 종료와 공유 상태를 서버 규칙으로 통일하고, 질문 사다리와 모든 화면을 밝은 화면과 어두운 화면에서 안정적으로 사용할 수 있게 한다.

**구조:** 공통 규칙 모듈이 표시 자료와 인원 및 진행 목표를 소유한다. 친구 방은 실행 식별값과 명령 식별값을 가진 버전 `2` 상태를 사용하고, 순수 판정기가 놀이별 명령을 검증한 뒤 기존 조건부 저장소가 원자 저장한다. 놀이별 순수 모듈과 공용 화면 구성 요소를 혼자, 인공지능과 친구 모드가 함께 사용하며 점수 서비스는 서버에 저장된 완료 근거만 읽는다.

**기술 구성:** Next.js 16, React 19, TypeScript 5.5, Prisma 5.22, PostgreSQL 제이슨비, Vitest 4, Testing Library, Playwright 1.59, Tailwind CSS 3

## 전체 제약

- 데이터베이스 스키마, 표, 열, 보안 정책과 자료 이전 파일을 바꾸지 않는다.
- 기존 학생, 학급, 질문, 댓글, 알림, 점수와 완료 기록을 일괄 수정하지 않는다.
- 단위 및 브라우저 시험은 실제 연결 데이터베이스에 시험 자료를 만들거나 지우지 않는다.
- 친구 방은 최소 `2명`, 최대 `8명`이며 일곱 내장 놀이만 만들 수 있다.
- 한국어 인원 문구는 `2~8명`, 영어 인원 문구는 `2-8 players`다.
- 친구 방 상태는 `gameState.stateVersion: 2`, 최상위 `GameRoom.playId`, 라운드별 `gameState.roundId`를 사용한다.
- `commandId`는 서른여섯 바이트 버전 `4` 고유 식별값이며 한 실행에서 최근 예순네 개를 보존한다.
- 명령 본문은 유티에프 팔 기준 육십사 킬로바이트, `gameState`는 백이십팔 킬로바이트, 전체 방은 백육십 킬로바이트를 넘지 않는다.
- 버전 `2` 방에서는 일반 `update-state`, `set-state`, `next-turn`, `set-topic`, `add-question`으로 놀이 상태를 바꾸지 못한다.
- 미스터리 박스의 `gameState.private`은 저장소에만 있고 성공, 조회, 충돌, 나가기와 다시 시작 응답에서 모두 제거한다.
- 질문-대답 짝 찾기 실패 복원은 서버의 `retryAfterMs`를 사용하며 기기 시각을 사용하지 않는다.
- 질문 사다리는 세 라운드 모두 질문을 확정해야 끝나고 분류 요청 실패가 진행을 막지 않는다.
- 친구 방의 유효한 마지막 활동은 방장 여부와 관계없이 같은 저장 후보에서 자동 종료한다.
- 혼자, 인공지능과 학생 방장 친구 놀이는 점수 요청을 보내지 않는다.
- 점수 버전 `2`는 교사 방장, 담당 학생, `completed` 종료와 실행 식별값이 모두 맞을 때만 서버 근거로 지급한다.
- 일반 글자는 최소 `4.5:1`, 큰 글자와 핵심 놀이 선은 최소 `3:1` 계산 대비를 만족한다.
- 구현은 실패하는 시험을 먼저 실행하고 최소 구현 뒤 같은 시험이 통과하는 것을 확인한다.
- 설계 기준은 `docs/superpowers/specs/2026-07-14-question-game-reliability-design.md`다.
- 구현 기준 커밋은 `034197b`다.

## 파일 구성

- 생성: `src/lib/question-game-rules.ts`
  내장 놀이 식별값, 인원, 시간, 라운드와 크기 상한을 소유한다.
- 수정: `src/lib/question-games-data.ts`
  규칙이 적용된 목록 자료, 실행 식별값, 점수 버전과 방 동작 결과 형식을 소유한다.
- 생성: `src/lib/question-game-room-response.ts`
  원본을 바꾸지 않는 공개 방 응답과 명령 결과 검사를 맡는다.
- 생성: `src/lib/question-game-room-engine.ts`
  명령 봉투, 멱등 처리, 시작, 다시 시작, 일찍 마침, 이탈과 놀이별 판정 배분을 맡는다.
- 생성: `src/lib/question-game-room-engines/memory.ts`
- 생성: `src/lib/question-game-room-engines/mystery.ts`
- 생성: `src/lib/question-game-room-engines/ladder.ts`
- 생성: `src/lib/question-game-room-engines/turn-games.ts`
  놀이별 버전 `2` 상태와 순수 명령 판정을 맡는다.
- 생성: `src/lib/mystery-box-rules.ts`
  내장 물건, 질문 속성 판정과 정답 정규화를 맡는다.
- 생성: `src/lib/question-ladder.ts`
  사다리 생성, 추적, 경로 구간과 배정을 맡는다.
- 생성: `src/app/(student)/student-question-play/games/RoomMysteryBox.tsx`
  친구 방 미스터리 박스 화면을 맡는다.
- 생성: `src/app/(student)/student-question-play/games/LadderBoard.tsx`
- 생성: `src/app/(student)/student-question-play/games/LadderQuestionComposer.tsx`
  세 모드가 공유하는 사다리 그림과 질문 확인을 맡는다.
- 수정: `src/app/api/question-games/rooms/route.ts`
- 수정: `src/app/api/question-games/rooms/[code]/route.ts`
  인증, 방 수명, 크기, 판정, 조건부 저장과 공개 응답을 연결한다.
- 수정: `src/app/(student)/student-question-play/games/useRoom.ts`
  같은 버전 무시, 명령 식별값과 성공 결과 전달을 맡는다.
- 수정: `src/app/(student)/student-question-play/[gameId]/page.tsx`
  미스터리 방 화면과 옛 방 호환 안내를 연결한다.
- 생성: `src/components/question-games/QuestionGameRoomFlow.tsx`
- 생성: `src/app/(teacher)/teacher-question-play/[gameId]/host/page.tsx`
- 수정: `src/app/(teacher)/teacher-question-play/page.tsx`
  학생과 교사가 공유하는 방 진행 껍데기와 교사 방 개설 진입을 제공한다.
- 수정: `src/app/(student)/student-question-play/games/RoomMemory.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomLadder.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomStoryDice.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomDice.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomRelay.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomKaba.tsx`
  서버 명령 기반 친구 방 화면과 자동 종료를 맡는다.
- 수정: `src/app/(student)/student-question-play/games/MemoryGame.tsx`
- 수정: `src/app/(student)/student-question-play/games/MysteryBoxGame.tsx`
- 수정: `src/app/(student)/student-question-play/games/LadderGame.tsx`
- 수정: `src/app/(student)/student-question-play/games/StoryDiceGame.tsx`
- 수정: `src/app/(student)/student-question-play/games/DiceGame.tsx`
- 수정: `src/app/(student)/student-question-play/games/RelayGame.tsx`
- 수정: `src/app/(student)/student-question-play/games/KabaGame.tsx`
  지역 모드의 종료 목표, 질문 작성과 점수 요청 제거를 맡는다.
- 수정: `src/app/(student)/student-question-play/games/RoomResult.tsx`
- 수정: `src/lib/point-award-service.ts`
- 수정: `src/app/api/points/award/route.ts`
  실행별 점수 근거, 결과 복원과 공유를 맡는다.
- 수정: `src/lib/question-game-i18n.ts`
  라운드, 확인, 자동 종료와 오류 문구를 한국어와 영어로 제공한다.
- 생성 및 수정: `src/__tests__/question-game-*.test.ts`, `src/__tests__/room-*.test.tsx`, `e2e/question-games-reliability.spec.ts`
  순수 규칙, 요청 경로, 화면과 두 기기 흐름을 검증한다.

---

### Task 1: 공통 놀이 규칙과 인원 및 시간 표시

**파일:**
- 생성: `src/lib/question-game-rules.ts`
- 수정: `src/lib/question-games-data.ts`
- 수정: `src/app/api/question-games/rooms/route.ts`
- 수정: `src/app/api/question-games/rooms/[code]/route.ts`
- 수정: `src/app/(student)/student-question-play/games/RoomLobby.tsx`
- 생성: `src/__tests__/question-game-rules.test.ts`
- 생성: `src/__tests__/game-room-create-route.test.ts`
- 수정: `src/__tests__/question-play-localization.test.ts`
- 수정: `src/__tests__/game-room-route.test.ts`

**연결 규약:**
- 입력: 문자열 놀이 식별값과 `ko` 또는 `en` 언어값
- 출력: `BuiltInQuestionGameId`, `QUESTION_GAME_RULES`, `getQuestionGameRule`, `isBuiltInQuestionGameId`, `applyQuestionGameRuleText`
- 이후 모든 서버 인원 검사와 목록 문구는 이 모듈만 읽는다.

- [ ] **단계 1: 공통 규칙의 실패 시험을 작성한다**

```ts
import {
  BUILT_IN_QUESTION_GAME_IDS,
  QUESTION_GAME_RULES,
  applyQuestionGameRuleText,
  isBuiltInQuestionGameId,
} from "@/lib/question-game-rules";

it("일곱 내장 놀이의 친구 인원과 시간을 한곳에서 제공한다", () => {
  expect(BUILT_IN_QUESTION_GAME_IDS).toHaveLength(7);
  for (const id of BUILT_IN_QUESTION_GAME_IDS) {
    expect(QUESTION_GAME_RULES[id].multiplayer).toEqual({ min: 2, max: 8 });
    expect(applyQuestionGameRuleText(id, "ko").playerCount).toBe("2~8명");
    expect(applyQuestionGameRuleText(id, "en").playerCount).toBe("2-8 players");
  }
  expect(QUESTION_GAME_RULES.memory.duration.ko).toBe("약 5~20분");
  expect(QUESTION_GAME_RULES.ladder.duration.ko).toBe("약 10~15분");
  expect(QUESTION_GAME_RULES["mystery-box"].duration.ko).toBe("약 8~15분");
  expect(QUESTION_GAME_RULES["story-dice"].targets.solo).toEqual({
    kind: "completed-pairs", count: 3, perQuestioner: false,
  });
  expect(QUESTION_GAME_RULES.kaba.targets.room).toEqual({
    kind: "attempts-per-player", count: 3, minimumTotal: 6,
  });
  expect(QUESTION_GAME_RULES.kaba.targets.solo).toEqual({ kind: "attempts", count: 10 });
  expect(QUESTION_GAME_RULES["mystery-box"].score.maxValidQuestionsPerRoom).toBe(20);
  expect(isBuiltInQuestionGameId("unknown")).toBe(false);
});
```

방 생성 경로 시험에는 알 수 없는 식별값 `400`, 일곱 식별값 성공을 추가한다. 방 시작 시험에는 한 명 `400`, 두 명과 여덟 명 성공을 추가한다.

- [ ] **단계 2: 새 규칙 시험이 없는 모듈과 오래된 문구 때문에 실패하는지 확인한다**

```bash
npm test -- src/__tests__/question-game-rules.test.ts src/__tests__/game-room-create-route.test.ts src/__tests__/question-play-localization.test.ts src/__tests__/game-room-route.test.ts
```

예상: 규칙 모듈을 찾지 못하고 기존 목록 문구와 한 명 시작 허용 때문에 실패한다.

- [ ] **단계 3: 공통 규칙 모듈을 최소 구현한다**

```ts
export const BUILT_IN_QUESTION_GAME_IDS = [
  "memory", "story-dice", "dice", "ladder", "relay", "mystery-box", "kaba",
] as const;

export type BuiltInQuestionGameId = typeof BUILT_IN_QUESTION_GAME_IDS[number];

type QuestionGameTarget =
  | { kind: "attempts-by-difficulty"; easy: 18; normal: 30; hard: 45 }
  | { kind: "completed-pairs"; count: number; perQuestioner: boolean }
  | { kind: "student-questions"; count: 3; perPlayer: boolean }
  | { kind: "shared-rounds"; count: 3 }
  | { kind: "actions"; count: 20 }
  | { kind: "attempts"; count: 10 }
  | { kind: "attempts-per-player"; count: 3; minimumTotal: 6 };

export const QUESTION_GAME_LIMITS = {
  commandBodyBytes: 64 * 1024,
  gameStateBytes: 128 * 1024,
  roomBytes: 160 * 1024,
  topic: 80,
  shortWord: 80,
  question: 200,
  story: 500,
  answer: 500,
  generatedWord: 60,
} as const;

export const QUESTION_GAME_RULES = {
  memory: {
    multiplayer: { min: 2, max: 8 },
    duration: { ko: "약 5~20분", en: "About 5-20 min" },
    targets: {
      room: { kind: "attempts-by-difficulty", easy: 18, normal: 30, hard: 45 },
      solo: { kind: "attempts-by-difficulty", easy: 18, normal: 30, hard: 45 },
      ai: { kind: "attempts-by-difficulty", easy: 18, normal: 30, hard: 45 },
    },
    score: { maxValidQuestionsPerPlayer: 0, competitiveWinner: true },
  },
  "story-dice": {
    multiplayer: { min: 2, max: 8 },
    duration: { ko: "약 5~20분", en: "About 5-20 min" },
    targets: {
      room: { kind: "completed-pairs", count: 2, perQuestioner: true },
      solo: { kind: "completed-pairs", count: 3, perQuestioner: false },
      ai: { kind: "completed-pairs", count: 3, perQuestioner: false },
    },
    score: { maxValidQuestionsPerPlayer: 2, competitiveWinner: false },
  },
  dice: {
    multiplayer: { min: 2, max: 8 },
    duration: { ko: "약 5~15분", en: "About 5-15 min" },
    targets: {
      room: { kind: "student-questions", count: 3, perPlayer: true },
      solo: { kind: "student-questions", count: 3, perPlayer: false },
      ai: { kind: "student-questions", count: 3, perPlayer: false },
    },
    score: { maxValidQuestionsPerPlayer: 3, competitiveWinner: false },
  },
  ladder: {
    multiplayer: { min: 2, max: 8 },
    duration: { ko: "약 10~15분", en: "About 10-15 min" },
    targets: {
      room: { kind: "shared-rounds", count: 3 },
      solo: { kind: "student-questions", count: 3, perPlayer: false },
      ai: { kind: "student-questions", count: 3, perPlayer: false },
    },
    score: { maxValidQuestionsPerPlayer: 3, competitiveWinner: false },
  },
  relay: {
    multiplayer: { min: 2, max: 8 },
    duration: { ko: "약 5~15분", en: "About 5-15 min" },
    targets: {
      room: { kind: "student-questions", count: 3, perPlayer: true },
      solo: { kind: "student-questions", count: 3, perPlayer: false },
      ai: { kind: "student-questions", count: 3, perPlayer: false },
    },
    score: { maxValidQuestionsPerPlayer: 3, competitiveWinner: false },
  },
  "mystery-box": {
    multiplayer: { min: 2, max: 8 },
    duration: { ko: "약 8~15분", en: "About 8-15 min" },
    targets: {
      room: { kind: "actions", count: 20 },
      solo: { kind: "actions", count: 20 },
      ai: { kind: "actions", count: 20 },
    },
    score: {
      maxValidQuestionsPerPlayer: 20,
      maxValidQuestionsPerRoom: 20,
      competitiveWinner: false,
    },
  },
  kaba: {
    multiplayer: { min: 2, max: 8 },
    duration: { ko: "약 5~15분", en: "About 5-15 min" },
    targets: {
      room: { kind: "attempts-per-player", count: 3, minimumTotal: 6 },
      solo: { kind: "attempts", count: 10 },
      ai: { kind: "attempts", count: 10 },
    },
    score: { maxValidQuestionsPerPlayer: 3, competitiveWinner: true },
  },
} as const satisfies Record<
  BuiltInQuestionGameId,
  {
    multiplayer: { min: 2; max: 8 };
    duration: { ko: string; en: string };
    targets: { room: QuestionGameTarget; solo: QuestionGameTarget; ai: QuestionGameTarget };
    score: {
      maxValidQuestionsPerPlayer: number;
      maxValidQuestionsPerRoom?: number;
      competitiveWinner: boolean;
    };
  }
>;
```

`applyQuestionGameRuleText`는 언어별 인원과 시간만 반환한다. `localizeBuiltInGame`과 한국어 기본 목록은 이 값을 병합한다. 이후 놀이 화면, 판정기와 점수 근거는 숫자를 다시 적지 않고 `targets`, `score`와 `QUESTION_GAME_LIMITS`를 읽는다.

- [ ] **단계 4: 방 생성, 시작과 대기실을 같은 규칙으로 연결한다**

방 생성 경로는 `isBuiltInQuestionGameId(gameId)`가 거짓이면 저장소를 호출하지 않고 `400`을 반환한다. 시작 경로는 저장 직전에 현재 참가자 수를 검사한다.

```ts
const { min, max } = getQuestionGameRule(room.gameId).multiplayer;
if (room.players.length < min || room.players.length > max) {
  return NextResponse.json(
    { error: `친구 방은 ${min}명부터 ${max}명까지 시작할 수 있어요` },
    { status: 400 },
  );
}
```

`RoomLobby`는 `min` 미만이면 시작 단추를 비활성화하고 한국어 `친구가 한 명 이상 더 참가해야 시작할 수 있어요`, 영어 `At least one friend must join before starting.`을 보여 준다.

- [ ] **단계 5: 규칙과 관련 회귀 시험을 통과시킨다**

```bash
npm test -- src/__tests__/question-game-rules.test.ts src/__tests__/game-room-create-route.test.ts src/__tests__/question-play-localization.test.ts src/__tests__/game-room-route.test.ts
npx tsc --noEmit
```

예상: 대상 시험과 타입 검사가 통과한다.

- [ ] **단계 6: 공통 규칙 작업을 커밋한다**

```bash
git add src/lib/question-game-rules.ts src/lib/question-games-data.ts \
  src/app/api/question-games/rooms/route.ts \
  'src/app/api/question-games/rooms/[code]/route.ts' \
  'src/app/(student)/student-question-play/games/RoomLobby.tsx' \
  src/__tests__/question-game-rules.test.ts \
  src/__tests__/game-room-create-route.test.ts \
  src/__tests__/question-play-localization.test.ts \
  src/__tests__/game-room-route.test.ts
git commit -m "fix: 질문놀이 인원과 시간 규칙 통일"
```

---

### Task 2: 방 자료 계약, 공개 응답과 클라이언트 결과 전달

**파일:**
- 수정: `src/lib/question-games-data.ts`
- 생성: `src/lib/question-game-room-response.ts`
- 수정: `src/lib/game-room-store.ts`
- 수정: `src/app/api/question-games/rooms/route.ts`
- 수정: `src/app/api/question-games/rooms/[code]/route.ts`
- 수정: `src/app/(student)/student-question-play/games/useRoom.ts`
- 생성: `src/__tests__/question-game-room-response.test.ts`
- 수정: `src/__tests__/game-room-store.test.ts`
- 수정: `src/__tests__/game-room-route.test.ts`
- 수정: `src/__tests__/use-room.test.tsx`

**연결 규약:**
- `GameRoom.playId?: string`, `pointAwardKeyVersion?: 1 | 2`, `pointEvidenceVersion?: 1 | 2`
- `RoomActionSuccess = { ok: true; room: GameRoom; result?: RoomCommandResult }`
- `RoomActionOptions`는 재시도용 `commandId?: string`과 기존 `expectedRoom`을 함께 가진다.
- `toPublicGameRoom(room: GameRoom): GameRoom`은 원본을 바꾸지 않는다.
- 이후 모든 경로 응답은 원본 저장 방이 아니라 공개 방을 반환한다.

- [ ] **단계 1: 공개 응답, 결과 전달과 같은 버전 무시 실패 시험을 작성한다**

```ts
it("비공개 상태를 원본 변경 없이 제거한다", () => {
  const room = makeRoom({ gameState: { phase: "play", private: { answer: "사과" } } });
  const publicRoom = toPublicGameRoom(room);
  expect(publicRoom.gameState).toEqual({ phase: "play" });
  expect(room.gameState.private).toEqual({ answer: "사과" });
});

it("성공 명령 결과를 화면까지 반환한다", async () => {
  fetchMock.mockResolvedValue(jsonResponse({
    room: makeRoom({ version: 2 }),
    result: { retryAfterMs: 1200 },
  }));
  const value = await result.current.sendAction("memory-resolve-miss", {
    revealId: "reveal-1",
  });
  expect(value).toMatchObject({ ok: true, result: { retryAfterMs: 1200 } });
});
```

같은 방 생애에서 현재 버전과 같은 폴링 응답이 상태 객체 참조를 바꾸지 않는 시험, `result`가 배열이나 과대 문자열이면 버리는 시험, 점수 버전 `2`와 `playId` 파싱 시험을 추가한다.

- [ ] **단계 2: 대상 시험의 예상 실패를 확인한다**

```bash
npm test -- src/__tests__/question-game-room-response.test.ts src/__tests__/game-room-store.test.ts src/__tests__/game-room-route.test.ts src/__tests__/use-room.test.tsx
```

예상: 공개 변환기가 없고 성공 `result`가 손실되며 같은 버전 객체가 다시 적용돼 실패한다.

- [ ] **단계 3: 방 형식과 공개 변환기를 구현한다**

```ts
export interface RoomCommandResult {
  retryAfterMs?: number;
  roll?: number;
  replayed?: boolean;
}

export type RoomActionResult =
  | { ok: true; room: GameRoom; result?: RoomCommandResult }
  | RoomActionFailure;

export interface RoomActionOptions {
  expectedRoom?: Pick<GameRoom, "code" | "createdAt">;
  commandId?: string;
}

export function toPublicGameRoom(room: GameRoom): GameRoom {
  const { private: _private, ...gameState } = room.gameState;
  return { ...room, gameState };
}
```

`isGameRoom`은 선택 `playId`가 비어 있지 않은 문자열인지, 두 점수 버전이 `1` 또는 `2`인지 검사한다. 새 대기 방은 두 점수 버전을 넣지 않고 시작할 때만 설정한다.

- [ ] **단계 4: 모든 방 응답과 클라이언트 적용을 연결한다**

성공, 조회, 참가, 충돌, 나가기와 다시 시작의 `{ room }`을 `toPublicGameRoom`으로 감싼다. 저장소는 원본을 그대로 저장한다.

`useRoom.applyRoom`은 다음 조건을 추가한다.

```ts
if (
  current?.code === nextRoom.code &&
  current.createdAt === nextRoom.createdAt &&
  nextRoom.version <= current.version
) {
  return { room: current, applied: false, lifetimeChanged: false };
}
```

성공 응답은 `readRoomCommandResult(data.result)`로 짧은 결과만 보존한다. `sendAction`은 `options.commandId`가 있으면 그대로 사용하고 없으면 호출 시작 때 한 번만 `crypto.randomUUID()`를 만든다. 같은 호출 안의 재시도는 이 값을 재사용한다. 활동 화면이 넘긴 `playId`와 `roundId`는 최신 방 값으로 덮어쓰지 않는다.

```ts
return {
  ok: true,
  room: outcome.room ?? data.room,
  ...(result ? { result } : {}),
};
```

- [ ] **단계 5: 방 계약과 훅 시험을 통과시킨다**

```bash
npm test -- src/__tests__/question-game-room-response.test.ts src/__tests__/game-room-store.test.ts src/__tests__/game-room-route.test.ts src/__tests__/use-room.test.tsx
npx tsc --noEmit
```

- [ ] **단계 6: 방 계약 작업을 커밋한다**

```bash
git add src/lib/question-games-data.ts src/lib/question-game-room-response.ts \
  src/lib/game-room-store.ts src/app/api/question-games/rooms/route.ts \
  'src/app/api/question-games/rooms/[code]/route.ts' \
  'src/app/(student)/student-question-play/games/useRoom.ts' \
  src/__tests__/question-game-room-response.test.ts \
  src/__tests__/game-room-store.test.ts src/__tests__/game-room-route.test.ts \
  src/__tests__/use-room.test.tsx
git commit -m "fix: 질문놀이 방 공개 응답 계약 보완"
```

---

### Task 3: 버전 2 방 명령 판정기와 수명 처리

**파일:**
- 생성: `src/lib/question-game-room-engine.ts`
- 수정: `src/app/api/question-games/rooms/[code]/route.ts`
- 수정: `src/app/(student)/student-question-play/[gameId]/page.tsx`
- 생성: `src/app/(student)/student-question-play/games/RoomCompatibilityNotice.tsx`
- 생성: `src/__tests__/question-game-room-engine.test.ts`
- 생성: `src/__tests__/question-game-room-command-route.test.ts`
- 수정: `src/__tests__/game-room-route.test.ts`

**연결 규약:**
- 입력: `applyQuestionGameRoomCommand({ room, userId, userName, action, body, now, random, randomUUID })`
- 출력: `changed`, `replayed`, `invalid`, `forbidden`, `conflict`, `corrupt` 가운데 하나
- 판정기는 저장과 HTTP 응답을 만들지 않는다.
- 놀이별 모듈은 `createInitialState`와 `applyCommand`를 제공하고 다음 작업에서 등록한다.
- 옮기지 않은 놀이는 기존 시작 경로를 유지하고, 등록된 놀이만 버전 `2`로 시작한다. 작업 7에서 일곱 놀이 등록을 확인한 뒤 이 임시 분기를 제거한다.

- [ ] **단계 1: 명령 봉투, 멱등, 다시 시작과 크기 제한 실패 시험을 작성한다**

```ts
it("같은 명령은 버전을 올리지 않는 재생 결과가 된다", () => {
  const room = makeV2Room({ recentCommandIds: [COMMAND_ID] });
  expect(applyQuestionGameRoomCommand(command(room, COMMAND_ID))).toMatchObject({
    kind: "replayed",
    room,
  });
});

it("다시 시작된 빈 대기 방은 같은 요청에 저장 없는 성공을 준다", () => {
  const room = makeRoom({ status: "waiting", gameState: {} });
  expect(applyQuestionGameRoomCommand(restart(room))).toMatchObject({
    kind: "replayed",
    room,
  });
});
```

고유 식별값 형식, 최근 예순네 개 순환, 다른 `playId`, 다른 `roundId`, 육십사 및 백이십팔 및 백육십 킬로바이트 상한, 비참가자, 참가자 이탈 앞과 현재 및 뒤 차례, 한 명 남은 `insufficient-players` 종료를 각각 시험한다.

- [ ] **단계 2: 판정기와 요청 경로 시험의 예상 실패를 확인한다**

```bash
npm test -- src/__tests__/question-game-room-engine.test.ts src/__tests__/question-game-room-command-route.test.ts src/__tests__/game-room-route.test.ts
```

예상: 판정기와 버전 `2` 요청 분기가 없어 실패한다.

- [ ] **단계 3: 공통 명령 형식과 순수 도우미를 구현한다**

```ts
export const QUESTION_GAME_STATE_VERSION = 2 as const;
export const MAX_RECENT_COMMAND_IDS = 64;

export interface EngineStateBase {
  stateVersion: 2;
  phase: string;
  recentCommandIds: string[];
  roundId?: string;
  round?: number;
  maxRounds?: number;
  endReason?: "completed" | "host" | "insufficient-players";
}

export type QuestionGameEngineResult =
  | { kind: "changed"; room: GameRoom; result?: RoomCommandResult }
  | { kind: "replayed"; room: GameRoom; result?: RoomCommandResult }
  | { kind: "invalid" | "forbidden" | "conflict" | "corrupt"; room: GameRoom; message: string };
```

`isValidCommandId`, `utf8ByteLength`, `appendRecentCommandId`, `normalizeTurnAfterLeave`, `endForInsufficientPlayers`, `restartQuestionGameRoom`을 순수 함수로 만들고 직접 시험한다.

본문, 놀이 상태와 전체 방 크기는 별도 숫자를 만들지 않고 `QUESTION_GAME_LIMITS.commandBodyBytes`, `gameStateBytes`, `roomBytes`를 읽는다.

판정기 등록부는 놀이별 `createInitialState`와 `applyCommand`를 함께 보관한다. 이 작업에서는 아직 등록된 놀이가 없으므로 `hasQuestionGameRoomEngine(gameId)`가 거짓인 놀이는 기존 시작과 동작 경로를 그대로 사용한다. 다음 작업에서 놀이별 판정기를 등록할 때마다 해당 놀이만 버전 `2` 시작 경로로 전환한다.

- [ ] **단계 4: 요청 경로에 버전 `2` 경계를 연결한다**

요청 처리 순서는 인증, 본문 바이트, 방 조회, 참가 여부, 방 생성 시각, 같은 명령 재생, 예상 버전, 판정, 상태 크기, 조건부 저장, 공개 응답이다.

```ts
if (room.gameState.stateVersion === 2 && LEGACY_STATE_ACTIONS.has(action)) {
  return NextResponse.json({ error: "새 질문놀이에서는 사용할 수 없는 동작입니다" }, { status: 403 });
}
if (room.status === "playing" && room.gameState.stateVersion !== 2) {
  if (action !== "restart" && action !== "leave") {
    return NextResponse.json({ error: "새 규칙으로 다시 시작해 주세요", room: toPublicGameRoom(room) }, { status: 409 });
  }
}
```

옛 진행 방 화면은 `RoomCompatibilityNotice`에서 방장에게 `restart`, 다른 참가자에게 대기 및 나가기만 제공한다.

- [ ] **단계 5: 공통 판정기와 경로 시험을 통과시킨다**

```bash
npm test -- src/__tests__/question-game-room-engine.test.ts src/__tests__/question-game-room-command-route.test.ts src/__tests__/game-room-route.test.ts
npx tsc --noEmit
```

- [ ] **단계 6: 버전 2 기반을 커밋한다**

```bash
git add src/lib/question-game-room-engine.ts \
  'src/app/api/question-games/rooms/[code]/route.ts' \
  'src/app/(student)/student-question-play/[gameId]/page.tsx' \
  'src/app/(student)/student-question-play/games/RoomCompatibilityNotice.tsx' \
  src/__tests__/question-game-room-engine.test.ts \
  src/__tests__/question-game-room-command-route.test.ts \
  src/__tests__/game-room-route.test.ts
git commit -m "feat: 질문놀이 방 명령 기반 추가"
```

---

### Task 4: 질문-대답 짝 찾기 서버 판정과 복원

**파일:**
- 생성: `src/lib/question-game-room-engines/memory.ts`
- 수정: `src/lib/question-game-room-engine.ts`
- 수정: `src/lib/memory-game-data.ts`
- 수정: `src/app/api/question-games/rooms/[code]/route.ts`
- 수정: `src/app/(student)/student-question-play/games/RoomMemory.tsx`
- 수정: `src/app/(student)/student-question-play/games/MemoryGame.tsx`
- 생성: `src/__tests__/question-game-room-engine-memory.test.ts`
- 수정: `src/__tests__/room-memory-actions.test.tsx`
- 수정: `src/__tests__/game-room-route.test.ts`
- 수정: `src/__tests__/use-room.test.tsx`

**연결 규약:**
- `createMemoryState(): MemoryRoomState`는 `setup` 단계의 버전 `2` 상태를 만든다.
- `applyMemoryCommand(context): QuestionGameEngineResult`는 `memory-prepare`, `memory-roll`, `memory-flip`, `memory-resolve-miss`만 받는다.
- 주사위, 카드 배치와 공개 식별값은 서버 의존값으로 만든다.
- 복원 대기 성공 결과는 `{ retryAfterMs: number }`다.

- [ ] **단계 1: 카드 차례, 최대 시도와 복원 실패 시험을 작성한다**

```ts
it("틀린 두 카드는 마감 뒤 어느 참가자 요청으로도 한 번만 복원한다", () => {
  const missed = applyMemoryCommand(flipSecondCard(matchingRoom, "a-wrong"));
  expect(missed).toMatchObject({
    kind: "changed",
    room: { gameState: { lastReveal: { result: "miss" } } },
  });
  const revealId = readMemoryState(missed.room).lastReveal?.revealId;
  const early = applyMemoryCommand(resolveMiss(missed.room, revealId, 1100));
  expect(early).toMatchObject({ kind: "replayed", result: { retryAfterMs: 1400 } });
  const resolved = applyMemoryCommand(resolveMiss(missed.room, revealId, 2600, "other"));
  expect(readMemoryState(resolved.room)).toMatchObject({
    revealedIds: [],
    lastReveal: null,
    lastResolvedRevealId: revealId,
    currentTurnIdx: 1,
  });
});
```

난이도별 여섯 및 열 및 열다섯 짝, 최대 열여덟 및 서른 및 마흔다섯 차례, 질문 뒤 대답 순서, 맞힌 사람의 추가 차례, 모든 짝 조기 종료, 최대 시도 종료, 비방장 마지막 짝 자동 종료, 서버 주사위, 같은 명령 재생, 참가자 이탈 차례를 각각 시험한다.

- [ ] **단계 2: 짝 찾기 판정 시험이 현재 지역 덮어쓰기 때문에 실패하는지 확인한다**

```bash
npm test -- src/__tests__/question-game-room-engine-memory.test.ts src/__tests__/room-memory-actions.test.tsx src/__tests__/game-room-route.test.ts src/__tests__/use-room.test.tsx
```

- [ ] **단계 3: 버전 `2` 짝 찾기 상태와 명령을 구현한다**

```ts
export interface MemoryRoomState extends EngineStateBase {
  game: "memory";
  phase: "setup" | "rolling" | "play" | "done";
  difficulty: MemoryDifficulty;
  pairs: QAPair[];
  qCards: MemoryCard[];
  aCards: MemoryCard[];
  diceRolls: Record<string, number>;
  turnOrder: string[];
  currentTurnIdx: number;
  takenIds: string[];
  revealedIds: string[];
  scores: Record<string, number>;
  attempts: number;
  maxAttempts: number;
  lastReveal: null | {
    revealId: string;
    result: "match" | "miss";
    turnPlayerId: string;
    resolveAt: number;
  };
  lastResolvedRevealId?: string;
}
```

`memory-prepare`는 방장, 난이도, 정확한 쌍 수, 질문 이백 자, 대답 오백 자를 검사하고 서버에서 카드를 섞는다. `memory-roll`은 요청값을 받지 않고 `randomInt(1, 6)`을 저장한다. `memory-flip`은 카드 식별값만 받고 짝과 종료를 서버가 판정한다. 최대 시도의 마지막 실패는 복원 뒤 남은 짝을 공개하고 `completed`로 끝낸다.

쌍 수는 `MEMORY_DIFFICULTY`, 최대 시도는 `QUESTION_GAME_RULES.memory.targets.room`, 질문과 대답 길이는 `QUESTION_GAME_LIMITS`에서 읽는다.

- [ ] **단계 4: 방 화면과 지역 모드를 서버 규칙에 맞춘다**

`RoomMemory`에서 `set-state`, `update-state`, 클라이언트 주사위 결과와 지역 짝 판정을 제거한다.

```ts
const result = await onAction("memory-flip", {
  playId: room.playId,
  roundId: state.roundId,
  cardId: card.id,
}, { commandId: crypto.randomUUID() });
```

실패 공개 효과는 모든 참가자가 같은 `revealId`로 `memory-resolve-miss`를 보낼 수 있게 하고 `result.retryAfterMs`만큼 다시 기다린다. 같은 버전 폴링은 효과를 다시 만들지 않는다. `MemoryGame`에도 난이도별 최대 시도를 적용해 모든 짝 또는 최대 시도에서 결과로 이동한다.

- [ ] **단계 5: 짝 찾기 시험과 타입 검사를 통과시킨다**

```bash
npm test -- src/__tests__/question-game-room-engine-memory.test.ts src/__tests__/room-memory-actions.test.tsx src/__tests__/game-room-route.test.ts src/__tests__/use-room.test.tsx
npx tsc --noEmit
```

- [ ] **단계 6: 짝 찾기 작업을 커밋한다**

```bash
git add src/lib/question-game-room-engines/memory.ts \
  src/lib/question-game-room-engine.ts src/lib/memory-game-data.ts \
  'src/app/api/question-games/rooms/[code]/route.ts' \
  'src/app/(student)/student-question-play/games/RoomMemory.tsx' \
  'src/app/(student)/student-question-play/games/MemoryGame.tsx' \
  src/__tests__/question-game-room-engine-memory.test.ts \
  src/__tests__/room-memory-actions.test.tsx src/__tests__/game-room-route.test.ts \
  src/__tests__/use-room.test.tsx
git commit -m "fix: 짝 찾기 차례와 복원 서버 판정"
```

---

### Task 5: 미스터리 박스 공유 상태와 모드별 종료

**파일:**
- 생성: `src/lib/mystery-box-rules.ts`
- 생성: `src/lib/question-game-room-engines/mystery.ts`
- 수정: `src/lib/question-game-room-engine.ts`
- 생성: `src/app/(student)/student-question-play/games/RoomMysteryBox.tsx`
- 수정: `src/app/(student)/student-question-play/games/MysteryBoxGame.tsx`
- 수정: `src/app/(student)/student-question-play/[gameId]/page.tsx`
- 생성: `src/__tests__/mystery-box-rules.test.ts`
- 생성: `src/__tests__/question-game-room-engine-mystery.test.ts`
- 생성: `src/__tests__/room-mystery-box.test.tsx`
- 수정: `src/__tests__/game-room-route.test.ts`

**연결 규약:**
- `classifyMysteryQuestion(question, item, locale): "yes" | "no" | "unknown"`
- `isMysteryGuessCorrect(guess, item, locale): boolean`
- `createMysteryState`와 `applyMysteryCommand`는 비밀 물건을 `gameState.private.itemId`에만 저장한다.
- `RoomMysteryBox`는 공개 상태만 읽는다.

- [ ] **단계 1: 속성 판정, 비밀 제거와 두 참가자 공유 실패 시험을 작성한다**

```ts
it.each([
  ["먹을 수 있나요?", "yes"],
  ["날 수 있나요?", "no"],
  ["동물이면서 작은가요?", "unknown"],
])("질문을 한 속성으로만 판정한다", (question, expected) => {
  expect(classifyMysteryQuestion(question, APPLE_ITEM, "ko")).toBe(expected);
});

it("부분 문자열 추측을 정답으로 받지 않는다", () => {
  expect(isMysteryGuessCorrect("사", APPLE_ITEM, "ko")).toBe(false);
  expect(isMysteryGuessCorrect("  사과  ", APPLE_ITEM, "ko")).toBe(true);
});

it("한 속성의 지원 부정 표현만 답을 뒤집는다", () => {
  expect(classifyMysteryQuestion("먹을 수 없나요?", APPLE_ITEM, "ko")).toBe("no");
  expect(classifyMysteryQuestion("날 수 없나요?", APPLE_ITEM, "ko")).toBe("yes");
  expect(classifyMysteryQuestion("먹을 수 없지 않나요?", APPLE_ITEM, "ko")).toBe("unknown");
});

it("추측은 유니코드와 공백 및 영어 대소문자를 정규화한다", () => {
  expect(isMysteryGuessCorrect("  GREEN   APPLE  ", APPLE_ITEM, "en")).toBe(true);
  expect(isMysteryGuessCorrect("ＡＰＰＬＥ", APPLE_ITEM, "en")).toBe(true);
});
```

같은 서버 물건과 `roundId`, 차례가 아닌 질문 및 추측 거절, 틀린 추측 차례 이동, 정답 조기 종료, 스무 번째 실패 종료, 재접속 상태 유지, 모든 응답의 비공개 제거를 시험한다. 지역 모드는 첫 틀린 추측 뒤 계속되는 시험을 추가한다.

- [ ] **단계 2: 미스터리 박스 시험의 예상 실패를 확인한다**

```bash
npm test -- src/__tests__/mystery-box-rules.test.ts src/__tests__/question-game-room-engine-mystery.test.ts src/__tests__/room-mystery-box.test.tsx src/__tests__/game-room-route.test.ts
```

- [ ] **단계 3: 내장 물건과 서버 판정을 구현한다**

```ts
export interface MysteryItem {
  id: string;
  names: { ko: string; en: string };
  aliases: { ko: string[]; en: string[] };
  attributes: Record<MysteryAttribute, boolean>;
}

export interface MysteryRoomState extends EngineStateBase {
  game: "mystery-box";
  phase: "setup" | "play" | "done";
  round: number;
  maxRounds: 20;
  turnOrder: string[];
  currentTurnIdx: number;
  history: MysteryHistoryItem[];
  scores: Record<string, number>;
  winnerId?: string;
  answer?: LocalizedText;
  private?: { itemId: string };
}
```

`mystery-start`는 방장만 비밀 물건과 첫 라운드를 만든다. `mystery-ask`는 질문 모양과 이백 자를 확인하고, 정확히 한 속성과 지원 부정 표현 하나만 의미값으로 저장한다. 속성 없음, 복수 속성과 모호한 복수 부정은 `unknown`으로 저장한다. `mystery-guess`는 입력, 이름과 별칭을 모두 `NFKC`, 앞뒤 공백 제거, 연속 공백 축약과 영어 소문자로 정규화한 뒤 전체가 정확히 같을 때만 성공시키고 실패 시 라운드와 차례를 늘린다.

스무 활동과 질문 길이는 `QUESTION_GAME_RULES["mystery-box"].targets` 및 `QUESTION_GAME_LIMITS.question`에서 읽으며 지역 화면도 같은 값을 사용한다.

- [ ] **단계 4: 친구 방 화면과 지역 모드 종료를 고친다**

`ROOM_GAME_MAP`에 `mystery-box: RoomMysteryBox`를 등록하고 지역 친구 모드 대체 분기를 제거한다. 방 화면은 `mystery-start`, `mystery-ask`, `mystery-guess`만 보낸다.

`MysteryBoxGame.makeGuess`의 실패 흐름은 다음으로 통일한다.

```ts
if (correct) return finishWithWinner(currentPlayer);
recordWrongGuess();
if (activityCount + 1 >= MAX_Q) return finishWithoutWinner();
if (mode === "solo") return beginNextHumanRound();
return passTurn();
```

- [ ] **단계 5: 미스터리 박스 시험과 타입 검사를 통과시킨다**

```bash
npm test -- src/__tests__/mystery-box-rules.test.ts src/__tests__/question-game-room-engine-mystery.test.ts src/__tests__/room-mystery-box.test.tsx src/__tests__/game-room-route.test.ts
npx tsc --noEmit
```

- [ ] **단계 6: 미스터리 박스 작업을 커밋한다**

```bash
git add src/lib/mystery-box-rules.ts src/lib/question-game-room-engines/mystery.ts \
  src/lib/question-game-room-engine.ts \
  'src/app/(student)/student-question-play/games/RoomMysteryBox.tsx' \
  'src/app/(student)/student-question-play/games/MysteryBoxGame.tsx' \
  'src/app/(student)/student-question-play/[gameId]/page.tsx' \
  src/__tests__/mystery-box-rules.test.ts \
  src/__tests__/question-game-room-engine-mystery.test.ts \
  src/__tests__/room-mystery-box.test.tsx src/__tests__/game-room-route.test.ts
git commit -m "fix: 미스터리 박스 상태와 차례 공유"
```

---

### Task 6: 질문 사다리 경로와 세 라운드 질문 확인

**파일:**
- 생성: `src/lib/question-ladder.ts`
- 생성: `src/lib/question-game-room-engines/ladder.ts`
- 수정: `src/lib/question-game-room-engine.ts`
- 생성: `src/app/(student)/student-question-play/games/LadderBoard.tsx`
- 생성: `src/app/(student)/student-question-play/games/LadderQuestionComposer.tsx`
- 수정: `src/app/(student)/student-question-play/games/LadderGame.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomLadder.tsx`
- 수정: `src/lib/question-game-i18n.ts`
- 생성: `src/__tests__/question-ladder.test.ts`
- 생성: `src/__tests__/ladder-game-flow.test.tsx`
- 생성: `src/__tests__/question-game-room-engine-ladder.test.ts`
- 생성: `src/__tests__/room-ladder-flow.test.tsx`
- 수정: `src/__tests__/room-action-inputs.test.tsx`

**연결 규약:**
- `generateLadderGrid`, `traceLadderColumns`, `buildLadderPathSegments`, `assignLadderTopics`
- `LadderBoard`는 기본 사다리와 선택한 실제 경로 하나만 그린다.
- `LadderQuestionComposer`는 분류 결과를 도움말로만 사용하고 최종 질문 문자열만 확정한다.
- 친구 방 명령은 `ladder-prepare`, `ladder-submit-question`이다.

- [ ] **단계 1: 사다리 순수 함수와 세 라운드 실패 시험을 작성한다**

```ts
it.each([2, 3, 4, 5, 6, 7, 8])("%i명 사다리는 도착점이 일대일이다", (count) => {
  const grid = generateLadderGrid(count, seededRandom(17));
  expect(grid.every((row) => row.every((rung, index) =>
    !rung || !row[index + 1]
  ))).toBe(true);
  const destinations = Array.from({ length: count }, (_, index) =>
    traceLadderColumns(index, grid).at(-1),
  );
  expect(new Set(destinations).size).toBe(count);
});

it("강조 경로는 실제 가로 발판에서만 열을 바꾼다", () => {
  const segments = buildLadderPathSegments(0, FIXED_GRID);
  expect(segments.every((segment) =>
    segment.axis === "vertical" || segment.from.level === segment.to.level
  )).toBe(true);
});
```

혼자와 인공지능 질문 입력, 질문 아닌 문장과 이백일 자 거절, 분류 실패 입력 보존, 도움말 없이 확정, 세 번째 라운드만 완료, 친구 동시 제출 보존과 이탈 완료를 시험한다.

- [ ] **단계 2: 사다리 시험이 중복 지역 계산과 질문 단계 부재로 실패하는지 확인한다**

```bash
npm test -- src/__tests__/question-ladder.test.ts src/__tests__/ladder-game-flow.test.tsx src/__tests__/question-game-room-engine-ladder.test.ts src/__tests__/room-ladder-flow.test.tsx src/__tests__/room-action-inputs.test.tsx
```

- [ ] **단계 3: 공통 사다리 계산과 그림을 구현한다**

```ts
export interface LadderPathSegment {
  axis: "vertical" | "horizontal";
  from: { column: number; level: number };
  to: { column: number; level: number };
}

export function buildLadderPathSegments(
  startColumn: number,
  grid: readonly (readonly boolean[])[],
): LadderPathSegment[];
```

`LadderBoard`는 중립 기본 선을 먼저 그리고 `buildLadderPathSegments` 결과만 강조한다. 시작 세로선 전체 강조와 도착점 대각선을 그리지 않는다. 긴 주제는 그림 아래 배정 문구에서 전체 표시한다.

- [ ] **단계 4: 질문 확인 구성 요소와 지역 세 라운드를 구현한다**

`LadderQuestionComposer`의 상태는 `writing`, `checking`, `review`, `check-failed`다. 질문 모양과 길이를 먼저 검사하고 `/api/classify` 실패 때 입력을 유지한다.

```ts
async function confirmWithoutHelp() {
  if (!isQuestionFormForLocale(question, locale) || question.length > 200) return;
  if (await onConfirm(question.trim())) resetForNextAttempt();
}
```

`LadderGame`은 `setup`, `reveal`, `compose`, `round-summary`, `done`과 현재 라운드 `1..3`을 사용한다. 혼자는 네 출발점 중 하나를 고르고, 인공지능 모드는 학생과 인공지능 배정을 함께 보여 주며 학생 질문 세 개를 확정해야 끝난다. `useSingleAward`를 제거한다.

세 라운드와 질문 길이는 `QUESTION_GAME_RULES.ladder.targets` 및 `QUESTION_GAME_LIMITS.question`에서 읽는다.

- [ ] **단계 5: 친구 방 사다리 명령을 구현한다**

`ladder-prepare`는 방장, 주제 수와 각 팔십 자, 준비 단계를 확인하고 서버에서 발판과 배정을 만든다. `ladder-submit-question`은 현재 `roundId`, 본인 배정, 질문 모양, 이백 자와 `checkProfanity`를 검사한다. 마지막 활성 참가자가 확정하면 새 발판과 `roundId`를 만들고 세 번째 라운드면 `completed`로 종료한다.

- [ ] **단계 6: 사다리 시험과 타입 검사를 통과시킨다**

```bash
npm test -- src/__tests__/question-ladder.test.ts src/__tests__/ladder-game-flow.test.tsx src/__tests__/question-game-room-engine-ladder.test.ts src/__tests__/room-ladder-flow.test.tsx src/__tests__/room-action-inputs.test.tsx
npx tsc --noEmit
```

- [ ] **단계 7: 사다리 작업을 커밋한다**

```bash
git add src/lib/question-ladder.ts src/lib/question-game-room-engines/ladder.ts \
  src/lib/question-game-room-engine.ts src/lib/question-game-i18n.ts \
  'src/app/(student)/student-question-play/games/LadderBoard.tsx' \
  'src/app/(student)/student-question-play/games/LadderQuestionComposer.tsx' \
  'src/app/(student)/student-question-play/games/LadderGame.tsx' \
  'src/app/(student)/student-question-play/games/RoomLadder.tsx' \
  src/__tests__/question-ladder.test.ts src/__tests__/ladder-game-flow.test.tsx \
  src/__tests__/question-game-room-engine-ladder.test.ts \
  src/__tests__/room-ladder-flow.test.tsx src/__tests__/room-action-inputs.test.tsx
git commit -m "fix: 질문 사다리 경로와 질문 확인 보완"
```

---

### Task 7: 이야기, 질문 주사위, 릴레이와 까바 자동 종료

**파일:**
- 생성: `src/lib/question-game-room-engines/turn-games.ts`
- 수정: `src/lib/question-game-room-engine.ts`
- 수정: `src/app/(student)/student-question-play/games/RoomStoryDice.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomDice.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomRelay.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomKaba.tsx`
- 수정: `src/app/(student)/student-question-play/games/StoryDiceGame.tsx`
- 수정: `src/app/(student)/student-question-play/games/DiceGame.tsx`
- 수정: `src/app/(student)/student-question-play/games/RelayGame.tsx`
- 수정: `src/app/(student)/student-question-play/games/KabaGame.tsx`
- 수정: `src/lib/question-game-i18n.ts`
- 생성: `src/__tests__/question-game-room-engine-story-dice.test.ts`
- 생성: `src/__tests__/question-game-room-engine-rounds.test.ts`
- 생성: `src/__tests__/question-game-local-rounds.test.tsx`
- 수정: `src/__tests__/room-action-inputs.test.tsx`
- 수정: `src/__tests__/game-room-route.test.ts`

**연결 규약:**
- 이야기 명령: `story-prepare`, `story-roll`, `story-submit-story`, `story-submit-question`, `story-submit-answer`
- 질문 주사위 명령: `dice-roll`, `dice-submit-question`
- 릴레이 명령: `relay-set-topic`, `relay-submit-question`
- 까바 명령: `kaba-prepare`, `kaba-submit-question`
- 공통 조기 종료 명령: `end-game-early`
- 이 작업 뒤 일곱 내장 놀이의 새 시작은 모두 버전 `2` 상태를 만든다.
- 작업 3의 옛 시작 임시 분기를 제거하고 `BUILT_IN_QUESTION_GAME_IDS.every(hasQuestionGameRoomEngine)`를 시험한다.

- [ ] **단계 1: 네 놀이 목표 직전과 마지막 활동 실패 시험을 작성한다**

```ts
it("질문 주사위의 세 번째 라운드 마지막 비방장 질문이 자동 종료한다", () => {
  const before = makeDiceRoom({ round: 3, history: makeHistory(5), actorId: "student-2" });
  const result = applyTurnGameCommand(submitDiceQuestion(before, "왜 그럴까요?"));
  expect(result).toMatchObject({
    kind: "changed",
    room: { status: "ended", gameState: { endReason: "completed" } },
  });
});

it("이야기는 질문만 저장된 묶음으로 끝나지 않는다", () => {
  const result = applyTurnGameCommand(submitStoryQuestion(lastPairRoom));
  expect(result.room.status).toBe("playing");
  expect(readStoryState(result.room).completedPairs).toBe(TARGET - 1);
});
```

이야기에서 술래 제외 참가자당 두 완결 묶음, 질문 주사위 및 릴레이 참가자당 세 질문, 까바 참가자 수 곱하기 세 시도와 최소 여섯, 이전 라운드 거절, 같은 명령 중복, 차례 위반, 참가자 이탈, 한 라운드 뒤 조기 종료를 시험한다.

지역 시험에는 이야기 질문 및 답안 세 묶음, 질문 주사위 학생 질문 세 개, 릴레이 학생 질문 세 개, 까바 열 문제 뒤 결과를 추가한다. 질문 주사위 인공지능 질문이 기록된 뒤 학생 차례로 돌아오는 시험과 이야기 인공지능 빈 응답 뒤 대체 질문 또는 재시도 흐름을 포함한다.

- [ ] **단계 2: 자동 종료 시험의 예상 실패를 확인한다**

```bash
npm test -- src/__tests__/question-game-room-engine-story-dice.test.ts src/__tests__/question-game-room-engine-rounds.test.ts src/__tests__/question-game-local-rounds.test.tsx src/__tests__/room-action-inputs.test.tsx src/__tests__/game-room-route.test.ts
```

- [ ] **단계 3: 네 놀이 서버 상태와 명령을 구현한다**

이야기는 질문과 답안을 한 쌍으로 닫을 때만 `completedPairs`를 늘린다. 질문 주사위 눈은 서버가 고른다. 릴레이는 `room.chain`을 유지하되 각 새 항목에 현재 `roundId`를 기록한다. 까바 문장 순서는 서버가 섞고 정답 여부는 `isQuestionFormForLocale`로 판정한다.

친구 방과 지역 모드의 목표는 각 놀이의 `QUESTION_GAME_RULES.targets`에서 읽고, 이야기 지역 세 묶음과 까바 지역 열 문제를 화면 안에 다시 숫자로 적지 않는다.

```ts
function finishIfTargetReached(room: GameRoom, reached: boolean): GameRoom {
  if (!reached) return room;
  return {
    ...room,
    status: "ended",
    gameState: { ...room.gameState, phase: "done", endReason: "completed" },
  };
}
```

`end-game-early`는 방장, 진행 상태와 적어도 한 라운드 완료를 확인하고 `endReason: "host"`로 끝낸다. 게임별 이탈 정리는 현재 참가자와 라운드 시작 참가자의 교집합으로 완료 대상을 다시 계산한다.

- [ ] **단계 4: 네 친구 방 화면을 서버 표현 화면으로 바꾼다**

화면에서 `set-state`, 일반 `update-state`, `end`, 클라이언트 난수와 종료 계산을 제거한다. 입력은 명령 성공 때만 비우고 `409`에서는 보존한다. 진행 표시는 `현재 라운드 / 전체 라운드`와 제출 수를 함께 보여 준다.

- [ ] **단계 5: 네 지역 모드의 멈춤과 종료를 고친다**

`DiceGame` 인공지능 흐름은 생성한 예시를 `isAI: true` 기록으로 추가하고 학생 차례로 되돌린다. 학생 기록만 세 개가 되면 결과 단계로 간다.

```ts
const studentQuestionCount = history.filter((item) => !item.isAI).length;
if (studentQuestionCount >= 3) setPhase("done");
else { setCurrentPlayerIdx(0); setPhase("idle"); }
```

`StoryDiceGame`은 인공지능 빈 응답에 지역 대체 질문을 넣어 학생 답안 입력을 열고 완결 묶음 세 개에서 끝낸다. `RelayGame`은 인공지능 기록을 제외한 학생 질문 세 개에서 끝낸다. `KabaGame`의 열 문제 종료는 유지한다.

- [ ] **단계 6: 네 놀이 시험과 타입 검사를 통과시킨다**

```bash
npm test -- src/__tests__/question-game-room-engine-story-dice.test.ts src/__tests__/question-game-room-engine-rounds.test.ts src/__tests__/question-game-local-rounds.test.tsx src/__tests__/room-action-inputs.test.tsx src/__tests__/game-room-route.test.ts
npx tsc --noEmit
```

- [ ] **단계 7: 네 놀이 자동 종료 작업을 커밋한다**

```bash
git add src/lib/question-game-room-engines/turn-games.ts \
  src/lib/question-game-room-engine.ts src/lib/question-game-i18n.ts \
  'src/app/(student)/student-question-play/games/RoomStoryDice.tsx' \
  'src/app/(student)/student-question-play/games/RoomDice.tsx' \
  'src/app/(student)/student-question-play/games/RoomRelay.tsx' \
  'src/app/(student)/student-question-play/games/RoomKaba.tsx' \
  'src/app/(student)/student-question-play/games/StoryDiceGame.tsx' \
  'src/app/(student)/student-question-play/games/DiceGame.tsx' \
  'src/app/(student)/student-question-play/games/RelayGame.tsx' \
  'src/app/(student)/student-question-play/games/KabaGame.tsx' \
  src/__tests__/question-game-room-engine-story-dice.test.ts \
  src/__tests__/question-game-room-engine-rounds.test.ts \
  src/__tests__/question-game-local-rounds.test.tsx \
  src/__tests__/room-action-inputs.test.tsx src/__tests__/game-room-route.test.ts
git commit -m "fix: 질문놀이 라운드와 자동 종료 통일"
```

---

### Task 8: 교사 친구 방, 실행별 점수와 검증된 결과 공유

**파일:**
- 생성: `src/components/question-games/QuestionGameRoomFlow.tsx`
- 수정: `src/app/(student)/student-question-play/[gameId]/page.tsx`
- 생성: `src/app/(teacher)/teacher-question-play/[gameId]/host/page.tsx`
- 수정: `src/app/(teacher)/teacher-question-play/page.tsx`
- 수정: `src/proxy.ts`
- 수정: `src/lib/route-access.ts`
- 생성: `src/lib/question-game-score-evidence.ts`
- 생성: `src/lib/game-award-result.ts`
- 수정: `src/lib/point-award-service.ts`
- 수정: `src/app/api/points/award/route.ts`
- 수정: `src/app/api/question-games/rooms/[code]/route.ts`
- 수정: `src/app/(student)/student-question-play/games/RoomResult.tsx`
- 수정: `src/app/(student)/student-question-play/games/MemoryGame.tsx`
- 수정: `src/app/(student)/student-question-play/games/MysteryBoxGame.tsx`
- 수정: `src/app/(student)/student-question-play/games/LadderGame.tsx`
- 수정: `src/app/(student)/student-question-play/games/StoryDiceGame.tsx`
- 수정: `src/app/(student)/student-question-play/games/DiceGame.tsx`
- 수정: `src/app/(student)/student-question-play/games/RelayGame.tsx`
- 수정: `src/app/(student)/student-question-play/games/KabaGame.tsx`
- 생성: `src/__tests__/teacher-question-game-host.test.tsx`
- 생성: `src/__tests__/question-game-score-evidence.test.ts`
- 수정: `src/__tests__/points-award-route.test.ts`
- 수정: `src/__tests__/points-award-single-route.test.ts`
- 수정: `src/__tests__/room-result-award.test.tsx`
- 생성: `src/__tests__/award-publish-service-split.test.ts`

**연결 규약:**
- `QuestionGameRoomFlow`는 학생 친구 모드와 교사 방 개설이 공유하는 방 진행 껍데기다.
- 점수 요청 식별값은 `{ gameId, roomCode, roomCreatedAt, playId }`다.
- `buildQuestionGameScoreEvidence(room, studentIds)`는 `validQuestions`, `activityScore`, `isWinner`를 서버 상태에서 만든다.
- `restorePublishableAwardResult`는 실제 `PointLog`와 분석 스냅샷만 복원한다.
- `publish-award-result`는 클라이언트 결과 본문을 받지 않는다.

- [ ] **단계 1: 교사 진입, 실행 수명과 점수 근거 실패 시험을 작성한다**

```ts
it("교사는 내장 놀이에서 친구 방 열기 경로로 이동한다", () => {
  renderTeacherQuestionGames();
  expect(screen.getByRole("link", { name: "친구 방 열기" }))
    .toHaveAttribute("href", "/teacher-question-play/relay/host");
});

it("같은 방의 다른 실행은 별도 점수 키를 사용한다", () => {
  expect(buildRoomAwardKey("1234", 10, "play-a"))
    .toBe("room:1234:10:play-a");
  expect(buildRoomAwardKey("1234", 10, "play-b"))
    .toBe("room:1234:10:play-b");
});
```

학생 방장과 혼자 및 인공지능 미요청, `host` 및 `insufficient-players` 거절, 점수 버전 불일치, 담당 학생 범위, 같은 실행 중복 복원, 미스터리 추측 및 이야기 답안 제외, 사다리 라운드별 세 질문, 짝 찾기 `validQuestions: 0`, 영 점수 완료의 참가 및 완료 점수와 우승 제외를 시험한다.

짝 찾기처럼 실제 학생 질문이 하나도 없는 근거에는 인공지능 판정을 호출하지 않고, 주입된 가짜 `bestQuestion`과 모든 인공지능 보너스를 버리는 시험을 추가한다. 질문이 있는 놀이에서도 해당 학생의 저장 질문이 없으면 그 학생 대상 인공지능 보너스를 거절한다.

`publish-award-result`는 결과 본문이 있으면 `400`, 점수 기록이 없으면 `409`, 실제 기록이 있으면 그 기록만 방에 저장하는 시험을 추가한다.

- [ ] **단계 2: 교사 및 점수 시험의 예상 실패를 확인한다**

```bash
npm test -- src/__tests__/teacher-question-game-host.test.tsx src/__tests__/question-game-score-evidence.test.ts src/__tests__/points-award-route.test.ts src/__tests__/points-award-single-route.test.ts src/__tests__/room-result-award.test.tsx src/__tests__/award-publish-service-split.test.ts
```

- [ ] **단계 3: 학생과 교사의 공용 방 진행 껍데기를 만든다**

```ts
interface QuestionGameRoomFlowProps {
  game: BuiltInGame;
  myId: string;
  allowJoin: boolean;
  onExit: () => void;
}
```

기존 학생 페이지의 방 선택, 참가, 대기실과 `ROOM_GAME_MAP`을 `QuestionGameRoomFlow`로 옮긴다. 교사 `host` 페이지는 역할을 서버와 화면에서 확인하고 `allowJoin={false}`로 같은 구성 요소를 사용한다. 교사 목록에는 체험과 구분되는 `친구 방 열기` 명령을 추가하고 새 경로를 접근 허용 목록에 넣는다.

- [ ] **단계 4: 버전 `2` 점수 근거와 실행 키를 구현한다**

```ts
export interface StoredGameContribution {
  studentId: string;
  studentName: string;
  validQuestions: number;
  activityScore: number;
  questions: string[];
  isWinner: boolean;
}

export function buildRoomAwardKey(
  roomCode: string,
  roomCreatedAt: number,
  playId: string,
) {
  return `room:${roomCode}:${roomCreatedAt}:${playId}`;
}
```

점수 서비스는 버전 `1` 복원 경로를 유지하고 버전 `2`에서는 `GameRoom.playId`, 두 점수 버전 `2`, `stateVersion: 2`, `status: ended`, `endReason: completed`, 교사 방장과 담당 학생을 모두 확인한다. 우승 보너스는 짝 찾기와 까바의 양수 최고 점수에만 준다.

학생별 및 방 전체 질문 상한과 경쟁 우승 여부는 `QUESTION_GAME_RULES[gameId].score`에서 읽는다.

`questions.some(Boolean)`인 기여가 없으면 `callAI`를 건너뛰고 `buildAwardList`에는 `null`을 넘긴다. 인공지능 결과가 있더라도 저장된 질문 목록이 빈 학생의 `bestQuestion`과 보너스는 모두 버리며, `bestQuestion.question`은 그 학생의 정규화된 저장 질문 가운데 하나와 정확히 맞아야 한다.

- [ ] **단계 5: 검증된 결과 공유와 결과 화면 수명을 구현한다**

`RoomResult` 수명 키는 다음을 사용한다.

```ts
function lifetimeKeyOf(room: GameRoom) {
  return `${room.code}:${room.createdAt}:${room.playId ?? "legacy"}`;
}
```

교사 방장과 완료 실행만 `/api/points/award`를 호출한다. 성공 뒤 `publish-award-result`에는 `playId`와 명령 봉투만 보내며 결과 본문은 보내지 않는다. 서버는 실행 키의 `PointLog`와 저장된 분석 스냅샷을 복원해 `awardResult`를 넣는다.

혼자와 인공지능 화면의 `useSingleAward`, `AwardBadge`와 자동 지급 효과를 제거하고 결과 수만 표시한다.

- [ ] **단계 6: 교사, 점수와 결과 시험을 통과시킨다**

```bash
npm test -- src/__tests__/teacher-question-game-host.test.tsx src/__tests__/question-game-score-evidence.test.ts src/__tests__/points-award-route.test.ts src/__tests__/points-award-single-route.test.ts src/__tests__/room-result-award.test.tsx src/__tests__/award-publish-service-split.test.ts
npx tsc --noEmit
```

- [ ] **단계 7: 교사 방과 점수 작업을 커밋한다**

```bash
git add src/components/question-games/QuestionGameRoomFlow.tsx \
  'src/app/(student)/student-question-play/[gameId]/page.tsx' \
  'src/app/(teacher)/teacher-question-play/[gameId]/host/page.tsx' \
  'src/app/(teacher)/teacher-question-play/page.tsx' src/proxy.ts \
  src/lib/route-access.ts src/lib/question-game-score-evidence.ts \
  src/lib/game-award-result.ts src/lib/point-award-service.ts \
  src/app/api/points/award/route.ts \
  'src/app/api/question-games/rooms/[code]/route.ts' \
  'src/app/(student)/student-question-play/games/RoomResult.tsx' \
  'src/app/(student)/student-question-play/games/MemoryGame.tsx' \
  'src/app/(student)/student-question-play/games/MysteryBoxGame.tsx' \
  'src/app/(student)/student-question-play/games/LadderGame.tsx' \
  'src/app/(student)/student-question-play/games/StoryDiceGame.tsx' \
  'src/app/(student)/student-question-play/games/DiceGame.tsx' \
  'src/app/(student)/student-question-play/games/RelayGame.tsx' \
  'src/app/(student)/student-question-play/games/KabaGame.tsx' \
  src/__tests__/teacher-question-game-host.test.tsx \
  src/__tests__/question-game-score-evidence.test.ts \
  src/__tests__/points-award-route.test.ts \
  src/__tests__/points-award-single-route.test.ts \
  src/__tests__/room-result-award.test.tsx \
  src/__tests__/award-publish-service-split.test.ts
git commit -m "feat: 교사 질문놀이 방과 실행별 점수 연결"
```

---

### Task 9: 밝은 화면과 어두운 화면의 읽기 보완

**파일:**
- 수정: `src/app/(student)/student-question-play/games/roomShared.tsx`
- 수정: `src/app/(student)/student-question-play/games/GameHeader.tsx`
- 수정: `src/app/(student)/student-question-play/games/GameResultReview.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomResult.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomLobby.tsx`
- 수정: 일곱 `Room*.tsx` 방 화면
- 수정: 일곱 지역 놀이 화면
- 수정: `src/app/(student)/student-question-play/[gameId]/page.tsx`
- 수정: `src/components/question-games/QuestionGameRoomFlow.tsx`
- 생성: `src/__tests__/question-game-theme-tokens.test.ts`
- 수정: `src/__tests__/question-play-localization.test.ts`

**연결 규약:**
- 카드와 본문은 `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-background`, `bg-secondary`를 사용한다.
- 참가자색은 짧은 표식, 테두리와 강조에만 사용한다.
- 핵심 본문에 고정 `text-gray-*`, `bg-white`, 옅은 인라인 밝은 배경을 남기지 않는다.

- [ ] **단계 1: 고정 색 실패 지점 시험을 작성한다**

```ts
it.each(QUESTION_GAME_SURFACES)("%s는 공통 의미 색을 사용한다", (path) => {
  const source = readFileSync(path, "utf8");
  expect(source).not.toMatch(/color:\s*["']#1f2937/);
  expect(source).toContain("text-foreground");
});
```

릴레이 최신 질문, 이야기 흐름, 결과 최고 질문, 비활성 차례와 사다리 기본 선의 의미 색을 각각의 구성 요소 이름과 가까운 클래스 조각으로 구체적으로 검사한다. `bg-white` 자체를 파일 전체에서 막지 않고, 본문 카드와 입력처럼 의미 색이 필요한 요소만 `bg-card` 또는 `bg-background`를 쓰는지 검사한다. 단추처럼 의도적으로 흰 전경을 쓰는 경우는 대상 선택자를 좁혀 허용한다.

- [ ] **단계 2: 화면 주제 시험이 현재 고정 색 때문에 실패하는지 확인한다**

```bash
npm test -- src/__tests__/question-game-theme-tokens.test.ts src/__tests__/question-play-localization.test.ts
```

- [ ] **단계 3: 공통 화면 구성 요소부터 의미 색으로 바꾼다**

```tsx
<section className="bg-card text-foreground border border-border">
  <p className="text-muted-foreground">{subtitle}</p>
</section>
```

`roomShared`, `GameHeader`, `GameResultReview`, `RoomResult`, `RoomLobby`을 먼저 바꾸고 방 및 지역 화면이 이를 상속하게 한다.

- [ ] **단계 4: 모든 놀이의 진행 상태와 그림 색을 보완한다**

릴레이 최신 질문과 이야기 흐름에 명시적인 `text-foreground`를 둔다. 입력은 `bg-background text-foreground border-input`을 사용한다. 비활성 차례는 `bg-secondary text-muted-foreground`를 사용한다. 사다리 기본 선은 `hsl(var(--border))`, 글자는 `hsl(var(--foreground))`, 강조 경로는 밝고 어두운 화면 모두에서 `3:1` 이상인 팔레트를 사용한다.

- [ ] **단계 5: 의미 색 시험과 타입 검사를 통과시킨다**

```bash
npm test -- src/__tests__/question-game-theme-tokens.test.ts src/__tests__/question-play-localization.test.ts
npx tsc --noEmit
```

- [ ] **단계 6: 화면 주제 작업을 커밋한다**

```bash
git add 'src/app/(student)/student-question-play/games' \
  'src/app/(student)/student-question-play/[gameId]/page.tsx' \
  src/components/question-games/QuestionGameRoomFlow.tsx \
  src/__tests__/question-game-theme-tokens.test.ts \
  src/__tests__/question-play-localization.test.ts
git commit -m "fix: 질문놀이 밝고 어두운 화면 대비 보완"
```

---

### Task 10: 두 기기 흐름, 전체 회귀와 배포 전 검증

**파일:**
- 생성: `e2e/question-games-reliability.spec.ts`
- 생성: `e2e/helpers/question-game-room.ts`
- 생성: `src/__tests__/question-game-e2e-safety.test.ts`

**연결 규약:**
- 브라우저 시험은 학생 여덟 명과 교사 한 명의 격리된 문맥을 필요 수만큼 사용한다.
- 시험 사용자는 서명된 시험 세션으로만 존재하며 사용자, 방, 점수와 어떤 시험 자료도 연결 데이터베이스에 만들거나 지우지 않는다.
- 공유 메모리 전송기는 생성, 참가, 조회와 동작 요청을 가로채고 실제 순수 판정기와 공개 응답 변환기를 호출한다. 요청 경로와 저장소 계약은 앞 단계의 경로 단위 시험이 맡는다.
- 최종 검증은 전체 제약과 설계 문서 항목을 한 줄씩 대조한다.

```ts
export interface QuestionGameBrowserIdentity {
  id: string;
  name: string;
  role: "STUDENT" | "TEACHER";
}

export interface QuestionGameBrowserFixture {
  teacher: QuestionGameBrowserIdentity;
  students: readonly [
    QuestionGameBrowserIdentity,
    QuestionGameBrowserIdentity,
    QuestionGameBrowserIdentity,
    QuestionGameBrowserIdentity,
    QuestionGameBrowserIdentity,
    QuestionGameBrowserIdentity,
    QuestionGameBrowserIdentity,
    QuestionGameBrowserIdentity,
  ];
}
```

`createQuestionGameBrowserFixture(key)`는 고유한 시험 식별값만 만들고 데이터베이스에 접근하지 않는다. `openQuestionGameContext(browser, identity)`는 `next-auth/jwt`의 `encode`와 개발 서버가 사용하는 비밀값으로 `authjs.session-token`을 만든다. 알림과 방 요청은 문맥 안에서 가로채며, 공유 메모리 전송기는 시험이 끝날 때 `dispose()`로 비운다. 시험 도우미나 스펙에서 `PrismaClient`, `DATABASE_URL`, 자료 생성 및 삭제 함수를 가져오면 실패하는 정적 시험도 추가한다.

- [ ] **단계 1: 핵심 두 기기 실패 흐름을 브라우저 시험으로 작성한다**

```ts
test("두 학생의 미스터리 질문과 짝 찾기 차례가 같은 방에서 이어진다", async ({ browser }) => {
  const first = await openStudentRoom(browser, fixture.students[0], "mystery-box");
  const second = await joinStudentRoom(browser, fixture.students[1], first.code);
  await first.page.getByRole("button", { name: "놀이 시작" }).click();
  await first.page.getByLabel("질문").fill("동물인가요?");
  await first.page.getByRole("button", { name: "질문하기" }).click();
  await expect(second.page.getByText("동물인가요?")).toBeVisible();
});
```

두 명과 여덟 명 시작, 미스터리 공유 및 재접속, 짝 찾기 실패 뒤 다음 참가자, 비방장 마지막 활동 자동 종료, 사다리 세 라운드와 실제 경로, 모바일 및 데스크톱 화면을 포함한다.

여덟 명 학생 방은 `fixture.students` 전부를, 교사 방은 `fixture.teacher`와 앞의 학생 일곱 명을 사용한다. 두 경우 모두 아홉 번째 참가 요청 거절까지 공유 전송기로 검증한다.

밝고 어두운 화면 시험은 `getComputedStyle`로 상대 밝기를 계산해 일반 글자 `4.5`, 큰 글자 및 핵심 선 `3` 이상을 단언하고 `scrollWidth <= clientWidth`와 핵심 경계 상자 겹침 없음도 검사한다.

- [ ] **단계 2: 새 브라우저 승인 시험을 실행한다**

```bash
npx playwright test e2e/question-games-reliability.spec.ts --project=chromium
```

예상: 앞선 작업의 단위 시험으로 구현한 흐름이 실제 두 브라우저에서도 통과한다. 실패하면 아래 단계 3의 소유 시험으로 원인을 먼저 재현한다.

- [ ] **단계 3: 브라우저에서 발견한 범위 안 회귀를 최소 수정한다**

미스터리 실패는 `question-game-room-engine-mystery.test.ts`, 짝 찾기는 `question-game-room-engine-memory.test.ts`, 사다리는 `question-game-room-engine-ladder.test.ts`, 나머지 자동 종료는 `question-game-room-engine-rounds.test.ts`, 화면 대비는 `question-game-theme-tokens.test.ts`에 먼저 실패 시험을 추가한다. 실패를 확인한 뒤 그 시험의 소유 파일만 최소 수정하고 대상 단위 시험과 브라우저 시험을 다시 실행한다.

이 단계에서 제품 또는 단위 시험 파일을 바꿨으면 수정한 정확한 경로만 올려 `fix: 질문놀이 브라우저 회귀 보완` 커밋으로 먼저 기록한다. 다음 단계로 넘어가기 전에 `git status --short`에서 새 브라우저 시험 두 파일 외의 변경이 없어야 한다.

- [ ] **단계 4: 대상 시험과 전체 정적 검사를 실행한다**

```bash
npm test -- src/__tests__/question-game-rules.test.ts \
  src/__tests__/question-game-room-response.test.ts \
  src/__tests__/question-game-room-engine.test.ts \
  src/__tests__/question-game-room-engine-memory.test.ts \
  src/__tests__/question-game-room-engine-mystery.test.ts \
  src/__tests__/question-game-room-engine-ladder.test.ts \
  src/__tests__/question-game-room-engine-story-dice.test.ts \
  src/__tests__/question-game-room-engine-rounds.test.ts \
  src/__tests__/question-game-local-rounds.test.tsx \
  src/__tests__/question-game-e2e-safety.test.ts \
  src/__tests__/points-award-route.test.ts \
  src/__tests__/room-result-award.test.tsx
npm run lint
npx tsc --noEmit
```

- [ ] **단계 5: 전체 시험, 제품 빌드와 브라우저 시험을 실행한다**

```bash
npm test
npm run build
npx playwright test e2e/question-games-reliability.spec.ts --project=chromium
git diff --quiet 034197b -- prisma/schema.prisma prisma/migrations
```

예상: 모든 명령이 종료값 `0`, 전체 시험 실패 `0`, 스키마와 자료 이전 차이 없음이다.

- [ ] **단계 6: 최종 검토 결과를 반영하고 통합 시험을 커밋한다**

```bash
git add e2e/question-games-reliability.spec.ts \
  e2e/helpers/question-game-room.ts \
  src/__tests__/question-game-e2e-safety.test.ts
git commit -m "test: 질문놀이 핵심 흐름 회귀 검증"
```

- [ ] **단계 7: 원격 기본 가지에 푸시하고 배포 상태를 확인한다**

```bash
git push origin main
test -z "$(git status --porcelain)"
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
git status --short --branch
```

예상: 지역 `main`과 원격 `main`이 같은 커밋을 가리키고 작업 폴더가 깨끗하다.

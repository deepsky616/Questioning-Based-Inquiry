
# 게임 방 클라이언트 동기화 구현 계획

> **작업 에이전트 안내:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` 사용을 권장하며, 필요하면 `superpowers:executing-plans`로 작업별 실행한다. 모든 단계는 확인란 순서대로 진행한다.

**목표:** 늦은 방 응답과 오래된 버전이 화면을 되돌리지 않게 하고, 성공과 실패를 분리하며, 메모리 주사위 동시 결과를 잃지 않게 한다.

**구조:** `useRoom`은 동기식 참조값, 단조 버전 적용, 방 세대, 연결 요청 번호, 진행 요청 수를 한곳에서 관리한다. 메모리 주사위는 `memory-room-roll.ts`의 참가자별 명령을 거쳐 기존 원자 저장소에 최대 세 번 재적용한다. 요청 경로는 도메인 결과를 HTTP로 바꾸고 메모리 게임 중 참가자 나가기에도 같은 완료 판정을 사용한다.

**기술 구성:** Next.js 16 경로 처리기, React 19, TypeScript, Prisma 5.22, PostgreSQL JSONB, Vitest, Testing Library

## 전체 제약

- Prisma 스키마, 데이터베이스 표, 보안 정책을 바꾸지 않는다.
- 기존 방 자료를 일괄 읽거나 쓰지 않는다.
- 실제 연결 데이터베이스에 시험 자료를 만들지 않는다.
- 일반 `update-state`와 `set-state`는 충돌 뒤 자동 재시도하지 않는다.
- `memory-roll`만 참가자별로 최신 방에 최대 세 번 다시 적용한다.
- `409`의 최신 방은 화면에 적용할 수 있어도 동작 결과는 반드시 실패다.
- 낮은 버전과 이전 방 세대 응답은 방과 오류 상태를 바꾸지 않는다.
- 사용자 입력은 `RoomActionResult.ok`가 참일 때만 비운다.
- 기존 폴링 주기와 화면 구성, 게임 규칙은 꼭 필요한 동기화 변경 외에는 유지한다.
- 설계 기준은 `docs/superpowers/specs/2026-07-12-game-room-client-sync-design.md`다.
- 구현 전 기준 커밋은 `f7c242b`다.
- 기준 커밋에 포함된 데이터베이스 기준선과 인공지능 오류 처리 변경은 이번 작업에서 다시 수정하지 않는다.

## 파일 구성

- 수정: `src/lib/question-games-data.ts`
  공용 `RoomActionResult`, `RoomActionHandler` 형식을 둔다.
- 수정: `src/app/(student)/student-question-play/games/useRoom.ts`
  최신 방 참조, 단조 적용, 세대 판정, 연결 요청 번호, 진행 요청 수를 맡는다.
- 수정: `src/app/(student)/student-question-play/[gameId]/page.tsx`
  공용 동작 형식을 전달하고 결과를 무시하는 시작 동작을 명시한다.
- 수정: `src/app/(student)/student-question-play/games/RoomRelay.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomKaba.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomDice.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomStoryDice.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomMemory.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomLadder.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomResult.tsx`
  공용 동작 형식과 성공 시 입력 초기화 규칙을 반영한다.
- 수정: `src/lib/memory-game-data.ts`
  공용 주사위 라운드 식별값 검사와 이전 방 대체값 계산을 둔다.
- 생성: `src/lib/memory-room-roll.ts`
  메모리 주사위 명령, 멱등 처리, 재적용, 차례 확정을 맡는다.
- 수정: `src/app/api/question-games/rooms/[code]/route.ts`
  메모리 명령 결과를 HTTP로 바꾸고 나가기 완료 판정을 연결한다.
- 수정: `src/__tests__/use-room.test.tsx`
- 생성: `src/__tests__/room-action-inputs.test.tsx`
- 생성: `src/__tests__/memory-room-roll.test.ts`
- 수정: `src/__tests__/game-room-route.test.ts`
- 생성: `src/__tests__/room-memory-actions.test.tsx`

---

### Task 1: 공용 동작 결과와 최신 버전 단조 적용

**파일:**
- 수정: `src/lib/question-games-data.ts`
- 수정: `src/app/(student)/student-question-play/games/useRoom.ts`
- 수정: `src/app/(student)/student-question-play/[gameId]/page.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomRelay.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomKaba.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomDice.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomStoryDice.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomMemory.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomLadder.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomResult.tsx`
- 시험: `src/__tests__/use-room.test.tsx`

**연결 규약:**
- 입력: 기존 `GameRoom`, 방 코드, 동작 이름과 추가 요청값
- 출력: `RoomActionResult`, `RoomActionHandler`
- Task 2 이후 모든 `onAction`은 이 공용 형식을 사용한다.

- [ ] **단계 1: 최신 버전과 결과형을 고정하는 실패 시험을 작성한다**

시험 공용 도우미를 추가한다.

```ts
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function requestBody(init?: RequestInit) {
  return init?.body ? JSON.parse(String(init.body)) : null;
}
```

다음 여섯 시험을 실제 지연 응답으로 작성한다.

1. 활성 방 없이 `sendAction("start")`를 호출하면 fetch를 부르지 않고 `{ ok: false, room: null, status: null, reason: "inactive" }`를 반환한다.
2. 참가로 버전 1을 적용한 뒤 같은 `sendAction` 함수 참조로 두 동작을 이어 호출하면 PATCH 본문의 `expectedVersion`이 차례로 `1`, `2`다.
3. 버전 2 성공 PATCH를 지연시키고 버전 3의 `409`를 먼저 적용한 뒤 성공 응답을 풀어도 최종 방은 버전 3이다. `409` 결과는 `conflict`, 성공 결과는 현재 버전 3을 담은 `ok: true`다.
4. 버전 1 폴링 GET을 지연시키고 버전 2 동작 응답을 먼저 적용한 뒤 GET을 풀어도 최종 방은 버전 2다.
5. `sendAction`의 fetch가 연결 오류를 던지면 현재 방을 유지하고 `{ status: null, reason: "network" }`를 반환한다.
6. 서버가 `400`을 반환하면 현재 방을 유지하고 `{ status: 400, reason: "rejected" }`를 반환한다.

핵심 검증은 다음과 같다.

```ts
expect(sentVersions).toEqual([1, 2]);
expect(result.current.room?.version).toBe(3);
expect(conflictResult).toMatchObject({
  ok: false,
  status: 409,
  reason: "conflict",
  room: { version: 3 },
});
expect(successResult).toMatchObject({
  ok: true,
  room: { version: 3 },
});
```

- [ ] **단계 2: 새 훅 시험이 현재 구현에서 실패하는지 확인한다**

```bash
npx vitest run src/__tests__/use-room.test.tsx -t "inactive|같은 sendAction|높은 409|낮은 폴링|network|rejected"
```

예상: `sendAction`이 `GameRoom | null`을 반환하고 렌더 당시 버전을 사용하므로 실패한다.

- [ ] **단계 3: 공용 결과형과 호출 형식을 추가한다**

`GameRoom` 형식 바로 뒤에 추가한다.

```ts
export type RoomActionResult =
  | { ok: true; room: GameRoom }
  | {
      ok: false;
      room: GameRoom | null;
      status: number | null;
      reason:
        | "conflict"
        | "missing"
        | "network"
        | "inactive"
        | "superseded"
        | "rejected";
    };

export type RoomActionHandler = (
  action: string,
  extra?: Record<string, unknown>,
) => Promise<RoomActionResult>;
```

`UseRoomResult.sendAction`, 페이지의 `RoomGameComponent.onAction`, 일곱 방 게임 구성 요소의 `Props.onAction`을 모두 `RoomActionHandler`로 바꾼다. 페이지 시작 동작은 다음처럼 성공값을 의도적으로 무시한다.

```tsx
onStart={() => { void sendAction("start"); }}
```

- [ ] **단계 4: `useRoom`에 최신 참조값과 단조 적용을 구현한다**

React 상태와 함께 다음 참조값을 둔다.

```ts
const roomRef = useRef<GameRoom | null>(null);
const activeCodeRef = useRef<string | null>(null);
```

방 교체와 일반 응답 적용은 다음 규칙을 한곳에 모은다.

```ts
const replaceRoom = useCallback((nextRoom: GameRoom) => {
  activeCodeRef.current = nextRoom.code;
  roomRef.current = nextRoom;
  setActiveCodeState(nextRoom.code);
  setRoom(nextRoom);
  return nextRoom;
}, []);

const applyRoom = useCallback((nextRoom: GameRoom): GameRoom | null => {
  const current = roomRef.current;
  if (activeCodeRef.current !== nextRoom.code) return current;
  if (current?.code === nextRoom.code && nextRoom.version < current.version) {
    return current;
  }
  roomRef.current = nextRoom;
  setRoom(nextRoom);
  return nextRoom;
}, []);
```

`sendAction`은 호출 직전의 참조값으로 요청을 만든다.

```ts
const code = activeCodeRef.current;
const currentRoom = roomRef.current;
if (!code || !currentRoom) {
  return { ok: false, room: currentRoom, status: null, reason: "inactive" };
}

const body = action === "memory-roll"
  ? { action, ...extra }
  : { action, ...extra, expectedVersion: currentRoom.version };
```

응답은 다음 순서로 판정한다.

```ts
if (res.status === 409) {
  const applied = data.room ? applyRoom(data.room) : roomRef.current;
  setError(data.error ?? "작업 실패");
  return { ok: false, room: applied, status: 409, reason: "conflict" };
}
if (res.status === 404) {
  return { ok: false, room: null, status: 404, reason: "missing" };
}
if (!res.ok || !data.room || data.room.code !== code) {
  setError(data.error ?? "작업 실패");
  return {
    ok: false,
    room: roomRef.current,
    status: res.status,
    reason: "rejected",
  };
}
return { ok: true, room: applyRoom(data.room) ?? data.room };
```

통신 예외는 현재 방을 유지한 `network` 실패로 바꾼다. 생성과 참가는 성공 시 `replaceRoom`을 사용하고, 나가기 성공은 `activeCodeRef`와 `roomRef`도 상태보다 먼저 비운다. 폴링 성공과 나가기 `409`도 `applyRoom`을 사용한다.

- [ ] **단계 5: 훅 시험과 타입 검사를 통과시킨다**

```bash
npx vitest run src/__tests__/use-room.test.tsx
npx tsc --noEmit
```

예상: 훅 시험 전체와 타입 검사가 통과한다.

- [ ] **단계 6: 첫 구현을 커밋한다**

```bash
git add src/lib/question-games-data.ts \
  'src/app/(student)/student-question-play/games/useRoom.ts' \
  'src/app/(student)/student-question-play/[gameId]/page.tsx' \
  'src/app/(student)/student-question-play/games/RoomRelay.tsx' \
  'src/app/(student)/student-question-play/games/RoomKaba.tsx' \
  'src/app/(student)/student-question-play/games/RoomDice.tsx' \
  'src/app/(student)/student-question-play/games/RoomStoryDice.tsx' \
  'src/app/(student)/student-question-play/games/RoomMemory.tsx' \
  'src/app/(student)/student-question-play/games/RoomLadder.tsx' \
  'src/app/(student)/student-question-play/games/RoomResult.tsx' \
  src/__tests__/use-room.test.tsx
git commit -m "fix: keep game room state monotonic"
```

---

### Task 2: 방 세대, 연결 순서, 겹친 요청 상태

**파일:**
- 수정: `src/app/(student)/student-question-play/games/useRoom.ts`
- 시험: `src/__tests__/use-room.test.tsx`

**연결 규약:**
- 입력: Task 1의 `RoomActionResult`, `roomRef`, `activeCodeRef`, `applyRoom`
- 출력: 이전 방 응답을 `superseded`로 분리하는 세대 판정과 정확한 `actionLoading`

- [ ] **단계 1: 세대와 요청 순서 실패 시험을 추가한다**

`deferred<Response>()`와 요청 본문 분기를 사용해 다음 상황을 각각 검증한다.

| 시험 이름 | 응답 순서 | 최종 검증 |
| --- | --- | --- |
| 나가기 성공 뒤 늦은 PATCH 응답은 이전 방을 되살리지 않는다 | PATCH 시작, leave 성공, PATCH 버전 2 | 방 `null`, PATCH 결과 `superseded` |
| 다른 방 연결 뒤 이전 방 GET 응답을 무시한다 | 방 1234 GET 시작, 방 5678 참가, GET 버전 3 | 방 코드 `5678` |
| 다른 방 연결 뒤 이전 방 PATCH 응답은 superseded를 반환한다 | 방 1234 PATCH 시작, 방 5678 참가, PATCH 성공 | 방 코드 `5678`, 결과 `superseded` |
| 세대가 지난 실패 응답은 현재 방 오류를 덮지 않는다 | 이전 PATCH 시작, 새 방 참가, 이전 PATCH `500` | 새 방 유지, 오류 `null` |
| 생성 뒤 시작한 참가가 먼저 끝나면 늦은 생성 성공은 무시한다 | POST 시작, 참가 시작 및 성공, POST 성공 | 참가 방 유지 |
| 참가 뒤 시작한 생성이 먼저 끝나면 늦은 참가 성공은 무시한다 | 참가 시작, POST 시작 및 성공, 참가 성공 | 생성 방 유지 |
| 이전 연결 실패는 최신 연결의 방과 오류를 바꾸지 않는다 | POST 시작, 참가 성공, POST `500` | 참가 방 유지, 오류 `null` |
| 겹친 두 방 동작 중 하나가 먼저 끝나도 actionLoading은 참이다 | PATCH 두 개, 첫 성공, 둘째 연결 오류 | 첫 완료 뒤 참, 마지막 뒤 거짓 |
| 폴링 요청은 actionLoading에 포함하지 않는다 | 지연 GET 한 개 | 계속 거짓 |
| 현재 방 PATCH의 `404`는 연결을 비운다 | 동작 `404` | 방과 활성 코드 비움, 결과 `missing` |
| 현재 방 GET의 `404`는 연결을 비운다 | 폴링 `404` | 방과 활성 코드 비움 |

나가기 시험의 핵심 검증은 다음과 같다.

```ts
expect(result.current.room).toBeNull();
expect(actionResult).toMatchObject({
  ok: false,
  room: null,
  status: null,
  reason: "superseded",
});
```

연결 요청 시험은 `makeRoom(version, code)`로 서로 다른 코드를 만든다.

```ts
function makeRoom(version = 1, code = "1234"): GameRoom {
  return {
    code,
    gameId: "question-chain",
    hostId: "user-1",
    status: "waiting",
    players: [{ id: "user-1", name: "학생", isHost: true, joinedAt: 1 }],
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version,
    createdAt: 1,
    updatedAt: 1,
  };
}
```

- [ ] **단계 2: 새 경합 시험이 실패하는지 확인한다**

```bash
npx vitest run src/__tests__/use-room.test.tsx -t "늦은 PATCH|다른 방|연결|actionLoading|폴링 요청"
```

예상: 이전 PATCH가 방을 되살리거나 먼저 끝난 요청이 적재 상태를 끄므로 실패한다.

- [ ] **단계 3: 방 세대와 연결 요청 번호를 구현한다**

기존 `pollGenerationRef`는 제거하고 하나의 `roomGenerationRef`를 폴링과 PATCH에 함께 사용한다. 다음 참조값과 판정 도우미를 추가한다.

```ts
const roomGenerationRef = useRef(0);
const connectIntentRef = useRef(0);
const pendingActionCountRef = useRef(0);

function isCurrentRequest(code: string, generation: number) {
  return activeCodeRef.current === code &&
    roomGenerationRef.current === generation;
}
```

실제 방 교체와 비우기에서만 세대를 올린다.

```ts
const replaceRoom = useCallback((nextRoom: GameRoom) => {
  roomGenerationRef.current += 1;
  activeCodeRef.current = nextRoom.code;
  roomRef.current = nextRoom;
  setActiveCodeState(nextRoom.code);
  setRoom(nextRoom);
  return nextRoom;
}, []);

const clearRoom = useCallback(() => {
  roomGenerationRef.current += 1;
  connectIntentRef.current += 1;
  activeCodeRef.current = null;
  roomRef.current = null;
  setActiveCodeState(null);
  setRoom(null);
}, []);
```

폴링과 `sendAction`, `leaveRoom`은 시작 시 `{ code, generation }`을 잡고 모든 응답과 예외 처리 전에 `isCurrentRequest`를 확인한다. 세대가 다르면 방과 오류를 건드리지 않고 `superseded`를 반환한다.

현재 세대의 PATCH 또는 GET이 `404`이면 오류를 설정한 뒤 `clearRoom()`으로 연결을 비운다. PATCH 호출부에는 `{ ok: false, room: null, status: 404, reason: "missing" }`을 반환한다. 이미 세대가 지난 `404`는 아무 상태도 바꾸지 않는다.

생성과 참가는 시작 시 다음 번호를 잡는다.

```ts
const intent = ++connectIntentRef.current;
```

성공 방 적용과 오류 표시는 `intent === connectIntentRef.current`일 때만 수행한다. 연결 시도 자체는 방 세대를 올리지 않는다.

외부에 반환하는 `setActiveCode`는 React 원시 설정기가 아니다. 코드가 실제로 달라질 때 세대와 연결 요청 번호를 올리고 `activeCodeRef`, `roomRef`, React 상태를 함께 맞추는 래퍼를 반환한다. `null`은 `clearRoom()`을 사용하고, 새 코드는 현재 방 객체를 비운 뒤 폴링이 새 방을 가져오게 한다.

- [ ] **단계 4: 진행 요청 수를 구현한다**

생성, 참가, 동작, 나가기에 같은 도우미를 사용하고 폴링에는 사용하지 않는다.

```ts
const beginAction = useCallback(() => {
  pendingActionCountRef.current += 1;
  if (pendingActionCountRef.current === 1) setActionLoading(true);
}, []);

const endAction = useCallback(() => {
  pendingActionCountRef.current = Math.max(
    0,
    pendingActionCountRef.current - 1,
  );
  if (pendingActionCountRef.current === 0) setActionLoading(false);
}, []);
```

모든 변경 요청은 `beginAction()` 뒤 `try/catch/finally`로 감싸고 `finally`에서 `endAction()`을 호출한다.

- [ ] **단계 5: 훅 전체 시험과 타입 검사를 통과시킨다**

```bash
npx vitest run src/__tests__/use-room.test.tsx
npx tsc --noEmit
```

예상: 기존 나가기 시험과 새 경합 시험이 모두 통과한다.

- [ ] **단계 6: 세대 처리를 커밋한다**

```bash
git add 'src/app/(student)/student-question-play/games/useRoom.ts' \
  src/__tests__/use-room.test.tsx
git commit -m "fix: ignore superseded room responses"
```

---

### Task 3: 실패 입력 보존

**파일:**
- 수정: `src/app/(student)/student-question-play/games/RoomRelay.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomKaba.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomDice.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomStoryDice.tsx`
- 수정: `src/app/(student)/student-question-play/games/RoomLadder.tsx`
- 생성: `src/__tests__/room-action-inputs.test.tsx`

**연결 규약:**
- 입력: Task 1의 `RoomActionHandler`
- 출력: 실패 시 입력 유지, 성공 시 입력 초기화

- [ ] **단계 1: 실제 화면 입력 동작의 실패 시험을 작성한다**

시험 파일은 jsdom과 실제 구성 요소를 사용한다.

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type {
  BuiltInGame,
  GameRoom,
  RoomActionHandler,
  RoomActionResult,
} from "@/lib/question-games-data";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const conflict = (room: GameRoom): RoomActionResult => ({
  ok: false,
  room,
  status: 409,
  reason: "conflict",
});
const success = (room: GameRoom): RoomActionResult => ({ ok: true, room });

function actionSequence(room: GameRoom) {
  return vi.fn<RoomActionHandler>()
    .mockResolvedValueOnce(conflict(room))
    .mockResolvedValueOnce(success(room));
}

async function expectFailureThenSuccess(
  input: HTMLInputElement | HTMLTextAreaElement,
  submit: HTMLElement,
  onAction: ReturnType<typeof actionSequence>,
  value: string,
) {
  fireEvent.change(input, { target: { value } });
  fireEvent.click(submit);
  await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
  expect(input).toHaveValue(value);

  fireEvent.click(submit);
  await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
  expect(input).toHaveValue("");
}
```

각 화면은 다음 최소 상태와 선택자를 사용한다.

| 화면 | `gameState` 또는 방 상태 | 입력 선택자 | 제출 단추 |
| --- | --- | --- | --- |
| `RoomRelay` | `topic: "우주"`, 내 차례, 빈 `chain` | 첫 질문 자리표시자 | `질문 연결` |
| `RoomKaba` | 문장 한 개, `idx: 0`, 빈 `history` | `질문으로 바꿔` | `확인하기` |
| `RoomDice` | `phase: "writing"`, `face: 1`, 빈 `history` | 질문 유형 자리표시자 | `제출하기` |
| `RoomLadder` | 내 배정 한 개, 빈 `questions` | `대한 질문` | `질문 제출` |
| `RoomStoryDice` 이야기 | `phase: "story"`, `myId`는 술래, `rolled` 있음 | `한 문장` | `이야기 시작` |
| `RoomStoryDice` 질문 | `phase: "qa"`, `myId`는 술래가 아닌 현재 질문자, 마지막 항목은 이야기 | `질문을 만들어` | `질문 제출` |
| `RoomStoryDice` 대답 | `phase: "qa"`, `myId`는 술래, 마지막 항목은 질문 | `대답을 한 문장` | `대답 제출` |

각 시험은 `actionSequence(room)`과 `expectFailureThenSuccess`를 호출한다. 이야기 주사위 세 상태는 `it.each`로 같은 성공 및 실패 규칙을 검증한다.

- [ ] **단계 2: 입력 시험이 현재 참인 실패 객체 때문에 실패하는지 확인한다**

```bash
npx vitest run src/__tests__/room-action-inputs.test.tsx
```

예상: 실패 결과 객체가 참으로 평가되거나 결과를 확인하지 않아 입력이 비워진다.

- [ ] **단계 3: 모든 제출 함수가 `result.ok`만 보게 바꾼다**

다음 직접 판정을 각 함수에 적용한다.

```ts
// RoomRelay.submitQuestion
const result = await onAction("add-question", { question: trimmed });
if (result.ok) setInputQ("");

// RoomKaba.submit
const result = await onAction("update-state", {
  patch: { history: [...state.history, entry], idx: newIdx },
  turnIndex: (room.turnIndex + 1) % room.players.length,
  ...(ended ? { status: "ended" } : {}),
});
if (result.ok) setInput("");

// RoomDice.submit
const result = await onAction("update-state", {
  patch: { phase: "rolling", face: 0, history: [...state.history, entry] },
  turnIndex: (room.turnIndex + 1) % room.players.length,
});
if (result.ok) setInput("");

// RoomLadder.submitQuestion
const result = await onAction("update-state", {
  patch: { questions: [...state.questions, q] },
});
if (result.ok) setQuestionInput("");

// RoomStoryDice의 세 제출 함수
const result = await onAction("update-state", { patch });
if (result.ok) setInput("");
```

질문 릴레이 주제는 성공 방 응답이 다음 화면으로 전환하므로 별도 입력 초기화를 추가하지 않는다. 지역 입력을 바꾸지 않는 종료, 다시 시작, 결과 공유 호출은 `void onAction(...)`으로 성공값을 의도적으로 무시한다.

- [ ] **단계 4: 화면 시험과 타입 검사를 통과시킨다**

```bash
npx vitest run src/__tests__/room-action-inputs.test.tsx
npx tsc --noEmit
```

예상: 일곱 입력 흐름과 타입 검사가 통과한다.

- [ ] **단계 5: 입력 보존을 커밋한다**

```bash
git add 'src/app/(student)/student-question-play/games/RoomRelay.tsx' \
  'src/app/(student)/student-question-play/games/RoomKaba.tsx' \
  'src/app/(student)/student-question-play/games/RoomDice.tsx' \
  'src/app/(student)/student-question-play/games/RoomStoryDice.tsx' \
  'src/app/(student)/student-question-play/games/RoomLadder.tsx' \
  src/__tests__/room-action-inputs.test.tsx
git commit -m "fix: preserve room inputs on conflicts"
```

---

### Task 4: 메모리 주사위 도메인 명령

**파일:**
- 수정: `src/lib/memory-game-data.ts`
- 생성: `src/lib/memory-room-roll.ts`
- 생성: `src/__tests__/memory-room-roll.test.ts`

**연결 규약:**
- 입력: `RecordMemoryRollInput`, 기존 `saveGameRoom`
- 출력: `MemoryRollResult`, `settleMemoryRollingRoom`
- Task 5의 요청 경로와 Task 6의 화면이 이 규약을 사용한다.

- [ ] **단계 1: 도메인 명령의 실패 시험을 작성한다**

저장소를 시험 대역으로 바꾼다.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";

const storeMocks = vi.hoisted(() => ({ saveGameRoom: vi.fn() }));
vi.mock("@/lib/game-room-store", () => ({
  saveGameRoom: storeMocks.saveGameRoom,
}));

import {
  recordMemoryRoll,
  settleMemoryRollingRoom,
} from "@/lib/memory-room-roll";

beforeEach(() => {
  storeMocks.saveGameRoom.mockReset();
});
```

시험 방 도우미는 실제 `GameRoom` 모양을 만든다.

```ts
interface MemoryRoomOptions {
  version?: number;
  gameId?: string;
  phase?: string;
  players?: GameRoom["players"];
  diceRolls?: Record<string, number>;
  includeRoundId?: boolean;
}

function makeMemoryRoom(options: MemoryRoomOptions = {}): GameRoom {
  const players = options.players ?? [
    { id: "host", name: "방장", isHost: true, joinedAt: 1 },
    { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    { id: "user-1", name: "학생", isHost: false, joinedAt: 3 },
  ];
  return {
    code: "1234",
    gameId: options.gameId ?? "memory",
    hostId: players[0].id,
    status: "playing",
    players,
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {
      phase: options.phase ?? "rolling",
      diceRolls: options.diceRolls ?? {},
      ...(options.includeRoundId === false
        ? {}
        : { rollRoundId: "round-1" }),
      turnOrder: [],
      currentTurnIdx: 0,
    },
    version: options.version ?? 1,
    createdAt: 10,
    updatedAt: 10,
  };
}
```

다음 시험을 모두 구현한다.

| 시험 | 저장 대역 | 기대 결과 |
| --- | --- | --- |
| 충돌 뒤 최신 지도에 현재 사용자만 합침 | 첫 `conflict`, 둘째 `saved` | 세 참가자 값 모두 보존 |
| 같은 값 재전송 | 호출 없음 | `replayed`, 버전 증가 없음 |
| 다른 값 재전송 | 호출 없음 | `conflict/value`, 첫 값 유지 |
| 마지막 결과 | `saved` | 같은 후보에 `play`, `currentTurnIdx: 0`, 안정된 `turnOrder` |
| 세 번 충돌 | 세 번 `conflict` | 최신 방 재판정 뒤 `retry-exhausted` |
| 세 번째 충돌 최신 방에 같은 값 존재 | 세 번 `conflict` | 최종 `replayed` |
| 저장 중 삭제 | `missing` | `missing` |
| 잘못된 게임, 주사위, 라운드 | 호출 없음 | 각 `invalid` 이유 |
| 비참가자 | 호출 없음 | `forbidden` |
| 값 없는 `play` 단계 | 호출 없음 | `conflict/phase` |
| 다른 라운드 | 호출 없음 | `conflict/round` |
| 손상 상태 | 호출 없음 | `corrupt` |
| 예전 `rolling` 방 | `saved` | `legacy:코드:생성시각`을 같은 후보에 저장 |
| 나간 참가자 정리 | 순수 함수 | 떠난 사람의 값 제거 뒤 남은 차례 확정 |
| 바꿀 내용 없음 | 순수 함수 | 입력과 같은 객체 반환 |

충돌 병합 시험의 핵심 검증은 다음과 같다.

```ts
expect(storeMocks.saveGameRoom).toHaveBeenCalledTimes(2);
const secondCandidate = storeMocks.saveGameRoom.mock.calls[1][0] as GameRoom;
expect(
  (secondCandidate.gameState as { diceRolls: Record<string, number> }).diceRolls,
).toEqual({ host: 6, other: 4, "user-1": 5 });
```

마지막 결과의 동점은 `joinedAt`과 사용자 식별값으로 고정한다.

```ts
expect(
  (savedCandidate.gameState as { turnOrder: string[] }).turnOrder,
).toEqual(["user-1", "a", "b"]);
```

- [ ] **단계 2: 새 도메인 시험이 모듈 부재로 실패하는지 확인한다**

```bash
npx vitest run src/__tests__/memory-room-roll.test.ts
```

예상: `@/lib/memory-room-roll`을 찾지 못해 실패한다.

- [ ] **단계 3: 공용 라운드 식별값 도우미를 구현한다**

`src/lib/memory-game-data.ts`에 추가한다.

```ts
export function isMemoryRollRoundId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value;
}

export function resolveMemoryRollRoundId(
  room: { code: string; createdAt: number },
  stored: unknown,
): string | null {
  if (stored === undefined) {
    return ["legacy", room.code, room.createdAt].join(":");
  }
  return isMemoryRollRoundId(stored) ? stored : null;
}
```

- [ ] **단계 4: 메모리 명령 공개 형식을 구현한다**

`src/lib/memory-room-roll.ts`는 다음 형식을 내보낸다.

```ts
export type MemoryRollConflictReason =
  | "round"
  | "value"
  | "phase"
  | "retry-exhausted";

export type MemoryRollResult =
  | { kind: "saved"; room: GameRoom; roll: number; replayed: false }
  | { kind: "replayed"; room: GameRoom; roll: number; replayed: true }
  | { kind: "conflict"; room: GameRoom; reason: MemoryRollConflictReason }
  | { kind: "invalid"; room: GameRoom; reason: "game" | "roll" | "round" }
  | { kind: "forbidden"; room: GameRoom }
  | { kind: "missing"; room: null }
  | { kind: "corrupt"; room: GameRoom };

export interface RecordMemoryRollInput {
  initialRoom: GameRoom;
  userId: string;
  roll: unknown;
  rollRoundId: unknown;
}

export function settleMemoryRollingRoom(room: GameRoom): GameRoom;
export function recordMemoryRoll(
  input: RecordMemoryRollInput,
): Promise<MemoryRollResult>;
```

- [ ] **단계 5: 완료 도우미와 참가자별 멱등 저장을 구현한다**

`settleMemoryRollingRoom`은 `memory`의 `rolling` 단계에서만 다음을 수행한다.

1. 상태가 손상되면 입력 객체를 그대로 반환한다.
2. 현재 참가자 밖의 `diceRolls` 키를 제거한다.
3. 라운드 값이 없으면 `resolveMemoryRollRoundId`의 대체값을 넣는다.
4. 남은 참가자가 한 명 이상이고 모두 1부터 6까지의 정수 결과를 가지면 차례와 `play` 단계를 정한다.
5. 아무 값도 바뀌지 않으면 입력 객체를 그대로 반환한다.

정렬은 다음과 같다.

```ts
const turnOrder = [...room.players]
  .sort((a, b) => {
    const rollDiff = diceRolls[b.id] - diceRolls[a.id];
    if (rollDiff !== 0) return rollDiff;
    if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })
  .map((player) => player.id);
```

`recordMemoryRoll`은 게임, 참가자, 상태, 주사위, 라운드, 기존 값, 단계 순서로 검사한다. 같은 값은 단계 검사보다 먼저 `replayed`로 반환한다. 새 값은 최신 지도에 한 항목만 합치고 완료 도우미를 거쳐 저장한다.

내부 판정 함수의 형식과 분기는 다음과 같이 고정한다.

```ts
type MemoryRollEvaluation =
  | MemoryRollResult
  | { kind: "candidate"; room: GameRoom; roll: number };

function isDiceRollMap(value: unknown): value is Record<string, number> {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (roll) => Number.isInteger(roll) && roll >= 1 && roll <= 6,
    );
}

function evaluateMemoryRoll(
  room: GameRoom,
  input: RecordMemoryRollInput,
): MemoryRollEvaluation {
  if (room.gameId !== "memory") {
    return { kind: "invalid", room, reason: "game" };
  }
  if (!room.players.some((player) => player.id === input.userId)) {
    return { kind: "forbidden", room };
  }

  const state = room.gameState;
  if (
    typeof state.phase !== "string" ||
    !isDiceRollMap(state.diceRolls)
  ) {
    return { kind: "corrupt", room };
  }
  if (
    !Number.isInteger(input.roll) ||
    (input.roll as number) < 1 ||
    (input.roll as number) > 6
  ) {
    return { kind: "invalid", room, reason: "roll" };
  }
  if (!isMemoryRollRoundId(input.rollRoundId)) {
    return { kind: "invalid", room, reason: "round" };
  }

  const currentRoundId = resolveMemoryRollRoundId(
    room,
    state.rollRoundId,
  );
  if (!currentRoundId) return { kind: "corrupt", room };
  if (input.rollRoundId !== currentRoundId) {
    return { kind: "conflict", room, reason: "round" };
  }

  const existing = state.diceRolls[input.userId];
  if (existing === input.roll) {
    return {
      kind: "replayed",
      room,
      roll: existing,
      replayed: true,
    };
  }
  if (existing !== undefined) {
    return { kind: "conflict", room, reason: "value" };
  }
  if (state.phase !== "rolling") {
    return { kind: "conflict", room, reason: "phase" };
  }

  const candidate = settleMemoryRollingRoom({
    ...room,
    gameState: {
      ...state,
      rollRoundId: currentRoundId,
      diceRolls: {
        ...state.diceRolls,
        [input.userId]: input.roll as number,
      },
    },
  });
  return { kind: "candidate", room: candidate, roll: input.roll as number };
}
```

```ts
const MEMORY_ROLL_WRITE_ATTEMPTS = 3;
let room = input.initialRoom;

for (let attempt = 0; attempt < MEMORY_ROLL_WRITE_ATTEMPTS; attempt += 1) {
  const evaluated = evaluateMemoryRoll(room, input);
  if (evaluated.kind !== "candidate") return evaluated;

  const saved = await saveGameRoom(evaluated.room);
  if (saved.kind === "saved") {
    return {
      kind: "saved",
      room: saved.room,
      roll: evaluated.roll,
      replayed: false,
    };
  }
  if (saved.kind === "missing") return { kind: "missing", room: null };
  room = saved.room;
}

const final = evaluateMemoryRoll(room, input);
if (final.kind !== "candidate") return final;
return { kind: "conflict", room, reason: "retry-exhausted" };
```

`evaluateMemoryRoll`은 파일 내부 형식이며 외부로 내보내지 않는다. 예상하지 못한 저장소 예외는 여기서 잡지 않고 Task 5의 요청 경로까지 전달한다.

- [ ] **단계 6: 도메인 시험과 타입 검사를 통과시킨다**

```bash
npx vitest run src/__tests__/memory-room-roll.test.ts
npx tsc --noEmit
```

예상: 메모리 명령과 완료 도우미 시험이 모두 통과한다.

- [ ] **단계 7: 도메인 명령을 커밋한다**

```bash
git add src/lib/memory-game-data.ts src/lib/memory-room-roll.ts \
  src/__tests__/memory-room-roll.test.ts
git commit -m "feat: add atomic memory dice rolls"
```

---

### Task 5: 메모리 명령 HTTP 연결과 나가기 완료 판정

**파일:**
- 수정: `src/app/api/question-games/rooms/[code]/route.ts`
- 수정: `src/__tests__/game-room-route.test.ts`

**연결 규약:**
- 입력: Task 4의 `recordMemoryRoll`, `settleMemoryRollingRoom`, `MemoryRollResult`
- 출력: 정해진 HTTP 상태와 JSON, 나가기 저장에 포함된 메모리 완료 상태

- [ ] **단계 1: 요청 경로 변환과 나가기 연결 실패 시험을 작성한다**

기존 hoisted 시험 대역에 다음 함수를 추가한다.

```ts
recordMemoryRoll: vi.fn(),
settleMemoryRollingRoom: vi.fn((room: GameRoom) => room),
```

모듈 시험 대역은 다음과 같다.

```ts
vi.mock("@/lib/memory-room-roll", () => ({
  recordMemoryRoll: mocks.recordMemoryRoll,
  settleMemoryRollingRoom: mocks.settleMemoryRollingRoom,
}));
```

다음 요청 경로를 검증한다.

| 도메인 결과 또는 상황 | HTTP와 몸체 |
| --- | --- |
| `saved` | `200`, `{ room, result: { roll, replayed: false } }` |
| `replayed` | `200`, `{ room, result: { roll, replayed: true } }` |
| `invalid` | `400` |
| `forbidden` | `403` |
| `missing` | `404` |
| `conflict` | 최신 `room`을 담은 `409` |
| `corrupt` | 세부 내용을 숨긴 `500` |
| 명령 함수 예외 | 예외 문구를 담지 않은 `500` |
| 본문에 다른 `userId` 포함 | 명령에는 세션의 `user-1` 전달 |
| 본문에 오래된 `expectedVersion` 포함 | `memory-roll`은 명령 호출, 사전 거절 없음 |

세션 사용자 검증은 다음과 같다.

```ts
expect(mocks.recordMemoryRoll).toHaveBeenCalledWith({
  initialRoom: room,
  userId: "user-1",
  roll: 5,
  rollRoundId: "round-1",
});
```

나가기 시험은 다음 네 상황을 추가한다.

1. 참가자를 제거한 후보를 `settleMemoryRollingRoom`에 전달하고, 도우미가 돌려준 `play` 후보를 `saveGameRoom`에 넘긴다.
2. 저장 충돌 뒤 최신 방에서 참가자 제거와 완료 판정을 다시 수행한다.
3. 이미 나간 사용자라도 도우미가 새 후보를 만들면 저장하고, 같은 객체를 돌려주면 기존처럼 저장 없이 성공한다.
4. 마지막 참가자 나가기는 완료 도우미가 아니라 기존 조건부 삭제를 사용한다.

- [ ] **단계 2: 경로 시험이 새 분기 부재로 실패하는지 확인한다**

```bash
npx vitest run src/__tests__/game-room-route.test.ts -t "memory-roll|rolling|메모리"
```

예상: 알 수 없는 동작 `400` 또는 메모리 도우미 미호출로 실패한다.

- [ ] **단계 3: 메모리 결과를 HTTP로 변환한다**

일반 동작 분기 전에 다음 처리기를 호출한다.

```ts
async function handleMemoryRoll(
  room: GameRoom,
  userId: string,
  body: Record<string, unknown>,
) {
  try {
    const result = await recordMemoryRoll({
      initialRoom: room,
      userId,
      roll: body.roll,
      rollRoundId: body.rollRoundId,
    });
    if (result.kind === "saved" || result.kind === "replayed") {
      return NextResponse.json({
        room: result.room,
        result: { roll: result.roll, replayed: result.replayed },
      });
    }
    if (result.kind === "invalid") {
      return NextResponse.json(
        { error: "잘못된 주사위 요청입니다" },
        { status: 400 },
      );
    }
    if (result.kind === "forbidden") {
      return NextResponse.json(
        { error: "방 참가자만 굴릴 수 있어요" },
        { status: 403 },
      );
    }
    if (result.kind === "missing") return roomMissing();
    if (result.kind === "conflict") return roomConflict(result.room);
    return NextResponse.json(
      { error: "메모리 게임 상태를 처리할 수 없습니다" },
      { status: 500 },
    );
  } catch {
    return NextResponse.json(
      { error: "주사위 결과 저장에 실패했습니다" },
      { status: 500 },
    );
  }
}

if (action === "memory-roll") {
  return handleMemoryRoll(room, userId, body);
}
```

- [ ] **단계 4: 나가기 재시도마다 완료 판정을 적용한다**

참가자를 제거한 뒤 다음 후보를 저장한다.

```ts
const candidate = settleMemoryRollingRoom({
  ...room,
  players,
  hostId: wasHost ? players[0].id : room.hostId,
});
const result = await saveGameRoom(candidate);
```

이미 나간 사용자는 `settleMemoryRollingRoom(room)`을 먼저 호출한다. 같은 객체면 성공 응답을 반환하고, 새 객체면 남은 재시도 횟수 안에서 저장한다. 충돌이면 최신 방에서 사용자 제거 여부와 완료 판정을 모두 다시 계산한다.

- [ ] **단계 5: 전체 경로 시험과 타입 검사를 통과시킨다**

```bash
npx vitest run src/__tests__/game-room-route.test.ts
npx vitest run src/__tests__/memory-room-roll.test.ts src/__tests__/game-room-route.test.ts
npx tsc --noEmit
```

예상: 기존 일반 동작, 참가, 나가기와 새 메모리 시험이 모두 통과한다.

- [ ] **단계 6: 요청 경로 연결을 커밋한다**

```bash
git add 'src/app/api/question-games/rooms/[code]/route.ts' \
  src/__tests__/game-room-route.test.ts
git commit -m "feat: connect memory dice room command"
```

---

### Task 6: 메모리 화면 생성과 주사위 재시도

**파일:**
- 수정: `src/app/(student)/student-question-play/games/RoomMemory.tsx`
- 생성: `src/__tests__/room-memory-actions.test.tsx`

**연결 규약:**
- 입력: Task 1의 `RoomActionHandler`, Task 4의 `resolveMemoryRollRoundId`, Task 5의 `memory-roll` 응답
- 출력: 첫 저장 성공 뒤 생성, 참가자별 주사위 요청, 실패 뒤 다시 시도 가능한 화면

- [ ] **단계 1: 메모리 화면의 실패와 재시도 시험을 작성한다**

인공지능 훅을 시험 대역으로 바꾸고 각 시험 뒤 가짜 시간을 복원한다.

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RoomMemory from "@/app/(student)/student-question-play/games/RoomMemory";
import {
  BUILT_IN_GAMES,
  type GameRoom,
  type RoomActionHandler,
} from "@/lib/question-games-data";

const aiMocks = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock("@/app/(student)/student-question-play/games/useAIPlay", () => ({
  useAIPlay: () => ({ ask: aiMocks.ask, loading: false }),
}));

beforeEach(() => {
  aiMocks.ask.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
```

다음 실제 방과 속성 도우미를 시험 파일에 둔다.

```tsx
function makeMemoryRoom(
  state: Record<string, unknown>,
  players: GameRoom["players"] = [
    { id: "host", name: "방장", isHost: true, joinedAt: 1 },
    { id: "other", name: "학생", isHost: false, joinedAt: 2 },
  ],
): GameRoom {
  return {
    code: "1234",
    gameId: "memory",
    hostId: "host",
    status: "playing",
    players,
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: state,
    version: 1,
    createdAt: 10,
    updatedAt: 10,
  };
}

function makeProps(
  room: GameRoom,
  onAction: RoomActionHandler,
  myId = "host",
) {
  return {
    game: BUILT_IN_GAMES.find((item) => item.id === "memory")!,
    room,
    myId,
    actionLoading: false,
    onAction,
    onLeave: vi.fn(),
  };
}
```

다음 화면 동작을 검증한다.

| 시험 | 동작 | 기대 |
| --- | --- | --- |
| 첫 `generating` 저장 실패 | 난이도 단추 한 번 | `ask` 미호출 |
| 생성 잠금 해제 | 첫 저장 실패 뒤 같은 단추 다시 누름 | `onAction` 두 번 |
| 생성 성공 | 첫 저장 성공, 인공지능 성공 | 두 번째 저장에 `phase: "rolling"`과 고정한 UUID |
| 주사위 명령 | 가짜 시간으로 12회 진행 | `memory-roll`, 1부터 6, 현재 라운드 |
| 주사위 실패 | 명령 `409` | 굴리기 단추 다시 활성 |
| 서버 결과 우선 | 내 `diceRolls`가 있는 방 렌더 | 굴리기 단추 없음 |
| 방장 효과 제거 | 모든 결과가 있는 `rolling` 방 렌더 | 별도 `update-state` 미호출 |
| 예전 방 호환 | `rollRoundId` 없는 방에서 굴림 | `legacy:코드:생성시각` 전송 |

첫 저장 실패 시험의 핵심은 다음과 같다.

```tsx
const room = makeMemoryRoom({
  phase: "setup",
  difficulty: "normal",
  pairs: [],
  qCards: [],
  aCards: [],
  diceRolls: {},
  turnOrder: [],
  currentTurnIdx: 0,
  takenIds: [],
  revealedIds: [],
  scores: {},
});
const onAction = vi.fn<RoomActionHandler>()
  .mockResolvedValueOnce({
    ok: false,
    room,
    status: 409,
    reason: "conflict",
  })
  .mockResolvedValueOnce({
    ok: false,
    room,
    status: 409,
    reason: "conflict",
  });

render(<RoomMemory {...makeProps(room, onAction)} />);
fireEvent.click(screen.getByRole("button", { name: /쉬움/ }));
await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
expect(aiMocks.ask).not.toHaveBeenCalled();

fireEvent.click(screen.getByRole("button", { name: /쉬움/ }));
await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
```

주사위 실패 시험의 핵심은 다음과 같다.

```tsx
vi.useFakeTimers();
const room = makeMemoryRoom({
  phase: "rolling",
  difficulty: "normal",
  pairs: [],
  qCards: [],
  aCards: [],
  diceRolls: {},
  rollRoundId: "round-1",
  turnOrder: [],
  currentTurnIdx: 0,
  takenIds: [],
  revealedIds: [],
  scores: {},
});
const onAction = vi.fn<RoomActionHandler>().mockResolvedValue({
  ok: false,
  room,
  status: 409,
  reason: "conflict",
});

render(<RoomMemory {...makeProps(room, onAction)} />);
fireEvent.click(screen.getByRole("button", { name: /주사위 굴리기/ }));
await act(async () => {
  vi.advanceTimersByTime(12 * 80);
  await Promise.resolve();
});
expect(onAction).toHaveBeenCalledWith("memory-roll", {
  roll: expect.any(Number),
  rollRoundId: "round-1",
});
expect(
  screen.getByRole("button", { name: /주사위 굴리기/ }),
).toBeEnabled();
```

- [ ] **단계 2: 메모리 화면 시험이 현재 흐름에서 실패하는지 확인한다**

```bash
npx vitest run src/__tests__/room-memory-actions.test.tsx
```

예상: 첫 저장 실패 뒤에도 인공지능을 호출하고, 일반 `update-state`를 보내며, 실패 뒤 지역 주사위가 잠겨 실패한다.

- [ ] **단계 3: 카드 생성 흐름의 성공 판정과 라운드 값을 구현한다**

`MemoryState`에 다음 값을 추가한다.

```ts
rollRoundId?: string;
```

`startGame`은 첫 동작이 성공한 경우에만 인공지능을 부르고 잠금은 항상 해제한다.

```ts
async function startGame(difficulty: MemoryDifficulty) {
  if (aiGenRef.current) return;
  aiGenRef.current = true;
  try {
    const generating = await onAction("update-state", {
      patch: { phase: "generating", difficulty },
    });
    if (!generating.ok) return;

    const cfg = MEMORY_DIFFICULTY[difficulty];
    const response = await ask({
      action: "memory:pairs",
      context: { count: String(cfg.pairs) },
    });
    const pairs = response?.text
      ? parseAIPairs(response.text, cfg.pairs) ?? pickFallbackPairs(cfg.pairs)
      : pickFallbackPairs(cfg.pairs);
    const qCards: MemoryCard[] = pairs.map((pair, index) => ({
      id: `q-${index}`,
      pairId: pair.id,
      type: "q",
    }));
    const aCards: MemoryCard[] = pairs.map((pair, index) => ({
      id: `a-${index}`,
      pairId: pair.id,
      type: "a",
    }));

    await onAction("update-state", {
      patch: {
        phase: "rolling",
        rollRoundId: crypto.randomUUID(),
        pairs,
        qCards: shuffle(qCards),
        aCards: shuffle(aCards),
        diceRolls: {},
        turnOrder: [],
        currentTurnIdx: 0,
        takenIds: [],
        revealedIds: [],
        scores: Object.fromEntries(
          generating.room.players.map((player) => [player.id, 0]),
        ),
      },
    });
  } finally {
    aiGenRef.current = false;
  }
}
```

두 번째 동작은 Task 1의 안정된 `sendAction`이 호출 순간 최신 버전을 사용한다. 두 번째 저장 실패 시 전역 방 오류를 표시하고 잠금만 해제하며 일반 상태를 자동 재적용하지 않는다.

- [ ] **단계 4: 참가자별 주사위 명령과 실패 해제를 구현한다**

애니메이션 마지막 콜백은 비동기 저장 함수를 호출하고 결과가 끝날 때까지 지역 적재 상태를 유지한다.

```ts
async function persistRoll(final: number) {
  const roundId = resolveMemoryRollRoundId(room, state.rollRoundId);
  if (!roundId) {
    setRolling(false);
    setDiceLocal(null);
    return;
  }

  const result = await onAction("memory-roll", {
    roll: final,
    rollRoundId: roundId,
  });
  setRolling(false);
  if (!result.ok) setDiceLocal(null);
}
```

기존 타이머 마지막에서는 `setRolling(false)`와 일반 `update-state`를 제거하고 다음처럼 호출한다.

```ts
setDiceLocal(final);
void persistRoll(final);
```

모든 결과를 보고 방장이 `phase: "play"`를 보내던 효과는 완전히 제거한다. 서버 방의 `state.diceRolls[myId]`가 있으면 지역 값과 무관하게 굴리기 단추를 숨긴다.

- [ ] **단계 5: 메모리 화면 시험과 관련 시험을 통과시킨다**

```bash
npx vitest run src/__tests__/room-memory-actions.test.tsx
npx vitest run src/__tests__/memory-room-roll.test.ts \
  src/__tests__/game-room-route.test.ts
npx tsc --noEmit
```

예상: 화면, 도메인, 요청 경로 시험과 타입 검사가 통과한다.

- [ ] **단계 6: 메모리 화면을 커밋한다**

```bash
git add 'src/app/(student)/student-question-play/games/RoomMemory.tsx' \
  src/__tests__/room-memory-actions.test.tsx
git commit -m "fix: make memory dice rolls retryable"
```

---

### Task 7: 전체 검증과 최종 검토

**파일:**
- 검증: Task 1부터 Task 6까지 바뀐 모든 파일
- 무변경 확인: `prisma/schema.prisma`
- 무변경 확인: `prisma/migrations`
- 무변경 확인: `supabase-schema.sql`
- 무변경 확인: `scripts/db-security-policy.mjs`

**연결 규약:**
- 입력: Task 1부터 Task 6까지의 커밋
- 출력: 전체 검사 통과, 검토 완료, 데이터베이스 무변경 근거, 원격 반영

- [ ] **단계 1: 관련 시험을 한 번에 실행한다**

```bash
npx vitest run src/__tests__/use-room.test.tsx \
  src/__tests__/room-action-inputs.test.tsx \
  src/__tests__/memory-room-roll.test.ts \
  src/__tests__/game-room-route.test.ts \
  src/__tests__/room-memory-actions.test.tsx
```

예상: 관련 시험이 모두 통과한다.

- [ ] **단계 2: 정적 검사와 전체 시험을 실행한다**

```bash
npm run lint
npx tsc --noEmit
npm test
```

예상: 린트 오류 없음, 타입 오류 없음, 전체 시험 실패 없음.

- [ ] **단계 3: 실제 배포 빌드 검사를 실행한다**

```bash
npm run build
```

예상: Prisma 생성, 데이터베이스 차이 검사, 스키마 검사, 보안 정책 검사, Next.js 배포 빌드가 모두 통과한다.

- [ ] **단계 4: 데이터베이스 관련 파일이 바뀌지 않았는지 확인한다**

```bash
git diff --exit-code f7c242b -- \
  prisma/schema.prisma prisma/migrations supabase-schema.sql \
  scripts/db-security-policy.mjs
```

예상: 출력 없이 종료 코드 `0`.

- [ ] **단계 5: 작업 트리와 커밋을 최종 검토한다**

```bash
git status --short
git log --oneline f7c242b..HEAD
git diff --check f7c242b..HEAD
```

예상: 의도하지 않은 파일 없음, 작업별 커밋 존재, 공백 오류 없음.

`git status --short`는 출력이 없어야 한다. 구현 기준 뒤에 추가된 다른 작업 커밋은 되돌리거나 고치지 않는다.

- [ ] **단계 6: 기능 검토와 코드 품질 검토를 각각 통과시킨다**

기능 검토자는 설계의 목표, 범위, 오류 계약, 시험 목록과 실제 차이를 비교한다. 코드 품질 검토자는 경합 처리, 참조값 일관성, 메모리 명령 멱등성, 시험의 실제 동작성을 확인한다. 발견된 문제는 지적된 파일만 수정하고 해당 관련 시험부터 다시 실행한 뒤 별도 수정 커밋으로 남긴다.

- [ ] **단계 7: 원격 `main`에 푸시하고 원격 커밋을 확인한다**

```bash
git push origin main
git rev-parse HEAD
git rev-parse origin/main
```

예상: 두 커밋 값이 같다.

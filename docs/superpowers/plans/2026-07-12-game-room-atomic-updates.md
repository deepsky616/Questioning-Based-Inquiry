# 게임 방 동시 갱신 구현 계획

> **작업 에이전트 안내:** 이 계획은 `superpowers:subagent-driven-development`를 권장하며, 필요하면 `superpowers:executing-plans`로 작업별 실행한다. 각 단계는 확인란 순서대로 진행한다.

**목표:** 게임 방의 저장, 참가, 나가기, 마지막 참가자 삭제를 버전 조건으로 묶어 동시 요청이 최신 상태를 덮거나 지우지 못하게 한다.

**구조:** `game-room-store.ts`가 PostgreSQL의 원자적 조건부 갱신과 삭제를 맡고 성공, 충돌, 방 없음 결과를 구분한다. 게임 방 경로는 일반 동작의 충돌을 `409`로 바꾸고, 참가와 나가기는 최신 방을 기준으로 최대 세 번 다시 적용한다. 클라이언트는 나가기 성공을 확인한 뒤에만 방 화면을 닫는다.

**기술 구성:** Next.js 16 경로 처리기, TypeScript, Prisma 5.22, PostgreSQL JSONB, React 19, Vitest, Testing Library

## 전체 제약

- Prisma 스키마와 `game_rooms` 표 구조를 바꾸지 않는다.
- 기존 행을 일괄 변경하지 않는다.
- 권한 경계, 게임 규칙, 폴링 주기, 화면 구성은 바꾸지 않는다.
- 일반 저장과 삭제는 `code`와 이전 `data.version`을 함께 조건으로 사용한다.
- 버전 키 없음과 JSON `null` 보조 경로는 기대 버전이 `1`일 때만 사용한다.
- 보조 SQL은 태그 기반 `$executeRaw`와 매개 변수만 사용하며 `$executeRawUnsafe`를 사용하지 않는다.
- 실제 연결 데이터베이스에 시험 행을 만들거나 바꾸지 않는다.
- 기존 오류 문구와 응답 모양은 꼭 필요한 충돌 및 나가기 계약 외에는 유지한다.

## 파일 구성

- 수정: `src/lib/game-room-store.ts`
  조건부 저장과 삭제, 오래된 방 보조 경로, 코드 겹침 재시도를 맡는다.
- 수정: `src/app/api/question-games/rooms/[code]/route.ts`
  저장 결과를 HTTP 응답으로 바꾸고 참가와 나가기 재시도를 맡는다.
- 수정: `src/app/(student)/student-question-play/games/useRoom.ts`
  나가기 성공 여부와 실패 시 최신 방 반영을 맡는다.
- 수정: `src/app/(student)/student-question-play/[gameId]/page.tsx`
  나가기 성공일 때만 방 선택 화면으로 이동한다.
- 생성: `src/__tests__/game-room-store.test.ts`
  Prisma 조건, 저장 결과, 오래된 방 보조 경로, 코드 생성 재시도를 검증한다.
- 생성: `src/__tests__/game-room-route.test.ts`
  경로 충돌 응답과 참가 및 나가기 재시도를 검증한다.
- 생성: `src/__tests__/use-room.test.tsx`
  클라이언트 나가기 성공과 실패를 검증한다.
- 수정: `src/__tests__/room-sync-policy.test.ts`
  페이지가 나가기 성공 여부를 확인하는 연결 계약만 검증한다.

---

### 작업 1: 저장과 삭제를 버전 조건으로 바꾸기

**파일:**
- 수정: `src/lib/game-room-store.ts`
- 생성: `src/__tests__/game-room-store.test.ts`

**입력 계약:**
- `saveGameRoom(room: GameRoom)`은 읽은 시점의 `room.version`을 기대 버전으로 사용한다.
- `deleteGameRoom(room: Pick<GameRoom, "code" | "version">)`도 같은 기대 버전을 사용한다.

**출력 계약:**
- `GameRoomWriteResult`는 `saved`, `conflict`, `missing`을 구분한다.
- `GameRoomDeleteResult`는 `deleted`, `conflict`, `missing`을 구분한다.
- 충돌 결과에는 다시 읽은 최신 방이 들어간다.

- [ ] **단계 1: 실패하는 저장소 시험을 작성한다**

`src/__tests__/game-room-store.test.ts`를 다음 뼈대로 만들고 저장, 입력 불변, 충돌, 방 없음, 오래된 방 보조 저장, 조건부 삭제를 검증한다.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";

const prismaMock = vi.hoisted(() => ({
  gameRoom: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  $executeRaw: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

import { deleteGameRoom, saveGameRoom } from "@/lib/game-room-store";

function makeRoom(version = 1): GameRoom {
  return {
    code: "1234",
    gameId: "question-chain",
    hostId: "host",
    status: "waiting",
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version,
    createdAt: 1,
    updatedAt: 1,
  };
}

beforeEach(() => {
  prismaMock.gameRoom.findUnique.mockReset();
  prismaMock.gameRoom.updateMany.mockReset();
  prismaMock.gameRoom.deleteMany.mockReset();
  prismaMock.gameRoom.create.mockReset();
  prismaMock.$executeRaw.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveGameRoom", () => {
  it("코드와 이전 버전이 맞으면 새 복사본을 저장한다", async () => {
    const room = makeRoom();
    const before = structuredClone(room);
    prismaMock.gameRoom.updateMany.mockResolvedValue({ count: 1 });

    const result = await saveGameRoom(room);

    expect(result.kind).toBe("saved");
    expect(result.room).toMatchObject({ code: "1234", version: 2 });
    expect(room).toEqual(before);
    expect(prismaMock.gameRoom.updateMany).toHaveBeenCalledWith({
      where: {
        code: "1234",
        data: { path: ["version"], equals: 1 },
      },
      data: {
        data: expect.objectContaining({ code: "1234", version: 2 }),
        updatedAt: expect.any(Date),
      },
    });
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it("숫자 버전 충돌이면 최신 방을 다시 읽는다", async () => {
    const latest = makeRoom(3);
    prismaMock.gameRoom.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.gameRoom.findUnique.mockResolvedValue({ data: latest });

    await expect(saveGameRoom(makeRoom(2))).resolves.toEqual({
      kind: "conflict",
      room: latest,
    });
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it("충돌 뒤 방이 없으면 missing을 반환한다", async () => {
    prismaMock.gameRoom.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.gameRoom.findUnique.mockResolvedValue(null);

    await expect(saveGameRoom(makeRoom(2))).resolves.toEqual({
      kind: "missing",
      room: null,
    });
  });

  it("기대 버전 1의 오래된 방만 안전한 보조 갱신을 쓴다", async () => {
    prismaMock.gameRoom.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.$executeRaw.mockResolvedValue(1);

    const result = await saveGameRoom(makeRoom(1));

    expect(result.kind).toBe("saved");
    const [strings] = prismaMock.$executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = strings.join("?");
    expect(sql).toContain('"game_rooms"');
    expect(sql).toContain('"updated_at" =');
    expect(sql).toContain("-> 'version' IS NULL");
    expect(sql).toContain("= 'null'::jsonb");
  });
});

describe("deleteGameRoom", () => {
  it("코드와 이전 버전이 맞으면 삭제한다", async () => {
    prismaMock.gameRoom.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteGameRoom(makeRoom(2))).resolves.toEqual({
      kind: "deleted",
      room: null,
    });
    expect(prismaMock.gameRoom.deleteMany).toHaveBeenCalledWith({
      where: {
        code: "1234",
        data: { path: ["version"], equals: 2 },
      },
    });
  });

  it("삭제 충돌이면 최신 방을 반환한다", async () => {
    const latest = makeRoom(3);
    prismaMock.gameRoom.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.gameRoom.findUnique.mockResolvedValue({ data: latest });

    await expect(deleteGameRoom(makeRoom(2))).resolves.toEqual({
      kind: "conflict",
      room: latest,
    });
  });

  it("오래된 방 삭제는 안전한 보조 조건을 쓴다", async () => {
    prismaMock.gameRoom.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.$executeRaw.mockResolvedValue(1);

    await expect(deleteGameRoom(makeRoom(1))).resolves.toEqual({
      kind: "deleted",
      room: null,
    });
    const [strings] = prismaMock.$executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = strings.join("?");
    expect(sql).toContain('DELETE FROM "game_rooms"');
    expect(sql).toContain("-> 'version' IS NULL");
    expect(sql).toContain("= 'null'::jsonb");
  });
});
```

- [ ] **단계 2: 새 저장소 시험이 현재 구현에서 실패하는지 확인한다**

```bash
npx vitest run src/__tests__/game-room-store.test.ts
```

기대 결과: `updateMany`, `deleteMany`, 결과 `kind`가 없어 실패한다.

- [ ] **단계 3: 조건부 저장과 삭제의 최소 구현을 작성한다**

`src/lib/game-room-store.ts`에 Prisma 형식과 결과 형식을 추가한다.

```ts
import { Prisma } from "@prisma/client";

export type GameRoomWriteResult =
  | { kind: "saved"; room: GameRoom }
  | { kind: "conflict"; room: GameRoom }
  | { kind: "missing"; room: null };

export type GameRoomDeleteResult =
  | { kind: "deleted"; room: null }
  | { kind: "conflict"; room: GameRoom }
  | { kind: "missing"; room: null };
```

기존 `saveGameRoom`과 `deleteGameRoom`을 다음 구현으로 바꾼다.

```ts
export async function saveGameRoom(
  room: GameRoom,
): Promise<GameRoomWriteResult> {
  const expectedVersion = room.version ?? 1;
  const now = Date.now();
  const nextRoom: GameRoom = {
    ...room,
    version: expectedVersion + 1,
    updatedAt: now,
  };

  const updated = await prisma.gameRoom.updateMany({
    where: {
      code: room.code,
      data: { path: ["version"], equals: expectedVersion },
    },
    data: {
      data: nextRoom as unknown as Prisma.InputJsonValue,
      updatedAt: new Date(now),
    },
  });

  let count = updated.count;
  if (count === 0 && expectedVersion === 1) {
    count = await prisma.$executeRaw`
      UPDATE "game_rooms"
      SET
        "data" = ${JSON.stringify(nextRoom)}::jsonb,
        "updated_at" = ${new Date(now)}
      WHERE "code" = ${room.code}
        AND (
          "data" -> 'version' IS NULL
          OR "data" -> 'version' = 'null'::jsonb
        )
    `;
  }

  if (count === 1) return { kind: "saved", room: nextRoom };
  const current = await loadGameRoom(room.code);
  return current
    ? { kind: "conflict", room: current }
    : { kind: "missing", room: null };
}

export async function deleteGameRoom(
  room: Pick<GameRoom, "code" | "version">,
): Promise<GameRoomDeleteResult> {
  const expectedVersion = room.version ?? 1;
  const deleted = await prisma.gameRoom.deleteMany({
    where: {
      code: room.code,
      data: { path: ["version"], equals: expectedVersion },
    },
  });

  let count = deleted.count;
  if (count === 0 && expectedVersion === 1) {
    count = await prisma.$executeRaw`
      DELETE FROM "game_rooms"
      WHERE "code" = ${room.code}
        AND (
          "data" -> 'version' IS NULL
          OR "data" -> 'version' = 'null'::jsonb
        )
    `;
  }

  if (count === 1) return { kind: "deleted", room: null };
  const current = await loadGameRoom(room.code);
  return current
    ? { kind: "conflict", room: current }
    : { kind: "missing", room: null };
}
```

- [ ] **단계 4: 저장소 시험과 형 검사를 통과시킨다**

```bash
npx vitest run src/__tests__/game-room-store.test.ts
npx tsc --noEmit
```

기대 결과: 새 저장소 시험이 모두 통과하고 형 오류가 없다.

- [ ] **단계 5: 저장과 삭제 변경을 커밋한다**

```bash
git add src/lib/game-room-store.ts src/__tests__/game-room-store.test.ts
git commit -m "fix: make game room writes atomic"
```

---

### 작업 2: 방 코드 겹침을 생성 재시도로 처리하기

**파일:**
- 수정: `src/lib/game-room-store.ts`
- 수정: `src/__tests__/game-room-store.test.ts`

**입력 계약:** `createGameRoom`은 최대 열두 개의 네 자리 후보를 만든다.

**출력 계약:** 생성이 성공하면 바로 방을 반환하고, `P2002`이면 다음 후보를 시도하며, 다른 오류는 다시 던진다.

- [ ] **단계 1: 코드 겹침과 일반 오류 시험을 먼저 추가한다**

시험 파일의 가져오기에 `Prisma`와 `createGameRoom`을 추가하고 다음 시험을 붙인다.

```ts
import { Prisma } from "@prisma/client";
import {
  createGameRoom,
  deleteGameRoom,
  saveGameRoom,
} from "@/lib/game-room-store";

describe("createGameRoom", () => {
  it("P2002 코드 겹침이면 다음 후보로 생성한다", async () => {
    const collision = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "5",
    });
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.111);
    prismaMock.gameRoom.create
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce({});

    const room = await createGameRoom({
      gameId: "question-chain",
      hostId: "host",
      hostName: "방장",
    });

    expect(room?.code).toBe("1999");
    expect(prismaMock.gameRoom.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.gameRoom.findUnique).not.toHaveBeenCalled();
  });

  it("P2002가 아닌 생성 오류는 숨기지 않는다", async () => {
    const error = new Error("database unavailable");
    prismaMock.gameRoom.create.mockRejectedValue(error);

    await expect(createGameRoom({
      gameId: "question-chain",
      hostId: "host",
      hostName: "방장",
    })).rejects.toBe(error);
  });
});
```

- [ ] **단계 2: 새 생성 시험이 현재 조회 뒤 생성 흐름에서 실패하는지 확인한다**

```bash
npx vitest run src/__tests__/game-room-store.test.ts
```

기대 결과: 첫 `P2002`가 다음 후보로 이어지지 않아 실패한다.

- [ ] **단계 3: 후보마다 바로 생성하도록 바꾼다**

기존 `createGameRoom`을 다음 구현으로 바꾼다.

```ts
export async function createGameRoom({
  gameId,
  hostId,
  hostName,
}: {
  gameId: string;
  hostId: string;
  hostName: string;
}): Promise<GameRoom | null> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = gen4();
    const now = Date.now();
    const host: RoomPlayer = {
      id: hostId,
      name: hostName,
      isHost: true,
      joinedAt: now,
    };
    const room: GameRoom = {
      code,
      gameId,
      hostId,
      status: "waiting",
      players: [host],
      topic: "",
      chain: [],
      turnIndex: 0,
      gameState: {},
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await prisma.gameRoom.create({
        data: {
          code,
          data: room as unknown as Prisma.InputJsonValue,
        },
      });
      return room;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  return null;
}
```

- [ ] **단계 4: 저장소 전체 시험을 다시 통과시킨다**

```bash
npx vitest run src/__tests__/game-room-store.test.ts
npx tsc --noEmit
```

기대 결과: 저장, 삭제, 코드 생성 시험이 모두 통과한다.

- [ ] **단계 5: 코드 생성 변경을 커밋한다**

```bash
git add src/lib/game-room-store.ts src/__tests__/game-room-store.test.ts
git commit -m "fix: retry game room code collisions"
```

---

### 작업 3: 경로에서 충돌과 참가자 재시도를 처리하기

**파일:**
- 수정: `src/app/api/question-games/rooms/[code]/route.ts`
- 생성: `src/__tests__/game-room-route.test.ts`

**사용 인터페이스:**
- `saveGameRoom(room) -> GameRoomWriteResult`
- `deleteGameRoom(room) -> GameRoomDeleteResult`

**출력 계약:**
- 일반 저장 충돌은 최신 `room`과 `409`를 반환한다.
- 저장 중 방이 사라지면 `404`를 반환한다.
- 참가와 나가기는 최신 방에 전체 세 번까지 적용한다.
- 이미 삭제된 방의 나가기는 `{ room: null, deleted: true }`로 성공한다.

- [ ] **단계 1: 경로 실패 시험을 작성한다**

`src/__tests__/game-room-route.test.ts`를 만들고 실제 `PATCH`를 직접 호출한다.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  loadGameRoom: vi.fn(),
  saveGameRoom: vi.fn(),
  deleteGameRoom: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/game-room-store", () => ({
  loadGameRoom: mocks.loadGameRoom,
  saveGameRoom: mocks.saveGameRoom,
  deleteGameRoom: mocks.deleteGameRoom,
  isStaleRoomAction: (room: GameRoom, expected: unknown) =>
    typeof expected === "number" && expected !== room.version,
}));

import { PATCH } from "@/app/api/question-games/rooms/[code]/route";

function makeRoom(overrides: Partial<GameRoom> = {}): GameRoom {
  return {
    code: "1234",
    gameId: "question-chain",
    hostId: "user-1",
    status: "waiting",
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
    ],
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function patch(body: Record<string, unknown>) {
  return PATCH(
    new Request("http://localhost/api/question-games/rooms/1234", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ code: "1234" }) },
  );
}

beforeEach(() => {
  mocks.auth.mockReset().mockResolvedValue({
    user: { id: "user-1", name: "학생" },
  });
  mocks.loadGameRoom.mockReset();
  mocks.saveGameRoom.mockReset();
  mocks.deleteGameRoom.mockReset();
});

describe("일반 게임 동작 충돌", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["start", {}],
    ["update-state", { patch: { score: 1 } }],
    ["set-state", { state: { score: 1 } }],
    ["next-turn", {}],
    ["set-topic", { topic: "물" }],
    ["add-question", { question: "왜 그럴까?" }],
    ["end", {}],
    ["restart", {}],
  ];

  it.each(cases)("%s 저장 충돌은 최신 방과 409를 반환한다", async (
    action,
    extra,
  ) => {
    const current = makeRoom();
    const latest = makeRoom({ version: 2, topic: "최신" });
    mocks.loadGameRoom.mockResolvedValue(current);
    mocks.saveGameRoom.mockResolvedValue({ kind: "conflict", room: latest });

    const response = await patch({
      action,
      expectedVersion: 1,
      ...extra,
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ room: latest });
  });

  it("저장 전에 방이 사라지면 404를 반환한다", async () => {
    mocks.loadGameRoom.mockResolvedValue(makeRoom());
    mocks.saveGameRoom.mockResolvedValue({ kind: "missing", room: null });

    const response = await patch({
      action: "set-topic",
      expectedVersion: 1,
      topic: "물",
    });

    expect(response.status).toBe(404);
  });
});

it("동시 참가 충돌 뒤 최신 참가자 목록에 다시 추가한다", async () => {
  const current = makeRoom({
    hostId: "host",
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
  });
  const latest = makeRoom({
    hostId: "host",
    version: 2,
    players: [
      { id: "host", name: "방장", isHost: true, joinedAt: 1 },
      { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    ],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom
    .mockResolvedValueOnce({ kind: "conflict", room: latest })
    .mockImplementationOnce(async (candidate: GameRoom) => ({
      kind: "saved",
      room: { ...candidate, version: 3 },
    }));

  const response = await patch({ action: "join" });
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.room.players.map((player: { id: string }) => player.id))
    .toEqual(["host", "other", "user-1"]);
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(2);
});

it("이미 참가한 사용자는 저장하지 않고 성공한다", async () => {
  mocks.loadGameRoom.mockResolvedValue(makeRoom({ status: "playing" }));

  const response = await patch({ action: "join" });

  expect(response.status).toBe(200);
  expect(mocks.saveGameRoom).not.toHaveBeenCalled();
});

it("참가 저장이 세 번 충돌하면 최신 방과 409를 반환한다", async () => {
  const current = makeRoom({
    hostId: "host",
    players: [{ id: "host", name: "방장", isHost: true, joinedAt: 1 }],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
    kind: "conflict",
    room: { ...candidate, players: current.players },
  }));

  const response = await patch({ action: "join" });

  expect(response.status).toBe(409);
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(3);
});

it("마지막 참가자 삭제 충돌 뒤 최신 방에서 나가기를 다시 계산한다", async () => {
  const current = makeRoom();
  const latest = makeRoom({
    version: 2,
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    ],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.deleteGameRoom.mockResolvedValue({
    kind: "conflict",
    room: latest,
  });
  mocks.saveGameRoom.mockImplementation(async (candidate: GameRoom) => ({
    kind: "saved",
    room: { ...candidate, version: 3 },
  }));

  const response = await patch({ action: "leave" });
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.room.hostId).toBe("other");
  expect(body.room.players).toEqual([
    expect.objectContaining({ id: "other", isHost: true }),
  ]);
});

it("이미 나간 사용자는 저장하지 않고 성공한다", async () => {
  mocks.loadGameRoom.mockResolvedValue(makeRoom({
    hostId: "other",
    players: [
      { id: "other", name: "다른 학생", isHost: true, joinedAt: 2 },
    ],
  }));

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(200);
  expect(mocks.saveGameRoom).not.toHaveBeenCalled();
  expect(mocks.deleteGameRoom).not.toHaveBeenCalled();
});

it("이미 삭제된 방의 나가기는 성공한다", async () => {
  mocks.loadGameRoom.mockResolvedValue(null);

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    room: null,
    deleted: true,
  });
});

it("나가기 저장이 세 번 충돌하면 최신 방과 409를 반환한다", async () => {
  const current = makeRoom({
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
      { id: "other", name: "다른 학생", isHost: false, joinedAt: 2 },
    ],
  });
  mocks.loadGameRoom.mockResolvedValue(current);
  mocks.saveGameRoom.mockImplementation(async () => ({
    kind: "conflict",
    room: current,
  }));

  const response = await patch({ action: "leave" });

  expect(response.status).toBe(409);
  expect(mocks.saveGameRoom).toHaveBeenCalledTimes(3);
});
```

- [ ] **단계 2: 경로 시험이 현재 무조건 저장 계약에서 실패하는지 확인한다**

```bash
npx vitest run src/__tests__/game-room-route.test.ts
```

기대 결과: 저장 결과를 해석하지 않고, 나가기 삭제가 새 함수 계약을 따르지 않아 실패한다.

- [ ] **단계 3: 공통 응답과 저장 결과 변환을 추가한다**

경로 파일의 형식 가져오기에 `GameRoom`을 추가하고 다음 도우미를 `PATCH` 위에 둔다.

```ts
const ROOM_CONFLICT_MESSAGE =
  "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.";
const MEMBERSHIP_WRITE_ATTEMPTS = 3;

function roomConflict(room: GameRoom) {
  return NextResponse.json(
    { error: ROOM_CONFLICT_MESSAGE, room },
    { status: 409 },
  );
}

function roomMissing() {
  return NextResponse.json(
    { error: "방을 찾을 수 없습니다" },
    { status: 404 },
  );
}

function roomDeleted() {
  return NextResponse.json({ room: null, deleted: true });
}

type PersistResult =
  | { ok: true; room: GameRoom }
  | { ok: false; response: NextResponse };

async function persistRoom(room: GameRoom): Promise<PersistResult> {
  const result = await saveGameRoom(room);
  if (result.kind === "saved") return { ok: true, room: result.room };
  if (result.kind === "conflict") {
    return { ok: false, response: roomConflict(result.room) };
  }
  return { ok: false, response: roomMissing() };
}
```

- [ ] **단계 4: 참가와 나가기 재시도 도우미를 추가한다**

`PATCH` 위에 다음 함수를 추가한다.

```ts
async function joinRoom(
  initialRoom: GameRoom,
  userId: string,
  userName: string,
) {
  let room = initialRoom;
  const player: RoomPlayer = {
    id: userId,
    name: userName,
    isHost: false,
    joinedAt: Date.now(),
  };

  for (let attempt = 0; attempt < MEMBERSHIP_WRITE_ATTEMPTS; attempt++) {
    if (room.players.some((item) => item.id === userId)) {
      return NextResponse.json({ room });
    }
    if (room.status !== "waiting") {
      return NextResponse.json(
        { error: "이미 시작된 방이에요" },
        { status: 400 },
      );
    }
    if (room.players.length >= 8) {
      return NextResponse.json(
        { error: "방이 가득 찼어요 (최대 8명)" },
        { status: 400 },
      );
    }

    const result = await saveGameRoom({
      ...room,
      players: [...room.players, player],
    });
    if (result.kind === "saved") {
      return NextResponse.json({ room: result.room });
    }
    if (result.kind === "missing") return roomMissing();
    room = result.room;
  }

  return roomConflict(room);
}

async function leaveRoom(initialRoom: GameRoom, userId: string) {
  let room = initialRoom;

  for (let attempt = 0; attempt < MEMBERSHIP_WRITE_ATTEMPTS; attempt++) {
    if (!room.players.some((item) => item.id === userId)) {
      return NextResponse.json({ room });
    }

    const wasHost = room.hostId === userId;
    const players = room.players
      .filter((item) => item.id !== userId)
      .map((item, index) =>
        wasHost ? { ...item, isHost: index === 0 } : item
      );

    if (players.length === 0) {
      const result = await deleteGameRoom(room);
      if (result.kind === "deleted" || result.kind === "missing") {
        return roomDeleted();
      }
      room = result.room;
      continue;
    }

    const result = await saveGameRoom({
      ...room,
      players,
      hostId: wasHost ? players[0].id : room.hostId,
    });
    if (result.kind === "saved") {
      return NextResponse.json({ room: result.room });
    }
    if (result.kind === "missing") return roomDeleted();
    room = result.room;
  }

  return roomConflict(room);
}
```

- [ ] **단계 5: 요청 본문을 방 조회보다 먼저 읽고 새 흐름을 연결한다**

인증과 사용자 정보 확인 다음 부분을 아래 순서로 바꾼다.

```ts
const body = await req.json().catch(() => ({}));
const action = body.action as string;
const expectedVersion = body.expectedVersion;

let room = await loadGameRoom(code);
if (!room) {
  return action === "leave" ? roomDeleted() : roomMissing();
}

if (action === "join") return joinRoom(room, userId, userName);
if (action === "leave") return leaveRoom(room, userId);
```

기존 `switch`의 `join`과 `leave` 분기는 제거한다. `start`, `update-state`, `set-state`, `next-turn`, `set-topic`, `add-question`, `end`, `restart`의 각 `await saveGameRoom(room);`을 모두 다음 블록으로 바꾼다.

```ts
const persisted = await persistRoom(room);
if (!persisted.ok) return persisted.response;
room = persisted.room;
```

- [ ] **단계 6: 경로 시험과 기존 동기화 정책 시험을 통과시킨다**

```bash
npx vitest run src/__tests__/game-room-route.test.ts src/__tests__/room-sync-policy.test.ts
npx tsc --noEmit
```

기대 결과: 모든 일반 동작 충돌, 참가와 나가기 재시도, 방 없음 응답이 통과한다.

- [ ] **단계 7: 경로 변경을 커밋한다**

```bash
git add 'src/app/api/question-games/rooms/[code]/route.ts' src/__tests__/game-room-route.test.ts
git commit -m "fix: resolve concurrent room actions"
```

---

### 작업 4: 나가기 성공을 확인한 뒤 화면 닫기

**파일:**
- 수정: `src/app/(student)/student-question-play/games/useRoom.ts`
- 수정: `src/app/(student)/student-question-play/[gameId]/page.tsx`
- 생성: `src/__tests__/use-room.test.tsx`
- 수정: `src/__tests__/room-sync-policy.test.ts`

**출력 계약:** `leaveRoom(): Promise<boolean>`은 성공일 때만 방 상태를 비우고 `true`를 반환한다. 실패 시 `false`를 반환하며 `409`의 최신 방을 반영한다.

- [ ] **단계 1: 클라이언트 실패 시험을 먼저 작성한다**

`src/__tests__/use-room.test.tsx`를 다음 내용으로 만든다.

```tsx
// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRoom } from "@/lib/question-games-data";
import { useRoom } from "@/app/(student)/student-question-play/games/useRoom";

function makeRoom(version = 1): GameRoom {
  return {
    code: "1234",
    gameId: "question-chain",
    hostId: "user-1",
    status: "waiting",
    players: [
      { id: "user-1", name: "학생", isHost: true, joinedAt: 1 },
    ],
    topic: "",
    chain: [],
    turnIndex: 0,
    gameState: {},
    version,
    createdAt: 1,
    updatedAt: 1,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("useRoom leaveRoom", () => {
  let leaveResponse: Response | Error;
  let fetchMock: ReturnType<typeof vi.fn>;
  let pollRoom: GameRoom;

  beforeEach(() => {
    pollRoom = makeRoom();
    leaveResponse = jsonResponse({ room: null, deleted: true });
    fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (body?.action === "join") {
        return jsonResponse({ room: makeRoom() });
      }
      if (body?.action === "leave") {
        if (leaveResponse instanceof Error) throw leaveResponse;
        return leaveResponse;
      }
      return jsonResponse({ room: pollRoom });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("성공 응답 뒤에만 방을 비운다", async () => {
    const { result, unmount } = renderHook(() => useRoom());
    await act(async () => {
      await result.current.joinRoom("1234");
    });
    await waitFor(() => expect(result.current.room?.code).toBe("1234"));

    let left = false;
    await act(async () => {
      left = await result.current.leaveRoom();
    });

    expect(left).toBe(true);
    expect(result.current.room).toBeNull();
    unmount();
  });

  it("409이면 최신 방을 반영하고 방을 유지한다", async () => {
    const latest = makeRoom(2);
    pollRoom = latest;
    leaveResponse = jsonResponse({
      error: "방 상태가 바뀌었어요. 화면을 최신 상태로 맞췄습니다.",
      room: latest,
    }, 409);
    const { result, unmount } = renderHook(() => useRoom());
    await act(async () => {
      await result.current.joinRoom("1234");
    });

    let left = true;
    await act(async () => {
      left = await result.current.leaveRoom();
    });

    expect(left).toBe(false);
    expect(result.current.room).toEqual(latest);
    expect(result.current.error).toContain("방 상태가 바뀌었어요");
    unmount();
  });

  it("연결 오류면 기존 방을 유지한다", async () => {
    leaveResponse = new Error("offline");
    const { result, unmount } = renderHook(() => useRoom());
    await act(async () => {
      await result.current.joinRoom("1234");
    });

    let left = true;
    await act(async () => {
      left = await result.current.leaveRoom();
    });

    expect(left).toBe(false);
    expect(result.current.room?.code).toBe("1234");
    expect(result.current.error).toBe("네트워크 오류");
    unmount();
  });
});
```

`src/__tests__/room-sync-policy.test.ts`에 페이지 파일 상수와 연결 시험을 추가한다.

```ts
const roomPagePath =
  "src/app/(student)/student-question-play/[gameId]/page.tsx";

it("나가기 성공일 때만 방 선택 화면으로 이동한다", () => {
  const page = readFileSync(roomPagePath, "utf8");
  expect(page).toContain("if (!(await leaveRoom())) return;");
});
```

- [ ] **단계 2: 현재 나가기 구현에서 실패하는지 확인한다**

```bash
npx vitest run src/__tests__/use-room.test.tsx src/__tests__/room-sync-policy.test.ts
```

기대 결과: `leaveRoom`이 값을 반환하지 않고 실패 응답 뒤에도 방을 비워 실패한다.

- [ ] **단계 3: 훅의 나가기 반환 계약을 구현한다**

`UseRoomResult`의 형식을 바꾼다.

```ts
leaveRoom: () => Promise<boolean>;
```

기존 `leaveRoom` 콜백을 다음 구현으로 바꾼다.

```ts
const leaveRoom = useCallback(async (): Promise<boolean> => {
  if (!activeCode) return true;
  try {
    const res = await fetch(`/api/question-games/rooms/${activeCode}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "leave" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 409 && data.room) setRoom(data.room);
      setError(data.error ?? "나가기 실패");
      return false;
    }
    setActiveCode(null);
    setRoom(null);
    setError(null);
    return true;
  } catch {
    setError("네트워크 오류");
    return false;
  }
}, [activeCode]);
```

- [ ] **단계 4: 페이지가 성공일 때만 화면을 바꾸게 한다**

`handleLeaveRoom`을 다음처럼 바꾼다.

```ts
async function handleLeaveRoom() {
  if (!(await leaveRoom())) return;
  setRoomStep("choice");
  setJoinCode("");
}
```

- [ ] **단계 5: 클라이언트 시험과 형 검사를 통과시킨다**

```bash
npx vitest run src/__tests__/use-room.test.tsx src/__tests__/room-sync-policy.test.ts
npx tsc --noEmit
```

기대 결과: 성공, `409`, 연결 오류 흐름과 페이지 연결 계약이 모두 통과한다.

- [ ] **단계 6: 클라이언트 변경을 커밋한다**

```bash
git add 'src/app/(student)/student-question-play/games/useRoom.ts' 'src/app/(student)/student-question-play/[gameId]/page.tsx' src/__tests__/use-room.test.tsx src/__tests__/room-sync-policy.test.ts
git commit -m "fix: preserve room state when leave fails"
```

---

### 작업 5: 전체 검증, 최종 검토, 푸시

**파일:**
- 검토: 이번 구현에서 바뀐 모든 파일
- 변경 금지 확인: `prisma/schema.prisma`, `supabase-schema.sql`

- [ ] **단계 1: 새 시험 묶음을 함께 실행한다**

```bash
npx vitest run src/__tests__/game-room-store.test.ts src/__tests__/game-room-route.test.ts src/__tests__/use-room.test.tsx src/__tests__/room-sync-policy.test.ts
```

기대 결과: 모든 새 시험과 기존 동기화 정책 시험이 통과한다.

- [ ] **단계 2: 전체 정적 검사와 전체 시험을 실행한다**

```bash
npm run lint
npx tsc --noEmit
npm test
```

기대 결과: 오류 없이 모든 검사가 통과한다.

- [ ] **단계 3: 운영 빌드를 실행한다**

```bash
npm run build
```

기대 결과: Prisma 구조 검사와 Next.js 운영 빌드가 성공한다.

- [ ] **단계 4: 데이터베이스 관련 파일이 바뀌지 않았는지 확인한다**

```bash
git diff --exit-code 7f85180 -- prisma/schema.prisma supabase-schema.sql
git status --short
```

기대 결과: 데이터베이스 구조 파일 차이가 없고, 작업 트리가 깨끗하다.

- [ ] **단계 5: 구현 차이를 별도 검토한다**

검토자는 `7f85180..HEAD` 차이에서 다음을 확인한다.

- 모든 저장과 마지막 참가자 삭제가 이전 버전 조건을 사용한다.
- 보조 SQL은 기대 버전 `1`에서만 실행되고 값 연결을 하지 않는다.
- 참가와 나가기 재시도는 세 번을 넘지 않는다.
- 충돌 응답에는 다시 읽은 최신 방이 들어간다.
- 나가기 실패는 클라이언트 방 상태를 지우지 않는다.
- `P2002` 외 오류가 코드 겹침으로 숨겨지지 않는다.

- [ ] **단계 6: 검토 수정이 있으면 좁은 시험 뒤 별도 커밋한다**

수정이 있으면 관련 좁은 시험과 `npx tsc --noEmit`을 다시 실행한 뒤 다음 명령으로 추적 파일만 커밋한다.

```bash
git add -u
git commit -m "fix: address atomic room review"
```

수정이 없으면 이 단계는 건너뛴다.

- [ ] **단계 7: 커밋과 원격 상태를 확인하고 푸시한다**

```bash
git log --oneline --decorate -8
git status --short --branch
git push origin main
```

기대 결과: 설계, 계획, 구현 커밋이 원격 `main`에 올라가고 로컬과 `origin/main`이 같은 커밋을 가리킨다.

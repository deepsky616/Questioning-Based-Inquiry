# 게임 방 수명별 포인트 지급 구현 계획

> **에이전트 작업 필수 절차:** `superpowers:subagent-driven-development`를 사용해 작업별로 구현하고 검토한다. 모든 동작 변경은 실패 시험을 먼저 확인한다.

**목표:** 같은 네 자리 코드가 다시 쓰여도 새 게임 방이 이전 방의 포인트 지급 기록과 섞이지 않게 하고, 지급과 결과 공유 실패를 각각 안전하게 다시 시도할 수 있게 한다.

**구조:** 방 JSON의 `createdAt`을 수명 식별값으로 사용하고 새 방에는 `pointAwardKeyVersion: 1`을 기록한다. 포인트 기록은 `room:<code>:<createdAt>` 내부 키를 사용하며 PostgreSQL 거래 잠금과 잠긴 방 행 재검증 뒤 한 번만 쓴다. 화면은 지급 결과와 방 공유 상태를 분리하고 요청 시작 방 수명을 모든 공유 동작에 전달한다.

**기술 구성:** Next.js 15, React 19, TypeScript, Prisma 5.22, PostgreSQL, Vitest, Testing Library

## 전체 제약

- 학교, 학급, 교사, 학생 사이의 권한 경계는 바꾸지 않는다.
- 포인트 정책과 지급 수치는 바꾸지 않는다.
- Prisma 스키마와 마이그레이션을 바꾸지 않는다.
- 기존 `PointLog` 행과 사용자 포인트 합계를 일괄 수정하지 않는다.
- 연습 문제 포인트의 중복 방지 키는 바꾸지 않는다.
- `roomCreatedAt`이 없는 이전 화면 요청은 `409`로 거절한다.
- 새 방만 `pointAwardKeyVersion: 1`을 가지며 표지 없는 기존 방은 최선 노력 호환만 제공한다.
- 실제 연결 데이터베이스에는 시험 자료를 만들지 않는다.

---

### 작업 1: 방 JSON 정규화와 새 지급 키 표식

**파일:**
- 수정: `src/lib/question-games-data.ts`
- 수정: `src/lib/game-room-store.ts`
- 시험: `src/__tests__/game-room-store.test.ts`

**연결 규약:**
- 제공: `parseGameRoom(value: unknown): GameRoom | null`
- 제공: `GameRoom.pointAwardKeyVersion?: 1`
- 사용: 포인트 지급 거래 안의 잠긴 JSON 행 판별

- [ ] **1단계: 실패 시험 작성**

`game-room-store.test.ts`에 다음 세 동작을 각각 고정한다.

```ts
it("새 방은 포인트 지급 키 버전 1을 저장한다", async () => {
  prismaMock.gameRoom.create.mockResolvedValue({});
  const room = await createGameRoom({
    gameId: "question-chain",
    hostId: "host",
    hostName: "방장",
  });
  expect(room?.pointAwardKeyVersion).toBe(1);
  expect(prismaMock.gameRoom.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      data: expect.objectContaining({ pointAwardKeyVersion: 1 }),
    }),
  });
});

it("이전 방의 빈 버전은 1로 보정한 뒤 판별한다", async () => {
  prismaMock.gameRoom.findUnique.mockResolvedValue({
    data: { ...makeRoom(), version: null },
  });
  await expect(loadGameRoom("1234")).resolves.toMatchObject({ version: 1 });
});

it("알 수 없는 지급 키 버전은 이전 방으로 낮추지 않는다", async () => {
  prismaMock.gameRoom.findUnique.mockResolvedValue({
    data: { ...makeRoom(), pointAwardKeyVersion: 2 },
  });
  await expect(loadGameRoom("1234")).resolves.toBeNull();
});
```

- [ ] **2단계: 실패 확인**

실행: `npm test -- --run src/__tests__/game-room-store.test.ts`

기대: 새 속성과 `loadGameRoom` 판별 동작이 없어 새 시험이 실패한다.

- [ ] **3단계: 최소 구현**

`question-games-data.ts`의 `GameRoom`과 판별기에 아래 계약을 넣는다.

```ts
export interface GameRoom {
  // 기존 필드 유지
  pointAwardKeyVersion?: 1;
}

export function parseGameRoom(value: unknown): GameRoom | null {
  if (!isRecord(value)) return null;
  const normalized = value.version == null ? { ...value, version: 1 } : value;
  return isGameRoom(normalized) ? normalized : null;
}
```

`isGameRoom`은 `pointAwardKeyVersion`이 없거나 정확히 `1`일 때만 참이어야 한다. `loadGameRoom`은 형 변환 대신 `parseGameRoom(rec.data)`를 반환하고, `createGameRoom`은 새 객체에 `pointAwardKeyVersion: 1`을 넣는다.

- [ ] **4단계: 통과 확인**

실행: `npm test -- --run src/__tests__/game-room-store.test.ts src/__tests__/use-room.test.tsx`

기대: 두 시험 파일이 모두 통과한다.

- [ ] **5단계: 커밋**

```bash
git add src/lib/question-games-data.ts src/lib/game-room-store.ts src/__tests__/game-room-store.test.ts
git commit -m "fix(points): mark game room award lifetimes"
```

### 작업 2: 수명별 기록 조회와 결과 요약 복원

**파일:**
- 수정: `src/lib/point-award-service.ts`
- 시험: `src/__tests__/points-award-route.test.ts`

**연결 규약:**
- 입력: `roomCreatedAt: number`
- 내부 키: `room:${roomCode}:${roomCreatedAt}`
- 결과 표지: `{ type: "game-room-award-result", version: 1 }`

- [ ] **1단계: 실패 시험 작성**

`points-award-route.test.ts`의 요청 본문에 `roomCreatedAt: 100`을 넣고 다음을 고정한다.

```ts
it("수명값이 없는 이전 요청은 409이고 쓰지 않는다", async () => {
  const { roomCreatedAt: _removed, ...legacyBody } = BODY;
  const res = await POST(awardReq(legacyBody));
  expect(res.status).toBe(409);
  expect(mGenerateJson).not.toHaveBeenCalled();
  expect(mTx).not.toHaveBeenCalled();
});

it("표지 방은 예전 표시 코드 기록을 무시하고 내부 키를 쓴다", async () => {
  mLoadGameRoom.mockResolvedValue(makeRoom({ pointAwardKeyVersion: 1 }));
  const res = await POST(awardReq(BODY));
  expect(res.status).toBe(200);
  expect(mPointLogFindMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { gameId: "dice", roomCode: "room:1234:100" },
  }));
});

it("표지 없는 방은 생성 뒤 예전 표시 코드 기록도 확인한다", async () => {
  mLoadGameRoom.mockResolvedValue(makeRoom());
  await POST(awardReq(BODY));
  expect(mPointLogFindMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      gameId: "dice",
      OR: expect.arrayContaining([
        { roomCode: "room:1234:100" },
        { roomCode: "1234", createdAt: { gte: new Date(100) } },
      ]),
    }),
  }));
});
```

저장된 여러 기록 중 생성 순서와 관계없이 아래 표지 JSON이 있는 행에서 `bestQuestion`과 `summary`를 복원하는 시험도 추가한다.

```ts
const snapshot = JSON.stringify({
  type: "game-room-award-result",
  version: 1,
  bestQuestion: { studentId: "s1", question: "왜?", reason: "좋은 질문" },
  summary: "함께 잘 탐구했습니다.",
});
```

- [ ] **2단계: 실패 확인**

실행: `npm test -- --run src/__tests__/points-award-route.test.ts`

기대: `roomCreatedAt`, 내부 키, 이전 방 호환, 결과 복원 동작이 없어 실패한다.

- [ ] **3단계: 최소 구현**

요청과 결과 형식을 다음처럼 확장한다.

```ts
interface AwardRequest {
  gameId: string;
  roomCode: string;
  roomCreatedAt: number;
  topic?: string;
  contributions: StudentContribution[];
}

const AWARD_RESULT_TYPE = "game-room-award-result";
const AWARD_RESULT_VERSION = 1;

function buildRoomAwardKey(roomCode: string, roomCreatedAt: number) {
  return `room:${roomCode}:${roomCreatedAt}`;
}
```

값이 없으면 `PointAwardError(..., 409)`, 유한한 음이 아닌 정수가 아니면 `400`을 던진다. 현재 방의 코드, 게임, 생성 시각이 맞는지 확인한다. 표지 방은 내부 키만, 이전 방은 내부 키와 방 생성 뒤의 예전 표시 코드 기록을 조회한다. 첫 새 기록의 `aiAnalysis`에 종류와 버전이 있는 JSON을 저장하고, 기존 기록 응답은 모든 행을 훑어 엄격히 맞는 JSON만 복원한다.

- [ ] **4단계: 통과 확인**

실행: `npm test -- --run src/__tests__/points-award-route.test.ts`

기대: 수명별 조회와 결과 복원 시험이 통과한다.

- [ ] **5단계: 커밋**

```bash
git add src/lib/point-award-service.ts src/__tests__/points-award-route.test.ts
git commit -m "fix(points): scope awards to room lifetimes"
```

### 작업 3: 방 단위 거래 잠금과 쓰기 직전 재검증

**파일:**
- 수정: `src/lib/point-award-service.ts`
- 시험: `src/__tests__/points-award-route.test.ts`

**연결 규약:**
- 잠금 문자열: `${gameId}:${internalRoomAwardKey}`
- 잠금 순서: advisory transaction lock, `game_rooms FOR SHARE`, 기존 기록 재조회, 기록과 합계 쓰기

- [ ] **1단계: 실패 시험 작성**

다음 경합을 시험 대역의 콜백형 거래로 고정한다.

```ts
it("첫 확인 뒤 방 수명이 바뀌면 409이고 쓰지 않는다", async () => {
  mLoadGameRoom.mockResolvedValue(makeRoom({ createdAt: 100 }));
  txQueryRaw
    .mockResolvedValueOnce([{ locked: true }])
    .mockResolvedValueOnce([{ data: makeRoom({ createdAt: 200 }) }]);
  const res = await POST(awardReq(BODY));
  expect(res.status).toBe(409);
  expect(txPointLogCreate).not.toHaveBeenCalled();
  expect(txUserUpdate).not.toHaveBeenCalled();
});

it("잠금 뒤 기존 지급이 생기면 학생 목록이 달라도 새로 쓰지 않는다", async () => {
  mPointLogFindMany.mockResolvedValue([]);
  txPointLogFindMany.mockResolvedValue([{ id: "existing", points: 5 }]);
  const data = await (await POST(awardReq(BODY))).json();
  expect(data.alreadyAwarded).toBe(true);
  expect(txPointLogCreate).not.toHaveBeenCalled();
});

it("거래 안 수명 충돌은 500으로 바꾸지 않는다", async () => {
  mTx.mockRejectedValue(new PointAwardError("방이 바뀌었습니다", 409));
  expect((await POST(awardReq(BODY))).status).toBe(409);
});
```

`P2002` 뒤 현재 수명 기록이 빈 배열이면 `500`, 한 건 이상이면 `alreadyAwarded: true`인 시험을 각각 둔다.

- [ ] **2단계: 실패 확인**

실행: `npm test -- --run src/__tests__/points-award-route.test.ts`

기대: 배열형 거래만 사용하므로 잠금과 재검증 시험이 실패한다.

- [ ] **3단계: 최소 구현**

콜백형 거래 안에서 아래 순서를 구현한다.

```ts
return prisma.$transaction(async (tx) => {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
  `;
  const rows = await tx.$queryRaw<Array<{ data: Prisma.JsonValue }>>`
    SELECT "data" FROM "game_rooms" WHERE "code" = ${roomCode} FOR SHARE
  `;
  const lockedRoom = parseGameRoom(rows[0]?.data);
  assertMatchingRoom(lockedRoom, normalized);
  const existingLogs = await tx.pointLog.findMany({
    where: buildExistingAwardWhere(normalized, lockedRoom),
    orderBy: { createdAt: "asc" },
  });
  if (existingLogs.length > 0) return restoreAwardResult(existingLogs);
  // 기록 생성과 학생 합계 증가는 이 거래 안에서 순서대로 실행한다.
});
```

바깥 오류 처리에서 `PointAwardError`는 그대로 던지고, `P2002`는 현재 수명 기록이 실제로 있을 때만 기존 지급으로 복구한다. 그 밖의 오류는 `500`으로 바꾼다.

- [ ] **4단계: 통과 확인**

실행: `npm test -- --run src/__tests__/points-award-route.test.ts`

기대: 경합, 방 교체, `409`, `P2002` 시험이 모두 통과한다.

- [ ] **5단계: 커밋**

```bash
git add src/lib/point-award-service.ts src/__tests__/points-award-route.test.ts
git commit -m "fix(points): serialize room lifetime awards"
```

### 작업 4: 지급 실패와 결과 공유 실패를 분리한 화면 복구

**파일:**
- 수정: `src/app/(student)/student-question-play/games/RoomResult.tsx`
- 생성: `src/__tests__/room-result-award.test.tsx`

**연결 규약:**
- 포인트 요청: `roomCreatedAt: room.createdAt`
- 결과 공유: `onAction("update-state", extra, { expectedRoom })`
- 지급 다시 시도는 API를 다시 호출한다.
- 공유 다시 시도는 API를 호출하지 않는다.

- [ ] **1단계: 실패 시험 작성**

```tsx
it("방 생성 시각을 보내고 성공한 결과만 요청 시작 수명에 공유한다", async () => {
  renderResult();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toMatchObject({
    roomCode: "1234",
    roomCreatedAt: 100,
  });
  await waitFor(() => expect(onAction).toHaveBeenCalledWith(
    "update-state",
    { patch: { awardResult: expect.objectContaining({ awards: expect.any(Array) }) } },
    { expectedRoom: { code: "1234", createdAt: 100 } },
  ));
});

it("지급 실패 뒤 다시 시도할 수 있고 오류 본문은 공유하지 않는다", async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response("실패", { status: 500 }))
    .mockResolvedValueOnce(jsonResponse({ awards: [] }));
  renderResult();
  expect(await screen.findByRole("button", { name: "포인트 다시 받기" })).toBeVisible();
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "포인트 다시 받기" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
});

it("공유 실패는 API를 다시 부르지 않고 결과 공유만 다시 시도한다", async () => {
  onAction.mockResolvedValueOnce(conflict).mockResolvedValueOnce(success);
  renderResult();
  fireEvent.click(await screen.findByRole("button", { name: "결과 다시 공유" }));
  await waitFor(() => expect(onAction).toHaveBeenCalledTimes(2));
  expect(fetch).toHaveBeenCalledTimes(1);
});
```

- [ ] **2단계: 실패 확인**

실행: `npm test -- --run src/__tests__/room-result-award.test.tsx`

기대: 수명값, 응답 판별, 두 재시도 명령이 없어 실패한다.

- [ ] **3단계: 최소 구현**

응답은 `2xx`이고 `awards`가 올바른 배열일 때만 `AwardResponse`로 인정한다. 지급 요청 시작 시 `{ code: room.code, createdAt: room.createdAt }`을 붙잡고, 최초 공유와 공유 재시도에 같은 `expectedRoom`을 넘긴다. 지급 실패 상태와 공유 실패 상태를 분리하고 다음 두 명령을 조건부로 그린다.

```tsx
{awardError && isHost && (
  <Button type="button" onClick={() => void requestAward()}>
    포인트 다시 받기
  </Button>
)}
{shareError && localAward && isHost && (
  <Button type="button" onClick={() => void shareAward(localAward, awardRoom)}>
    결과 다시 공유
  </Button>
)}
```

- [ ] **4단계: 통과 확인**

실행: `npm test -- --run src/__tests__/room-result-award.test.tsx src/__tests__/room-action-inputs.test.tsx`

기대: 지급, 재시도, 기존 게임 입력 시험이 모두 통과한다.

- [ ] **5단계: 커밋**

```bash
git add 'src/app/(student)/student-question-play/games/RoomResult.tsx' src/__tests__/room-result-award.test.tsx
git commit -m "fix(points): recover room award publishing"
```

### 작업 5: 첫 단계 전체 검증

**파일:**
- 수정 없음

- [ ] **1단계: 관련 시험 실행**

실행:

```bash
npm test -- --run src/__tests__/game-room-store.test.ts src/__tests__/points-award-route.test.ts src/__tests__/room-result-award.test.tsx src/__tests__/use-room.test.tsx src/__tests__/game-room-route.test.ts
```

기대: 모든 관련 시험 통과.

- [ ] **2단계: 정적 검사와 전체 시험 실행**

실행:

```bash
npm run lint
npm test
```

기대: 린트 오류 없음, 전체 시험 통과.

- [ ] **3단계: 운영 빌드 실행**

실행: `npm run build`

기대: Prisma 구조 검사와 Next.js 운영 빌드 통과.

- [ ] **4단계: 범위 확인**

실행: `git diff --check`와 `git status --short`

기대: 공백 오류가 없고 다른 작업의 수정 파일이 커밋에 섞이지 않는다.

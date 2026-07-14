import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUILT_IN_QUESTION_GAME_IDS,
  type BuiltInQuestionGameId,
} from "@/lib/question-game-rules";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createGameRoom: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/game-room-store", () => ({
  createGameRoom: mocks.createGameRoom,
}));

import { POST } from "@/app/api/question-games/rooms/route";

function createRoom(gameId: string) {
  return POST(
    new Request("http://localhost/api/question-games/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameId }),
    }) as never,
  );
}

beforeEach(() => {
  mocks.auth.mockReset().mockResolvedValue({
    user: { id: "user-1", name: "학생" },
  });
  mocks.createGameRoom.mockReset().mockImplementation(
    async ({ gameId }: { gameId: BuiltInQuestionGameId }) => ({
      code: "1234",
      gameId,
    }),
  );
});

describe("친구 방 생성 놀이 식별값", () => {
  it("놀이 식별값이 없으면 기존 입력 오류를 반환한다", async () => {
    const response = await createRoom("");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "gameId가 필요합니다",
    });
    expect(mocks.createGameRoom).not.toHaveBeenCalled();
  });

  it("알 수 없는 놀이 식별값은 저장소를 호출하지 않고 거부한다", async () => {
    const response = await createRoom("unknown");

    expect(response.status).toBe(400);
    expect(mocks.createGameRoom).not.toHaveBeenCalled();
  });

  it.each(BUILT_IN_QUESTION_GAME_IDS)("%s 방을 생성한다", async (gameId) => {
    const response = await createRoom(gameId);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      room: { gameId },
    });
    expect(mocks.createGameRoom).toHaveBeenCalledWith({
      gameId,
      hostId: "user-1",
      hostName: "학생",
    });
  });
});

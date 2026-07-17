import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { APP_ROOM_POLL_MS } from "@/lib/query-refresh";

const useRoomSource = readFileSync("src/app/(student)/student-question-play/games/useRoom.ts", "utf8");
const roomTypeSource = readFileSync("src/lib/question-games-data.ts", "utf8");
const roomRouteSource = readFileSync("src/app/api/question-games/rooms/[code]/route.ts", "utf8");
const roomCreateRouteSource = readFileSync("src/app/api/question-games/rooms/route.ts", "utf8");
const roomStorePath = "src/lib/game-room-store.ts";
const roomStoreSource = existsSync(roomStorePath) ? readFileSync(roomStorePath, "utf8") : "";
const roomPagePath = "src/components/question-games/QuestionGameRoomFlow.tsx";

describe("room sync policy", () => {
  it("keeps room polling interval in the shared refresh policy", () => {
    expect(APP_ROOM_POLL_MS).toBe(2000);
    expect(useRoomSource).toContain("APP_ROOM_POLL_MS");
    expect(useRoomSource).toContain("visibleRefetchInterval(APP_ROOM_POLL_MS");
    expect(useRoomSource).toContain("visibilitychange");
    expect(useRoomSource).not.toContain("const POLL_INTERVAL = 2000");
  });

  it("uses room versions to detect stale tablet actions", () => {
    expect(roomTypeSource).toContain("version: number");
    expect(roomStoreSource).toContain("version: 1");
    expect(roomRouteSource).toContain("expectedVersion");
    expect(roomRouteSource).toContain("status: 409");
    expect(roomRouteSource).toContain("isStaleRoomAction");
    expect(useRoomSource).toContain("expectedVersion");
  });

  it("keeps room storage details behind a store service", () => {
    expect(existsSync(roomStorePath)).toBe(true);

    expect(roomStoreSource).toContain("createGameRoom");
    expect(roomStoreSource).toContain("loadGameRoom");
    expect(roomStoreSource).toContain("saveGameRoom");
    expect(roomStoreSource).toContain("deleteGameRoom");
    expect(roomStoreSource).toContain("isStaleRoomAction");

    expect(roomCreateRouteSource).toContain("createGameRoom");
    expect(roomRouteSource).toContain("loadGameRoom");
    expect(roomRouteSource).toContain("saveGameRoom");
    expect(roomRouteSource).toContain("deleteGameRoom");
    expect(roomRouteSource).toContain("isStaleRoomAction");
    expect(roomCreateRouteSource).not.toContain("systemConfig");
    expect(roomRouteSource).not.toContain("systemConfig");
    expect(roomCreateRouteSource).not.toContain("ROOM_KEY");
    expect(roomRouteSource).not.toContain("ROOM_KEY");
  });

  it("uses a dedicated room model instead of overloading SystemConfig", () => {
    expect(roomStoreSource).toContain("client.gameRoom");
    expect(roomStoreSource).not.toContain("systemConfig");
  });

  it("나가기 성공일 때만 방 선택 화면으로 이동한다", () => {
    const flow = readFileSync(roomPagePath, "utf8");
    expect(flow).toContain("if (!(await leaveRoom())) return;");
  });

  it("열린 방의 모든 화면에 방 오류 알림을 연결한다", () => {
    const flow = readFileSync(roomPagePath, "utf8");
    expect(flow).toMatch(
      /const errorAlert = error \? \([\s\S]*?role="alert"[\s\S]*?\{error\}[\s\S]*?\) : null;/,
    );
    expect(flow.match(/\{errorAlert\}/g)).toHaveLength(4);
    expect(flow).toMatch(/\{errorAlert\}\s*<RoomLobby/);
    expect(flow).toMatch(/\{errorAlert\}\s*<RoomComponent/);
    expect(flow).toMatch(/\{errorAlert\}\s*<div className="mx-auto max-w-lg/);
    expect(flow).not.toContain('config={{ mode: "friend"');
  });
});

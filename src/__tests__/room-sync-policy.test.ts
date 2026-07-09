import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { APP_ROOM_POLL_MS } from "@/lib/query-refresh";

const useRoomSource = readFileSync("src/app/(student)/student-question-play/games/useRoom.ts", "utf8");
const roomTypeSource = readFileSync("src/lib/question-games-data.ts", "utf8");
const roomRouteSource = readFileSync("src/app/api/question-games/rooms/[code]/route.ts", "utf8");
const roomCreateRouteSource = readFileSync("src/app/api/question-games/rooms/route.ts", "utf8");

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
    expect(roomCreateRouteSource).toContain("version: 1");
    expect(roomRouteSource).toContain("expectedVersion");
    expect(roomRouteSource).toContain("status: 409");
    expect(roomRouteSource).toContain("room.version");
    expect(useRoomSource).toContain("expectedVersion");
  });
});

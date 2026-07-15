import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("질문놀이 방 예약 정리 설정", () => {
  it("매일 한국 시각 새벽 세 시에 예약 경로를 호출한다", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(config.crons).toContainEqual({
      path: "/api/cron/question-game-rooms/cleanup",
      schedule: "0 18 * * *",
    });
  });

  it("예약 요청 비밀값을 환경 설정 예시에 안내한다", () => {
    expect(readFileSync(".env.example", "utf8")).toContain("CRON_SECRET=");
  });
});

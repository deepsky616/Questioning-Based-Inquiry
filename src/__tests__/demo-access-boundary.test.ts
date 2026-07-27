import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const registerSource = readFileSync("src/app/api/auth/register/route.ts", "utf8");
const changePasswordSource = readFileSync(
  "src/app/api/account/change-password/route.ts",
  "utf8",
);
const leaderboardSource = readFileSync(
  "src/app/api/points/leaderboard/route.ts",
  "utf8",
);
const classLeaderboardSource = readFileSync(
  "src/app/api/points/class-leaderboard/route.ts",
  "utf8",
);
const classRanksSource = readFileSync(
  "src/app/api/points/class-ranks/route.ts",
  "utf8",
);

describe("시연 자료와 일반 자료 접근 경계", () => {
  it("질문초등학교를 일반 회원가입에 사용하지 못한다", () => {
    expect(registerSource).toContain("isReservedDemoSchool");
    expect(registerSource).toContain("시연 전용 학교 이름");
  });

  it("시연 계정은 비밀번호를 변경하지 못한다", () => {
    expect(changePasswordSource).toContain("isDemo: true");
    expect(changePasswordSource).toContain("시연 계정의 비밀번호");
  });

  it("모든 전역 순위는 현재 사용자와 같은 시연 범위만 조회한다", () => {
    expect(leaderboardSource).toContain("isDemo: me.isDemo");
    expect(classLeaderboardSource).toContain("isDemo: me.isDemo");
    expect(classRanksSource).toContain("isDemo: me.isDemo");
  });
});

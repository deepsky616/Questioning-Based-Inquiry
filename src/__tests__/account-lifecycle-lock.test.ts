import { describe, expect, it, vi } from "vitest";

import { lockAccountLifecycles } from "@/lib/account-lifecycle-lock";

describe("계정 생명주기 거래 잠금", () => {
  it("사용자 아이디를 중복 제거하고 정렬한 뒤 별도 이름공간으로 순서대로 잠근다", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ lock: "" }]);

    await lockAccountLifecycles(
      { $queryRaw: queryRaw } as never,
      ["user-b", "user-a", "user-b", ""],
    );

    expect(queryRaw).toHaveBeenCalledTimes(2);
    expect(queryRaw.mock.calls.map((call) => call[1])).toEqual([
      "account-lifecycle:user-a",
      "account-lifecycle:user-b",
    ]);
    for (const [query] of queryRaw.mock.calls as Array<[
      TemplateStringsArray,
      ...unknown[],
    ]>) {
      expect(query.join("?")).toContain("pg_advisory_xact_lock");
      expect(query.join("?")).toContain("hashtextextended");
    }
  });

  it("앞선 사용자 잠금이 끝나기 전에는 다음 잠금을 요청하지 않는다", async () => {
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const queryRaw = vi.fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce([{ lock: "" }]);

    const locking = lockAccountLifecycles(
      { $queryRaw: queryRaw } as never,
      ["user-b", "user-a"],
    );
    await Promise.resolve();

    expect(queryRaw).toHaveBeenCalledTimes(1);
    releaseFirst();
    await vi.waitFor(() => expect(queryRaw).toHaveBeenCalledTimes(2));
    await locking;
  });
});

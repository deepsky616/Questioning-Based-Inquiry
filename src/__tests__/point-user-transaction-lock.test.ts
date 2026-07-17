import { describe, expect, it, vi } from "vitest";

import { lockPointUserTransactions } from "@/lib/point-user-transaction-lock";

describe("포인트 사용자 거래 잠금", () => {
  it("사용자 목록이 비어 있으면 자료베이스 잠금을 요청하지 않는다", async () => {
    const queryRaw = vi.fn();

    await lockPointUserTransactions({ $queryRaw: queryRaw } as never, []);

    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("사용자 아이디를 중복 제거하고 정렬한 뒤 같은 이름공간의 잠금을 요청한다", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ lock: "" }]);

    await lockPointUserTransactions(
      { $queryRaw: queryRaw } as never,
      ["student-b", "teacher-a", "student-a", "student-b"],
    );

    expect(queryRaw).toHaveBeenCalledTimes(3);
    expect(queryRaw.mock.calls.map((call) => call[1])).toEqual([
      "point-user-transaction:student-a",
      "point-user-transaction:student-b",
      "point-user-transaction:teacher-a",
    ]);
    for (const [query] of queryRaw.mock.calls as Array<[TemplateStringsArray, ...unknown[]]>) {
      expect(query.join("?")).toContain("pg_advisory_xact_lock");
      expect(query.join("?")).toContain("hashtextextended");
    }
  });

  it("앞선 사용자 잠금이 끝난 뒤에만 다음 사용자 잠금을 요청한다", async () => {
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const second = new Promise<void>((resolve) => { releaseSecond = resolve; });
    const queryRaw = vi.fn()
      .mockImplementationOnce(() => first)
      .mockImplementationOnce(() => second)
      .mockResolvedValueOnce([{ lock: "" }]);

    const locking = lockPointUserTransactions(
      { $queryRaw: queryRaw } as never,
      ["user-c", "user-a", "user-b"],
    );
    await Promise.resolve();

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.calls[0]?.[1]).toBe("point-user-transaction:user-a");

    releaseFirst();
    await vi.waitFor(() => expect(queryRaw).toHaveBeenCalledTimes(2));
    expect(queryRaw.mock.calls[1]?.[1]).toBe("point-user-transaction:user-b");

    releaseSecond();
    await vi.waitFor(() => expect(queryRaw).toHaveBeenCalledTimes(3));
    expect(queryRaw.mock.calls[2]?.[1]).toBe("point-user-transaction:user-c");
    await locking;
  });
});

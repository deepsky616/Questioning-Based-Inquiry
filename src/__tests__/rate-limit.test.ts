import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { rateLimit, __resetRateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    __resetRateLimit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("윈도우 내 limit 까지는 허용한다", () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit("user:a", { limit: 3, windowMs: 1000 }).success).toBe(true);
    }
  });

  it("limit 초과 시 차단한다", () => {
    const opts = { limit: 3, windowMs: 1000 };
    rateLimit("user:a", opts);
    rateLimit("user:a", opts);
    rateLimit("user:a", opts);
    const blocked = rateLimit("user:a", opts);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("키마다 카운트가 독립적이다", () => {
    const opts = { limit: 1, windowMs: 1000 };
    expect(rateLimit("user:a", opts).success).toBe(true);
    expect(rateLimit("user:b", opts).success).toBe(true);
    expect(rateLimit("user:a", opts).success).toBe(false);
  });

  it("윈도우가 지나면 다시 허용한다", () => {
    vi.useFakeTimers();
    const opts = { limit: 1, windowMs: 1000 };
    expect(rateLimit("user:a", opts).success).toBe(true);
    expect(rateLimit("user:a", opts).success).toBe(false);

    vi.advanceTimersByTime(1001);
    expect(rateLimit("user:a", opts).success).toBe(true);
  });

  it("remaining 값이 줄어든다", () => {
    const opts = { limit: 3, windowMs: 1000 };
    expect(rateLimit("user:a", opts).remaining).toBe(2);
    expect(rateLimit("user:a", opts).remaining).toBe(1);
    expect(rateLimit("user:a", opts).remaining).toBe(0);
  });
});

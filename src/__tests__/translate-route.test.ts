import { describe, it, expect, vi, beforeEach } from "vitest";

// 라우트 의존성 모킹 (contentHash는 실제 구현 유지, translateTexts만 모킹)
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(() => ({ success: true })) }));
vi.mock("@/lib/resolve-ai-config", () => ({ resolveUserAiConfig: vi.fn() }));
vi.mock("@/lib/translate", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/translate")>();
  return { ...actual, translateTexts: vi.fn() };
});
vi.mock("@/lib/db", () => ({
  prisma: {
    question: { findMany: vi.fn() },
    comment: { findMany: vi.fn() },
    translation: { findMany: vi.fn(), upsert: vi.fn() },
  },
}));

import { POST } from "@/app/api/translate/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";
import { translateTexts, contentHash } from "@/lib/translate";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mResolve = resolveUserAiConfig as unknown as ReturnType<typeof vi.fn>;
const mTranslate = translateTexts as unknown as ReturnType<typeof vi.fn>;
const q = prisma.question.findMany as unknown as ReturnType<typeof vi.fn>;
const c = prisma.comment.findMany as unknown as ReturnType<typeof vi.fn>;
const tFind = prisma.translation.findMany as unknown as ReturnType<typeof vi.fn>;
const tUpsert = prisma.translation.upsert as unknown as ReturnType<typeof vi.fn>;

function req(locale: string, items: unknown) {
  return new Request("http://localhost/api/translate", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `NEXT_LOCALE=${locale}` },
    body: JSON.stringify({ items }),
  });
}

const ITEM = [{ type: "QUESTION", id: "q1" }];

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "u1" } });
  q.mockResolvedValue([]);
  c.mockResolvedValue([]);
  tFind.mockResolvedValue([]);
  tUpsert.mockResolvedValue({});
});

describe("POST /api/translate", () => {
  it("미인증 → 401", async () => {
    mAuth.mockResolvedValue(null);
    const res = await POST(req("en", ITEM));
    expect(res.status).toBe(401);
  });

  it("한국어 로케일 → no-op (AI·DB 미호출)", async () => {
    const res = await POST(req("ko", ITEM));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ translations: {} });
    expect(q).not.toHaveBeenCalled();
    expect(mTranslate).not.toHaveBeenCalled();
  });

  it("캐시 hit(해시 일치) → 번역 호출 없이 캐시 반환", async () => {
    q.mockResolvedValue([{ id: "q1", content: "왜?" }]);
    tFind.mockResolvedValue([
      { sourceType: "QUESTION", sourceId: "q1", content: "Why?", sourceHash: contentHash("왜?") },
    ]);
    const res = await POST(req("en", ITEM));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ translations: { "QUESTION:q1": "Why?" } });
    expect(mTranslate).not.toHaveBeenCalled();
  });

  it("캐시 miss + AI 키 없음 → 503", async () => {
    q.mockResolvedValue([{ id: "q1", content: "왜?" }]);
    mResolve.mockResolvedValue({ apiKey: null, model: "m" });
    const res = await POST(req("en", ITEM));
    expect(res.status).toBe(503);
    expect(mTranslate).not.toHaveBeenCalled();
  });

  it("캐시 miss + 키 있음 → 번역·업서트·반환", async () => {
    q.mockResolvedValue([{ id: "q1", content: "왜?" }]);
    mResolve.mockResolvedValue({ apiKey: "k", model: "m" });
    mTranslate.mockResolvedValue(["Why?"]);
    const res = await POST(req("en", ITEM));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ translations: { "QUESTION:q1": "Why?" } });
    expect(mTranslate).toHaveBeenCalledWith(["왜?"], "en", "k", "m");
    expect(tUpsert).toHaveBeenCalledTimes(1);
  });

  it("stale 캐시(해시 불일치) → 재번역", async () => {
    q.mockResolvedValue([{ id: "q1", content: "수정된 원문" }]);
    tFind.mockResolvedValue([
      { sourceType: "QUESTION", sourceId: "q1", content: "old", sourceHash: contentHash("이전 원문") },
    ]);
    mResolve.mockResolvedValue({ apiKey: "k", model: "m" });
    mTranslate.mockResolvedValue(["new"]);
    const res = await POST(req("en", ITEM));
    expect(await res.json()).toEqual({ translations: { "QUESTION:q1": "new" } });
    expect(mTranslate).toHaveBeenCalledWith(["수정된 원문"], "en", "k", "m");
  });
});

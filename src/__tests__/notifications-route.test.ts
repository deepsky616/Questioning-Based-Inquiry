import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    appNotification: {
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET, PATCH as patchAll } from "@/app/api/notifications/route";
import { PATCH as patchOne } from "@/app/api/notifications/[id]/route";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.appNotification.findMany as unknown as ReturnType<typeof vi.fn>;
const mockCount = prisma.appNotification.count as unknown as ReturnType<typeof vi.fn>;
const mockUpdateMany = prisma.appNotification.updateMany as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "u1", role: "TEACHER" } });
  mockFindMany.mockResolvedValue([]);
  mockCount.mockResolvedValue(0);
  mockUpdateMany.mockResolvedValue({ count: 2 });
});

describe("알림 API", () => {
  it("비로그인은 401", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await patchAll()).status).toBe(401);
  });

  it("GET은 본인(recipientId) 알림만 조회한다", async () => {
    await GET();
    for (const call of mockFindMany.mock.calls) {
      expect(call[0].where.recipientId).toBe("u1");
    }
    expect(mockCount.mock.calls[0][0].where).toMatchObject({ recipientId: "u1", readAt: null });
  });

  it("PATCH(전체 읽음)는 본인의 안 읽은 알림만 갱신한다", async () => {
    const res = await patchAll();
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, updated: 2 });
    expect(mockUpdateMany.mock.calls[0][0].where).toMatchObject({ recipientId: "u1", readAt: null });
  });

  it("개별 읽음 처리는 id+본인 소유로 스코프된다(남의 알림 조작 불가)", async () => {
    const res = await patchOne(new Request("http://localhost/api/notifications/n1", { method: "PATCH" }), {
      params: Promise.resolve({ id: "n1" }),
    });
    expect(res.status).toBe(200);
    expect(mockUpdateMany.mock.calls[0][0].where).toMatchObject({ id: "n1", recipientId: "u1" });
  });
});

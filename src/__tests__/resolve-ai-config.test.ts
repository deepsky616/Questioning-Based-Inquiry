import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    systemConfig: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/db";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";

const mUser = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mFirst = prisma.user.findFirst as unknown as ReturnType<typeof vi.fn>;
const mSys = prisma.systemConfig.findUnique as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mSys.mockResolvedValue(null);
  delete process.env.DEMO_AI_SOURCE_EMAIL;
});

describe("resolveUserAiConfig — AI 키/모델 3단계 결정", () => {
  it("교사 본인 키가 있으면 그 키·모델을 쓴다", async () => {
    mUser.mockResolvedValue({ role: "TEACHER", isDemo: false, aiApiKey: "t-key", aiModel: "gemini-2.5-flash-lite" });
    const cfg = await resolveUserAiConfig("t1");
    expect(cfg).toEqual({ apiKey: "t-key", model: "gemini-2.5-flash-lite", isDemo: false });
    expect(mFirst).not.toHaveBeenCalled();
  });

  it("교사의 허용 외 모델은 기본 모델로 보정된다", async () => {
    mUser.mockResolvedValue({ role: "TEACHER", isDemo: false, aiApiKey: "t-key", aiModel: "gpt-4" });
    const cfg = await resolveUserAiConfig("t1");
    expect(cfg.model).toBe("gemini-2.5-flash");
  });

  it("학생은 같은 학교·담당 학급 교사의 키를 물려받는다", async () => {
    mUser.mockResolvedValue({
      role: "STUDENT", isDemo: false, school: "한빛초", grade: "5", className: "1",
      aiApiKey: null, aiModel: null,
    });
    mFirst.mockResolvedValue({ aiApiKey: "teacher-key", aiModel: "gemini-2.5-pro" });
    const cfg = await resolveUserAiConfig("s1");
    expect(cfg).toEqual({ apiKey: "teacher-key", model: "gemini-2.5-pro", isDemo: false });
    const where = mFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({
      role: "TEACHER",
      school: "한빛초",
      teacherClasses: { some: { grade: "5", className: "1" } },
    });
  });

  it("담당 교사 키가 없으면 전역 SystemConfig로 폴백한다", async () => {
    mUser.mockResolvedValue({ role: "STUDENT", isDemo: false, school: "한빛초", grade: "5", className: "1", aiApiKey: null, aiModel: null });
    mFirst.mockResolvedValue(null);
    mSys.mockImplementation(({ where }: { where: { key: string } }) =>
      Promise.resolve(
        where.key === "gemini_api_key" ? { value: "global-key" }
        : where.key === "gemini_model" ? { value: "gemini-2.5-flash-lite" }
        : null,
      ),
    );
    const cfg = await resolveUserAiConfig("s1");
    expect(cfg).toEqual({ apiKey: "global-key", model: "gemini-2.5-flash-lite", isDemo: false });
  });

  it("어디에도 키가 없으면 apiKey null + 기본 모델", async () => {
    mUser.mockResolvedValue({ role: "TEACHER", isDemo: false, aiApiKey: null, aiModel: null });
    const cfg = await resolveUserAiConfig("t1");
    expect(cfg).toEqual({ apiKey: null, model: "gemini-2.5-flash", isDemo: false });
  });

  it("학년·반이 없는 학생은 교사 탐색 없이 전역 폴백으로 간다", async () => {
    mUser.mockResolvedValue({ role: "STUDENT", isDemo: false, school: "한빛초", grade: null, className: null, aiApiKey: null, aiModel: null });
    const cfg = await resolveUserAiConfig("s1");
    expect(mFirst).not.toHaveBeenCalled();
    expect(cfg.apiKey).toBeNull();
  });

  it("시연 학생은 지정된 일반 교사의 키를 서버에서만 사용한다", async () => {
    process.env.DEMO_AI_SOURCE_EMAIL = "source@example.com";
    mUser.mockResolvedValue({
      role: "STUDENT",
      isDemo: true,
      school: "질문초등학교",
      grade: "4",
      className: "1",
      aiApiKey: null,
      aiModel: null,
    });
    mFirst.mockResolvedValue({
      aiApiKey: "server-only-key",
      aiModel: "gemini-2.5-flash-lite",
    });

    const cfg = await resolveUserAiConfig("demo-student");

    expect(cfg).toEqual({
      apiKey: "server-only-key",
      model: "gemini-2.5-flash-lite",
      isDemo: true,
    });
    expect(mFirst).toHaveBeenCalledWith({
      where: {
        email: "source@example.com",
        role: "TEACHER",
        isDemo: false,
        aiApiKey: { not: null },
      },
      select: { aiApiKey: true, aiModel: true },
    });
  });
});

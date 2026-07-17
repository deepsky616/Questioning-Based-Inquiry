import { describe, it, expect, vi, beforeEach } from "vitest";

// 세션 분석 번역 라우트 — 권한·캐시·번역 경로 검증
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(() => ({ success: true })) }));
vi.mock("@/lib/resolve-ai-config", () => ({ resolveUserAiConfig: vi.fn() }));
vi.mock("@/lib/translate", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/translate")>();
  return { ...actual, translateTexts: vi.fn() };
});
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: { findFirst: vi.fn(), findUnique: vi.fn() },
    sessionAnalysis: { findUnique: vi.fn() },
    translation: { findUnique: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

import { POST } from "@/app/api/reports/session-analysis/translate/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";
import { translateTexts, contentHash } from "@/lib/translate";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mResolve = resolveUserAiConfig as unknown as ReturnType<typeof vi.fn>;
const mTranslate = translateTexts as unknown as ReturnType<typeof vi.fn>;
const mSession = prisma.questionSession.findFirst as unknown as ReturnType<typeof vi.fn>;
const mSessionFind = prisma.questionSession.findUnique as unknown as ReturnType<typeof vi.fn>;
const mSessionAnalysis = prisma.sessionAnalysis.findUnique as unknown as ReturnType<typeof vi.fn>;
const mFind = prisma.translation.findUnique as unknown as ReturnType<typeof vi.fn>;
const mUpsert = prisma.translation.upsert as unknown as ReturnType<typeof vi.fn>;
const mUserFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;

function req(locale: string, body: unknown) {
  return new Request("http://localhost/api/reports/session-analysis/translate", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `NEXT_LOCALE=${locale}` },
    body: JSON.stringify(body),
  });
}

const BODY = { sessionId: "s1", cacheKey: "class:5|1", fields: { summary: "요약", insights: "제안" } };

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
  mSession.mockResolvedValue({ id: "s1" });
  mSessionFind.mockResolvedValue({
    teacherId: "t1",
    targetType: "CLASS",
    targetGrade: "5",
    targetClassName: "1",
    targetStudentId: null,
    targetStudentIds: [],
    teacher: {
      role: "TEACHER",
      school: "한빛초",
      teacherClasses: [{ grade: "5", className: "1" }],
    },
  });
  mSessionAnalysis.mockResolvedValue({ id: "a1", result: BODY.fields });
  mUserFind.mockResolvedValue({
    id: "st1",
    role: "STUDENT",
    school: "한빛초",
    grade: "5",
    className: "1",
  });
  mFind.mockResolvedValue(null);
  mUpsert.mockResolvedValue({});
  mResolve.mockResolvedValue({ apiKey: "k", model: "gemini-2.5-flash-lite" });
  mTranslate.mockResolvedValue(["Summary", "Suggestion"]);
});

describe("POST session-analysis translate", () => {
  it("비로그인은 401", async () => {
    mAuth.mockResolvedValue(null);
    expect((await POST(req("en", BODY))).status).toBe(401);
  });

  it("지원하지 않는 권한은 403", async () => {
    mAuth.mockResolvedValue({ user: { id: "u1", role: "PARENT" } });
    expect((await POST(req("en", BODY))).status).toBe(403);
  });

  it("학생은 본인 저장 분석이 있으면 번역할 수 있다", async () => {
    mAuth.mockResolvedValue({ user: { id: "st1", role: "STUDENT" } });
    const res = await POST(req("en", { ...BODY, cacheKey: "student-self" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.fields).toEqual({ summary: "Summary", insights: "Suggestion" });
    expect(mSessionAnalysis).toHaveBeenCalledWith({
      where: { sessionId_scope_studentId: { sessionId: "s1", scope: "student", studentId: "st1" } },
      select: { id: true, result: true },
    });
  });

  it("학생이 현재 수업 대상에서 제외되면 저장 분석이 있어도 번역할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "st1", role: "STUDENT" } });
    mSessionFind.mockResolvedValue({
      teacherId: "t1",
      targetType: "STUDENT",
      targetGrade: null,
      targetClassName: null,
      targetStudentId: "student-other",
      targetStudentIds: ["student-other"],
      teacher: {
        role: "TEACHER",
        school: "한빛초",
        teacherClasses: [{ grade: "5", className: "1" }],
      },
    });

    expect((await POST(req("en", { ...BODY, cacheKey: "student-self" }))).status).toBe(403);
    expect(mTranslate).not.toHaveBeenCalled();
    expect(mUpsert).not.toHaveBeenCalled();
  });

  it("학생은 저장 분석과 다른 자료나 교사용 캐시 키를 번역할 수 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "st1", role: "STUDENT" } });

    const arbitrary = await POST(req("en", {
      ...BODY,
      cacheKey: "student-self",
      fields: { summary: "임의로 만든 자료" },
    }));
    expect(arbitrary.status).toBe(400);

    const teacherCache = await POST(req("en", BODY));
    expect(teacherCache.status).toBe(403);
    expect(mTranslate).not.toHaveBeenCalled();
    expect(mUpsert).not.toHaveBeenCalled();
  });

  it("학생 본인 저장 분석이 없으면 404", async () => {
    mAuth.mockResolvedValue({ user: { id: "st1", role: "STUDENT" } });
    mSessionAnalysis.mockResolvedValue(null);
    expect((await POST(req("en", { ...BODY, cacheKey: "student-self" }))).status).toBe(404);
  });

  it("남의 세션이면 404 (번역 프록시 오남용 방지)", async () => {
    mSession.mockResolvedValue(null);
    expect((await POST(req("en", BODY))).status).toBe(404);
  });

  it("ko 로케일이면 번역하지 않는다", async () => {
    const res = await POST(req("ko", BODY));
    const data = await res.json();
    expect(data.fields).toEqual({});
    expect(mTranslate).not.toHaveBeenCalled();
  });

  it("캐시 미스면 번역 후 필드 키를 유지해 반환·캐시한다", async () => {
    const res = await POST(req("en", BODY));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.fields).toEqual({ summary: "Summary", insights: "Suggestion" });
    expect(mUpsert).toHaveBeenCalledTimes(1);
    const arg = mUpsert.mock.calls[0][0];
    expect(arg.create.sourceType).toBe("ANALYSIS");
    expect(arg.create.sourceId).toBe("s1:class:5|1");
  });

  it("해시가 같은 캐시가 있으면 Gemini를 호출하지 않는다", async () => {
    const entries = Object.entries(BODY.fields);
    mFind.mockResolvedValue({
      sourceHash: contentHash(JSON.stringify(entries)),
      content: JSON.stringify({ summary: "Cached", insights: "Hit" }),
    });
    const res = await POST(req("en", BODY));
    const data = await res.json();
    expect(data.fields).toEqual({ summary: "Cached", insights: "Hit" });
    expect(mTranslate).not.toHaveBeenCalled();
  });

  it("AI 설정이 없으면 503", async () => {
    mResolve.mockResolvedValue({ apiKey: null, model: "gemini-2.5-flash-lite" });
    expect((await POST(req("en", BODY))).status).toBe(503);
  });

  it("빈 필드는 번역 대상에서 제외한다", async () => {
    const res = await POST(req("en", { ...BODY, fields: { summary: "요약", empty: "  " } }));
    const data = await res.json();
    expect(mTranslate).toHaveBeenCalledWith(["요약"], "en", "t1", "k", "gemini-2.5-flash-lite");
    expect(Object.keys(data.fields)).toEqual(["summary"]);
  });
});

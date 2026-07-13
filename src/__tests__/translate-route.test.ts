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
    user: { findUnique: vi.fn() },
    question: { findMany: vi.fn() },
    comment: { findMany: vi.fn() },
    questionSession: { findMany: vi.fn() },
    teacherClass: { findMany: vi.fn() },
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
const mUser = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const q = prisma.question.findMany as unknown as ReturnType<typeof vi.fn>;
const c = prisma.comment.findMany as unknown as ReturnType<typeof vi.fn>;
const qs = prisma.questionSession.findMany as unknown as ReturnType<typeof vi.fn>;
const tc = prisma.teacherClass.findMany as unknown as ReturnType<typeof vi.fn>;
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
// 공개 질문(권한 통과)
const pubQ = (content: string) => ({
  id: "q1", content, isPublic: true, authorId: "other",
  author: { role: "STUDENT", school: "s", grade: "5", className: "1" },
});

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "u1" } });
  // 기본 뷰어: 담당 학급 없는 교사(같은 학교 전체 열람 가능)
  mUser.mockResolvedValue({ id: "u1", role: "TEACHER", school: "s", grade: null, className: null, teacherClasses: [] });
  q.mockResolvedValue([]);
  c.mockResolvedValue([]);
  qs.mockResolvedValue([]);
  tc.mockResolvedValue([]);
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
    q.mockResolvedValue([pubQ("왜?")]);
    tFind.mockResolvedValue([
      { sourceType: "QUESTION", sourceId: "q1", content: "Why?", sourceHash: contentHash("왜?") },
    ]);
    const res = await POST(req("en", ITEM));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ translations: { "QUESTION:q1": "Why?" } });
    expect(mTranslate).not.toHaveBeenCalled();
  });

  it("캐시 miss + AI 키 없음 → 503", async () => {
    q.mockResolvedValue([pubQ("왜?")]);
    mResolve.mockResolvedValue({ apiKey: null, model: "m" });
    const res = await POST(req("en", ITEM));
    expect(res.status).toBe(503);
    expect(mTranslate).not.toHaveBeenCalled();
  });

  it("캐시 miss + 키 있음 → 번역·업서트·반환", async () => {
    q.mockResolvedValue([pubQ("왜?")]);
    mResolve.mockResolvedValue({ apiKey: "k", model: "m" });
    mTranslate.mockResolvedValue(["Why?"]);
    const res = await POST(req("en", ITEM));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ translations: { "QUESTION:q1": "Why?" } });
    expect(mTranslate).toHaveBeenCalledWith(["왜?"], "en", "u1", "k", "m");
    expect(tUpsert).toHaveBeenCalledTimes(1);
  });

  it("stale 캐시(해시 불일치) → 재번역", async () => {
    q.mockResolvedValue([{ ...pubQ("수정된 원문") }]);
    tFind.mockResolvedValue([
      { sourceType: "QUESTION", sourceId: "q1", content: "old", sourceHash: contentHash("이전 원문") },
    ]);
    mResolve.mockResolvedValue({ apiKey: "k", model: "m" });
    mTranslate.mockResolvedValue(["new"]);
    const res = await POST(req("en", ITEM));
    expect(await res.json()).toEqual({ translations: { "QUESTION:q1": "new" } });
    expect(mTranslate).toHaveBeenCalledWith(["수정된 원문"], "en", "u1", "k", "m");
  });

  it("권한 없음(학생이 남의 비공개 질문 id로 직접 호출) → 번역 안 됨", async () => {
    // 뷰어를 학생으로, 질문은 비공개+타인 작성 → 열람 불가 → 응답에서 제외
    mUser.mockResolvedValue({ id: "u1", role: "STUDENT", school: "s", grade: "5", className: "1", teacherClasses: [] });
    q.mockResolvedValue([{ id: "q1", content: "비밀 질문", isPublic: false, authorId: "other", author: { role: "STUDENT", school: "s", grade: "5", className: "1" } }]);
    mResolve.mockResolvedValue({ apiKey: "k", model: "m" });
    const res = await POST(req("en", ITEM));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ translations: {} });
    expect(mTranslate).not.toHaveBeenCalled();
  });

  it("교사는 본인 세션 교과와 주제를 번역할 수 있다", async () => {
    qs.mockResolvedValue([
      {
        id: "s1",
        subject: "수학",
        topic: "수의 규칙과 관계",
        teacherId: "u1",
        targetType: "ALL",
        targetGrade: null,
        targetClassName: null,
        targetStudentId: null,
        targetStudentIds: [],
      },
    ]);
    mResolve.mockResolvedValue({ apiKey: "k", model: "m" });
    mTranslate.mockResolvedValue(["Math", "Number patterns and relationships"]);
    const res = await POST(req("en", [
      { type: "SESSION_SUBJECT", id: "s1" },
      { type: "SESSION_TOPIC", id: "s1" },
    ]));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      translations: {
        "SESSION_SUBJECT:s1": "Math",
        "SESSION_TOPIC:s1": "Number patterns and relationships",
      },
    });
  });

  it("학생은 담당 학급 수업의 교과와 주제를 번역할 수 있다", async () => {
    mUser.mockResolvedValue({ id: "st1", role: "STUDENT", school: "s", grade: "5", className: "1", teacherClasses: [] });
    qs.mockResolvedValue([
      {
        id: "s1",
        subject: "과학",
        topic: "식물의 한살이",
        teacherId: "t1",
        targetType: "CLASS",
        targetGrade: "5",
        targetClassName: "1",
        targetStudentId: null,
        targetStudentIds: [],
      },
    ]);
    tc.mockResolvedValue([{ teacherId: "t1" }]);
    mResolve.mockResolvedValue({ apiKey: "k", model: "m" });
    mTranslate.mockResolvedValue(["Science", "Plant life cycles"]);
    const res = await POST(req("en", [
      { type: "SESSION_SUBJECT", id: "s1" },
      { type: "SESSION_TOPIC", id: "s1" },
    ]));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      translations: {
        "SESSION_SUBJECT:s1": "Science",
        "SESSION_TOPIC:s1": "Plant life cycles",
      },
    });
  });
});

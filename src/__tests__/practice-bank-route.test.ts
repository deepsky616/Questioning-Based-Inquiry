import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    practiceCustomItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    practiceAttempt: { findMany: vi.fn() },
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET, POST } from "@/app/api/teacher/practice-bank/route";
import { PATCH, DELETE } from "@/app/api/teacher/practice-bank/[id]/route";
import { NextRequest } from "next/server";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mFindMany = prisma.practiceCustomItem.findMany as unknown as ReturnType<typeof vi.fn>;
const mFindFirst = prisma.practiceCustomItem.findFirst as unknown as ReturnType<typeof vi.fn>;
const mCount = prisma.practiceCustomItem.count as unknown as ReturnType<typeof vi.fn>;
const mCreate = prisma.practiceCustomItem.create as unknown as ReturnType<typeof vi.fn>;
const mUpdate = prisma.practiceCustomItem.update as unknown as ReturnType<typeof vi.fn>;
const mDeleteMany = prisma.practiceCustomItem.deleteMany as unknown as ReturnType<typeof vi.fn>;
const mAttemptFindMany = prisma.practiceAttempt.findMany as unknown as ReturnType<typeof vi.fn>;

const QUIZ_BODY = {
  mode: "quiz",
  content: "우리 반 규칙은 왜 필요할까요?",
  closure: "open",
  cognitive: "conceptual",
  explanation: "정답이 하나가 아니고 관계를 생각하는 질문이에요.",
};

const post = (body: unknown) =>
  new Request("http://localhost/api/teacher/practice-bank", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const patchReq = (id: string, body: unknown) =>
  [
    new NextRequest(`http://localhost/api/teacher/practice-bank/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
  mFindMany.mockResolvedValue([]);
  mCount.mockResolvedValue(0);
  mCreate.mockImplementation(async ({ data }: { data: object }) => ({ id: "new1", isActive: true, ...data }));
  mUpdate.mockImplementation(async ({ data }: { data: object }) => ({ id: "item1", ...data }));
  mDeleteMany.mockResolvedValue({ count: 1 });
  mAttemptFindMany.mockResolvedValue([]);
});

describe("교사 커스텀 문항 API — 권한", () => {
  it("학생은 403, 비로그인은 401", async () => {
    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    expect((await POST(post(QUIZ_BODY))).status).toBe(403);
    expect((await GET()).status).toBe(403);

    mAuth.mockResolvedValue(null);
    expect((await POST(post(QUIZ_BODY))).status).toBe(401);
  });
});

describe("교사 커스텀 문항 API — 풀이 통계", () => {
  it("시도 기록(정답·오답)으로 문항별 시도·정답·학생 수를 돌려준다", async () => {
    mFindMany.mockResolvedValue([{ id: "cust1", mode: "quiz" }]);
    mAttemptFindMany.mockResolvedValue([
      { itemId: "cust1", studentId: "s1", correct: true },
      { itemId: "cust1", studentId: "s1", correct: false },
      { itemId: "cust1", studentId: "s2", correct: true },
      { itemId: "other", studentId: "s3", correct: true },
    ]);
    const data = await (await GET()).json();
    expect(data.items[0].attemptCount).toBe(3);
    expect(data.items[0].correctCount).toBe(2);
    expect(data.items[0].attemptStudents).toBe(2);
  });
});

describe("교사 커스텀 문항 API — 추가", () => {
  it("본인 teacherId로 문항을 만든다", async () => {
    const res = await POST(post(QUIZ_BODY));
    expect(res.status).toBe(201);
    expect(mCreate).toHaveBeenCalledWith({ data: { teacherId: "t1", ...QUIZ_BODY } });
  });

  it("형식 오류는 400 — 해설 누락", async () => {
    const { explanation: _omit, ...withoutExplanation } = QUIZ_BODY;
    expect((await POST(post(withoutExplanation))).status).toBe(400);
    expect(mCreate).not.toHaveBeenCalled();
  });

  it("교사당 상한(200개)을 넘으면 400", async () => {
    mCount.mockResolvedValue(200);
    expect((await POST(post(QUIZ_BODY))).status).toBe(400);
    expect(mCreate).not.toHaveBeenCalled();
  });
});

describe("교사 커스텀 문항 API — 수정·삭제", () => {
  it("본인 문항이 아니면 404", async () => {
    mFindFirst.mockResolvedValue(null);
    const [req, ctx] = patchReq("other1", QUIZ_BODY);
    expect((await PATCH(req, ctx)).status).toBe(404);
  });

  it("연습 모드는 바꿀 수 없다", async () => {
    mFindFirst.mockResolvedValue({ id: "item1", teacherId: "t1", mode: "transform" });
    const [req, ctx] = patchReq("item1", QUIZ_BODY);
    expect((await PATCH(req, ctx)).status).toBe(400);
    expect(mUpdate).not.toHaveBeenCalled();
  });

  it("사용 여부만 토글할 수 있다", async () => {
    mFindFirst.mockResolvedValue({ id: "item1", teacherId: "t1", mode: "quiz" });
    const [req, ctx] = patchReq("item1", { isActive: false });
    expect((await PATCH(req, ctx)).status).toBe(200);
    expect(mUpdate).toHaveBeenCalledWith({ where: { id: "item1" }, data: { isActive: false } });
  });

  it("삭제는 본인 문항만 — 대상이 없으면 404", async () => {
    mDeleteMany.mockResolvedValue({ count: 0 });
    const req = new NextRequest("http://localhost/api/teacher/practice-bank/x", { method: "DELETE" });
    expect((await DELETE(req, { params: Promise.resolve({ id: "x" }) })).status).toBe(404);
    expect(mDeleteMany).toHaveBeenCalledWith({ where: { id: "x", teacherId: "t1" } });
  });
});

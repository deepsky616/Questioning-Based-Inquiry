import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { question: { findFirst: vi.fn(), findMany: vi.fn() }, questionGrowth: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() }, user: { findUnique: vi.fn() } } }));
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET, PUT } from "@/app/api/question-growth/route";
const request = (body: unknown) => new NextRequest("http://localhost/api/question-growth", { method: "PUT", body: JSON.stringify(body) });
const input = { questionId: "q1", revisedContent: "왜 온도에 따라 녹는 양이 다를까?", reflection: "온도를 같게 하고 비교해야 해요.", revision: 0 };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(auth).mockResolvedValue({ user: { id: "s1", role: "STUDENT" } } as never); });
it("다른 학생의 질문에 성장 기록을 쓸 수 없다", async () => {
  vi.mocked(prisma.question.findFirst).mockResolvedValue(null);
  expect((await PUT(request(input))).status).toBe(404);
  expect(prisma.questionGrowth.create).not.toHaveBeenCalled();
});
it("학생이 다른 학생의 기록을 요청하면 차단한다", async () => {
  expect((await GET(new NextRequest("http://localhost/api/question-growth?studentId=s2"))).status).toBe(403);
});
it("처음 질문은 서버 원문으로 보관하고 다른 탭에서 바뀐 기록을 덮어쓰지 않는다", async () => {
  vi.mocked(prisma.question.findFirst).mockResolvedValue({ id: "q1", content: "소금은 얼마나 녹을까?" } as never);
  vi.mocked(prisma.questionGrowth.create).mockResolvedValue({ questionId: "q1", originalContent: "소금은 얼마나 녹을까?", revisedContent: input.revisedContent, reflection: input.reflection, revision: 1, createdAt: new Date(), updatedAt: new Date() });
  const first = await PUT(request(input));
  expect(first.status).toBe(200);
  expect(prisma.questionGrowth.create).toHaveBeenCalledWith({ data: { questionId: "q1", originalContent: "소금은 얼마나 녹을까?", revisedContent: input.revisedContent, reflection: input.reflection } });
  expect(await first.json()).toMatchObject({ originalContent: "소금은 얼마나 녹을까?", revisedContent: input.revisedContent });
  vi.mocked(prisma.questionGrowth.updateMany).mockResolvedValue({ count: 0 });
  expect((await PUT(request({ ...input, revision: 1 }))).status).toBe(409);
});
it("교사는 성장 기록을 대신 작성할 수 없다", async () => {
  vi.mocked(auth).mockResolvedValue({ user: { id: "t1", role: "TEACHER" } } as never);
  expect((await PUT(request(input))).status).toBe(403);
});
it("담당 학급 교사만 성장 기록을 읽을 수 있다", async () => {
  vi.mocked(auth).mockResolvedValue({ user: { id: "t1", role: "TEACHER" } } as never);
  vi.mocked(prisma.user.findUnique)
    .mockResolvedValueOnce({ role: "TEACHER", school: "질문초등학교", teacherClasses: [{ grade: "5", className: "1" }] } as never)
    .mockResolvedValueOnce({ role: "STUDENT", school: "질문초등학교", grade: "5", className: "2" } as never);
  expect((await GET(new NextRequest("http://localhost/api/question-growth?studentId=s2"))).status).toBe(403);
  expect(prisma.questionGrowth.findMany).not.toHaveBeenCalled();
  vi.mocked(prisma.user.findUnique)
    .mockResolvedValueOnce({ role: "TEACHER", school: "질문초등학교", teacherClasses: [{ grade: "5", className: "1" }] } as never)
    .mockResolvedValueOnce({ role: "STUDENT", school: "질문초등학교", grade: "5", className: "1" } as never);
  vi.mocked(prisma.question.findMany).mockResolvedValue([]);
  vi.mocked(prisma.questionGrowth.findMany).mockResolvedValue([]);
  const response = await GET(new NextRequest("http://localhost/api/question-growth?studentId=s1"));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ questions: [], records: [], canEdit: false });
});

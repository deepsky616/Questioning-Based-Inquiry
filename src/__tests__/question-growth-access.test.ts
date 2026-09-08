import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { question: { findFirst: vi.fn(), findMany: vi.fn() }, questionGrowth: { count: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() }, user: { findUnique: vi.fn() } } }));
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
it("배운 점이 없어도 짧은 돌아보기를 저장하고 원문은 서버 질문을 사용한다", async () => {
  vi.mocked(prisma.question.findFirst).mockResolvedValue({ id: "q1", content: "소금은 얼마나 녹을까?" } as never);
  vi.mocked(prisma.questionGrowth.create).mockResolvedValue({ questionId: "q1", originalContent: "소금은 얼마나 녹을까?", revisedContent: "소금은 얼마나 녹을까?", changeNote: "비교할 조건을 넣었어요.", reflection: "", revision: 1 } as never);
  const response = await PUT(request({ questionId: "q1", changeNote: "비교할 조건을 넣었어요.", revision: 0 }));
  expect(response.status).toBe(200);
  expect(prisma.questionGrowth.create).toHaveBeenCalledWith({ data: { questionId: "q1", originalContent: "소금은 얼마나 녹을까?", revisedContent: "소금은 얼마나 녹을까?", changeNote: "비교할 조건을 넣었어요.", reflection: "" } });
  expect(await response.json()).toMatchObject({ originalContent: "소금은 얼마나 녹을까?", revisedContent: "소금은 얼마나 녹을까?", changeNote: "비교할 조건을 넣었어요.", reflection: "" });
});
it("탐구 후 배운 점만 추가할 때 처음 질문과 돌아보기는 덮어쓰지 않는다", async () => {
  vi.mocked(prisma.question.findFirst).mockResolvedValue({ id: "q1", content: "소금은 얼마나 녹을까?" } as never);
  vi.mocked(prisma.questionGrowth.updateMany).mockResolvedValue({ count: 1 });
  const response = await PUT(request({ questionId: "q1", reflection: "온도를 같게 해야 비교할 수 있어요.", revision: 1 }));
  expect(response.status).toBe(200);
  expect(prisma.questionGrowth.updateMany).toHaveBeenCalledWith({ where: { questionId: "q1", revision: 1 }, data: { reflection: "온도를 같게 해야 비교할 수 있어요.", revision: { increment: 1 } } });
});
it("학생이 다른 학생의 기록을 요청하면 차단한다", async () => {
  expect((await GET(new NextRequest("http://localhost/api/question-growth?studentId=s2"))).status).toBe(403);
});
it("처음 질문은 서버 원문으로 보관하고 다른 탭에서 바뀐 기록을 덮어쓰지 않는다", async () => {
  vi.mocked(prisma.question.findFirst).mockResolvedValue({ id: "q1", content: "소금은 얼마나 녹을까?" } as never);
  vi.mocked(prisma.questionGrowth.create).mockResolvedValue({ questionId: "q1", originalContent: "소금은 얼마나 녹을까?", revisedContent: input.revisedContent, reflection: input.reflection, changeNote: "", revision: 1, createdAt: new Date(), updatedAt: new Date() });
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

it("질문별 조회도 본인 질문으로 제한하고 최근 목록 밖의 질문을 직접 찾는다", async () => {
  vi.mocked(prisma.question.findMany).mockResolvedValue([{ id: "old-q", content: "예전 질문", session: null }] as never);
  vi.mocked(prisma.questionGrowth.findMany).mockResolvedValue([]);
  const response = await GET(new NextRequest("http://localhost/api/question-growth?questionId=old-q"));
  expect(response.status).toBe(200);
  expect(prisma.question.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { authorId: "s1", source: "STUDENT", id: "old-q" } }));
  vi.mocked(prisma.question.findMany).mockResolvedValue([]);
  expect((await GET(new NextRequest("http://localhost/api/question-growth?questionId=someone-else"))).status).toBe(404);
});
it("빈 새 기록과 원문을 바꾸는 요청은 거절한다", async () => {
  vi.mocked(prisma.question.findFirst).mockResolvedValue({ id: "q1", content: "기존 질문" } as never);
  expect((await PUT(request({ questionId: "q1", changeNote: "  ", revision: 0 }))).status).toBe(400);
  expect((await PUT(request({ ...input, originalContent: "바뀐 원문" }))).status).toBe(400);
  expect(prisma.questionGrowth.create).not.toHaveBeenCalled();
});

it("성장 기록이 100개를 넘어도 페이지를 바꾸어 지난 기록을 조회하고 학생·수업 범위를 유지한다", async () => {
  vi.mocked(prisma.questionGrowth.count).mockResolvedValueOnce(105).mockResolvedValueOnce(5).mockResolvedValueOnce(105);
  vi.mocked(prisma.questionGrowth.findMany).mockResolvedValue([{ questionId: "old-105" }] as never);
  const response = await GET(new NextRequest("http://localhost/api/question-growth?view=journal&sessionId=lesson-1&page=14"));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ records: [{ questionId: "old-105" }], pageInfo: { page: 14, pageSize: 8, total: 105, totalPages: 14 }, summary: { total: 105, complete: 5, pending: 100 }, canEdit: true });
  expect(prisma.questionGrowth.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [{ question: { authorId: "s1", source: "STUDENT", sessionId: "lesson-1" } }] }, skip: 104, take: 8 }));
});
it("성장 기록 검색과 작성 상태를 함께 적용하고 다른 학생의 기록은 검색할 수 없다", async () => {
  vi.mocked(prisma.questionGrowth.count).mockResolvedValueOnce(10).mockResolvedValueOnce(3).mockResolvedValueOnce(1);
  vi.mocked(prisma.questionGrowth.findMany).mockResolvedValue([{ questionId: "salt-q" }] as never);
  const response = await GET(new NextRequest("http://localhost/api/question-growth?view=journal&q=소금&status=pending&page=999"));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ pageInfo: { page: 1, total: 1 }, summary: { total: 10, complete: 3, pending: 7 } });
  const args = vi.mocked(prisma.questionGrowth.findMany).mock.calls[0][0];
  expect(args?.where?.AND).toEqual(expect.arrayContaining([{ question: { authorId: "s1", source: "STUDENT" } }, { reflection: "" }]));
  expect(args?.where?.AND).toEqual(expect.arrayContaining([expect.objectContaining({ OR: expect.arrayContaining([{ revisedContent: { contains: "소금", mode: "insensitive" } }]) })]));
  expect((await GET(new NextRequest("http://localhost/api/question-growth?view=journal&studentId=s2"))).status).toBe(403);
});

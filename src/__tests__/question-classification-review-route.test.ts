import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), canEdit: vi.fn(), canView: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ prisma: { questionClassificationReview: { findMany: mocks.findMany } } }));
vi.mock("@/lib/question-detail-service", () => ({ loadQuestionAccessContext: mocks.access, canEditQuestionForUser: mocks.canEdit }));
vi.mock("@/lib/content-visibility", () => ({ canViewQuestion: mocks.canView }));
import { GET } from "@/app/api/questions/[id]/classification-reviews/route";
const get = (page = "1") => GET(new Request(`http://localhost/api/questions/q1/classification-reviews?page=${page}`), { params: Promise.resolve({ id: "q1" }) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "s1" } });
  mocks.access.mockResolvedValue({ viewer: { role: "STUDENT" }, question: { authorId: "s1" } });
  mocks.canView.mockReturnValue(true);
  mocks.findMany.mockResolvedValue([]);
});
it("작성자 본인은 자신의 이력을 페이지별로 읽을 수 있다", async () => {
  mocks.findMany.mockResolvedValue(Array.from({ length: 11 }, (_, i) => ({ id: String(i) })));
  const response = await get("2");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ page: 2, hasMore: true, records: expect.any(Array) });
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { questionId: "q1" }, skip: 10, take: 11 }));
});
it("공개 질문이어도 다른 학생에게 교사의 확인 이유를 공개하지 않는다", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "other" } });
  expect((await get()).status).toBe(403);
  expect(mocks.findMany).not.toHaveBeenCalled();
});
it("교사는 담당 질문을 수정할 권한이 있을 때만 이력을 조회한다", async () => {
  mocks.access.mockResolvedValue({ viewer: { role: "TEACHER" }, question: { authorId: "s1" } });
  mocks.canEdit.mockResolvedValue(false);
  expect((await get()).status).toBe(403);
  mocks.canEdit.mockResolvedValue(true);
  expect((await get()).status).toBe(200);
});
it("로그인과 수업 접근 권한 및 올바른 페이지를 확인한다", async () => {
  expect((await get("-1")).status).toBe(400);
  mocks.canView.mockReturnValue(false);
  expect((await get()).status).toBe(403);
  mocks.auth.mockResolvedValue(null);
  expect((await get()).status).toBe(401);
});

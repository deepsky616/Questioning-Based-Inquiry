import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendQuestionNotificationEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { question: { findMany: vi.fn() }, user: { findUnique: vi.fn() } } }));
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/questions/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: "s1", role: "STUDENT" } } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "s1", role: "STUDENT", school: "한빛초", grade: "5", className: "1" } as never);
});
const row = (id: string, growth: unknown) => ({ id, authorId: "s1", author: { id: "s1", grade: "5" }, session: null, comments: [], likes: [], growth });

it("내 질문마다 두 메모의 실제 작성 여부를 구분하고 원문은 목록에 노출하지 않는다", async () => {
  vi.mocked(prisma.question.findMany).mockResolvedValue([
    row("complete", { changeNote: " 비교할 조건을 넣었어요. ", reflection: "물의 양도 같아야 해요." }),
    row("note-only", { changeNote: "조건을 넣었어요.", reflection: "" }),
    row("reflection-only", { changeNote: "", reflection: "조건을 같게 맞추어요." }),
    row("blank", { changeNote: " \n ", reflection: "배웠어요." }),
    row("missing", null),
  ] as never);
  const response = await GET(new Request("http://localhost/api/questions?authorId=s1"));
  expect(response.status).toBe(200);
  const rows = await response.json();
  expect(rows.map((item: { growthComplete: boolean }) => item.growthComplete)).toEqual([true, false, false, false, false]);
  for (const item of rows) expect(item).not.toHaveProperty("growth");
  expect(prisma.question.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ growth: { select: { changeNote: true, reflection: true } } }) }));
});

it.each(["?authorId=s2", ""])("다른 학생도 보는 목록에서는 성장 기록을 조회하거나 반환하지 않는다: %s", async query => {
  vi.mocked(prisma.question.findMany).mockResolvedValue([row("q1", undefined)] as never);
  const response = await GET(new Request(`http://localhost/api/questions${query}`));
  expect(response.status).toBe(200);
  expect((await response.json())[0]).not.toHaveProperty("growthComplete");
  expect(vi.mocked(prisma.question.findMany).mock.calls[0][0]?.include?.growth).toBeFalsy();
});

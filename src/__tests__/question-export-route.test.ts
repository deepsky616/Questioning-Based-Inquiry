import { beforeEach, expect, it, vi } from "vitest";
import readExcelFile from "read-excel-file/node";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendQuestionNotificationEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  question: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
} }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { __resetRateLimit } from "@/lib/rate-limit";
import { POST } from "@/app/api/questions/export/route";

const mAuth = vi.mocked(auth as () => Promise<unknown>);
const mFind = prisma.question.findMany as unknown as ReturnType<typeof vi.fn>;
const mTeacher = vi.mocked(prisma.user.findUnique);
const question = (id = "q1", studentNumber = "2") => ({
  id, content: "물은 왜 증발할까요?", closure: "open", cognitive: "conceptual",
  session: { date: "2026-07-20", subject: "과학", topic: "물의 변화", targetGrade: "5" },
  author: { id: `student-${studentNumber}`, name: "김질문", grade: "5", className: "1", studentNumber },
  createdAt: new Date("2026-07-20T00:30:00Z"), isPublic: true, flagged: false, flagReason: null as string | null,
  _count: { likes: 12, comments: 123 }, comments: [] as Array<{ id: string }>,
});
const request = (query = "", body: unknown = { scope: "filtered", locale: "ko" }) => new Request(
  `http://localhost/api/questions/export${query}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
);
async function workbook(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  const filename = decodeURIComponent(response.headers.get("Content-Disposition")!);
  expect(filename).toContain(".xlsx");
  const buffer = Buffer.from(await response.arrayBuffer());
  const rows = (await readExcelFile(buffer)).find(sheet => sheet.sheet === "질문 목록")!.data;
  return { buffer, rows, value: (row: number, column: string) => rows[row][rows[0].indexOf(column)] };
}

beforeEach(() => {
  vi.resetAllMocks();
  __resetRateLimit();
  mAuth.mockResolvedValue({ user: { id: "teacher", role: "TEACHER" } });
  mTeacher.mockResolvedValue({ role: "TEACHER", school: "시험초", teacherClasses: [{ grade: "5", className: "1" }] } as never);
  mFind.mockResolvedValue([question()] as never);
});

it.each([
  [null, 401],
  [{ user: { role: "TEACHER" } }, 401],
  [{ user: { id: "student", role: "STUDENT" } }, 403],
])("인증된 교사만 질문을 내려받는다: %j", async (session, status) => {
  mAuth.mockResolvedValue(session);
  expect((await POST(request())).status).toBe(status);
  expect(mFind).not.toHaveBeenCalled();
});

it("소속을 확인할 수 없는 교사에게 파일을 제공하지 않는다", async () => {
  mTeacher.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(403);
  expect(mFind).not.toHaveBeenCalled();
});

it.each([{ scope: "selected", questionIds: [] }, { scope: "unknown" }, { scope: "filtered", questionIds: ["q1"] }])(
  "잘못된 범위 요청은 전체 다운로드로 바꾸지 않는다: %j", async body => {
    expect((await POST(request("", body))).status).toBe(400);
    expect(mFind).not.toHaveBeenCalled();
  },
);

it("페이지 크기와 일반 조회 상한을 넘는 501개 질문을 모두 실제 엑셀 파일에 담는다", async () => {
  const source = Array.from({ length: 501 }, (_, i) => ({ ...question(`q${i}`), content: `증발 관찰 질문 ${i + 1}` }));
  mFind.mockImplementation(async args => source.slice(args?.skip ?? 0, (args?.skip ?? 0) + (args?.take ?? source.length)) as never);
  const { rows, value, buffer } = await workbook(await POST(request("?page=2&pageSize=30")));
  expect(rows).toHaveLength(502);
  expect(value(1, "질문 내용")).toBe("증발 관찰 질문 1");
  expect(value(501, "질문 내용")).toBe("증발 관찰 질문 501");
  expect(value(1, "학생 이름")).toBe("김질문");
  expect(value(1, "좋아요 수")).toBe(12);
  expect(value(1, "댓글 수")).toBe(123);
  expect(value(1, "작성일시 (한국시간)")).toBe("2026-07-20 09:30");
  const info = (await readExcelFile(buffer)).find(sheet => sheet.sheet === "내보내기 정보")!.data;
  expect(info).toContainEqual(["질문 수", 501]);
});

it("목록 필터와 담당 학급 권한을 함께 적용하고 좋아요 순서를 유지한다", async () => {
  await workbook(await POST(request("?date=2026-07-20&subject=과학&topic=증발&search=물&closure=open&cognitive=conceptual&flagged=1&likeSort=desc")));
  const args = mFind.mock.calls[0][0]!;
  expect(args.orderBy).toEqual([{ likes: { _count: "desc" } }, { createdAt: "desc" }, { id: "desc" }]);
  expect(args.where).toMatchObject({ AND: [
    { AND: [
      { AND: [
        { author: { role: "STUDENT", school: "시험초", OR: [{ grade: "5", className: "1" }] },
          session: { date: "2026-07-20", subject: { contains: "과학", mode: "insensitive" }, topic: { contains: "증발", mode: "insensitive" } } },
        { OR: [{ sessionId: null }, { session: { unitDesignId: null } }, { session: { sharedQuestions: { equals: [] } } }] },
      ] },
      { OR: [{ content: { contains: "물", mode: "insensitive" } }, { author: { name: { contains: "물", mode: "insensitive" } } }] },
    ] },
    { closure: "open" }, { cognitive: "conceptual" },
    { OR: [{ flagged: true }, { comments: { some: { flagged: true } } }] },
  ] });
});

it("선택한 질문은 현재 필터 및 권한과 교차해 조회한다", async () => {
  await workbook(await POST(request("?sessionId=lesson&commentSort=asc", { scope: "selected", questionIds: ["q1", "q1"] })));
  expect(mFind.mock.calls[0][0]).toMatchObject({
    where: { AND: [
      { AND: [expect.objectContaining({ sessionId: "lesson", author: expect.objectContaining({ school: "시험초" }) }), expect.any(Object)] },
      { id: { in: ["q1"] } },
    ] },
    orderBy: [{ comments: { _count: "asc" } }, { createdAt: "desc" }, { id: "desc" }],
  });
});

it("삭제되거나 접근할 수 없는 선택 항목을 조용히 누락하지 않는다", async () => {
  const response = await POST(request("", { scope: "selected", questionIds: ["q1", "outside"] }));
  expect(response.status).toBe(409);
  expect(response.headers.get("Content-Disposition")).toBeNull();
});

it("학생 번호를 문자열 순서가 아닌 숫자 순서로 정렬한다", async () => {
  mFind.mockResolvedValue([question("q10", "10"), question("q2", "2")] as never);
  const { value } = await workbook(await POST(request("?studentSort=asc")));
  expect(value(1, "출석번호")).toBe("2");
  expect(value(2, "출석번호")).toBe("10");
});

it("질문 원문의 줄바꿈·특수문자·수식 모양 문자열과 분류 불가 상태를 보존한다", async () => {
  mFind.mockResolvedValue([{ ...question(), content: '=SUM(1,2)\n<&> "물" 💧', closure: "unclassified", cognitive: "unclassified", flagged: true, flagReason: "의미 없는 입력", comments: [{ id: "flagged" }] }] as never);
  const { value } = await workbook(await POST(request()));
  expect(value(1, "질문 내용")).toBe('=SUM(1,2)\n<&> "물" 💧');
  expect(value(1, "질문 형태")).toBe("분류 불가");
  expect(value(1, "질문 유형")).toBe("분류 불가");
  expect(value(1, "부적절 의심 질문")).toBe("있음");
  expect(value(1, "부적절 의심 댓글")).toBe("있음");
});

it("질문이 없으면 빈 파일 대신 안내를 반환한다", async () => {
  mFind.mockResolvedValue([]);
  expect((await POST(request())).status).toBe(404);
});

it("파일 한도를 넘으면 일부만 잘라 저장하지 않고 범위를 좁히도록 안내한다", async () => {
  mFind.mockResolvedValue(Array.from({ length: 10001 }, (_, i) => question(`q${i}`)) as never);
  const response = await POST(request());
  expect(response.status).toBe(413);
  expect(response.headers.get("Content-Disposition")).toBeNull();
});

it("영어 화면에서도 학생 이름과 질문 원문은 그대로 내보낸다", async () => {
  const response = await POST(request("?sessionId=lesson&studentSort=desc", { scope: "filtered", locale: "en" }));
  expect(response.status).toBe(200);
  const sheets = await readExcelFile(Buffer.from(await response.arrayBuffer()));
  const rows = sheets.find(sheet => sheet.sheet === "Questions")!.data;
  expect(rows[1][rows[0].indexOf("Student name")]).toBe("김질문");
  expect(rows[1][rows[0].indexOf("Question")]).toBe("물은 왜 증발할까요?");
  const info = sheets.find(sheet => sheet.sheet === "Export details")!.data;
  expect(info).toContainEqual(["Question lesson", "2026-07-20 · 과학 · 물의 변화"]);
  expect(info).toContainEqual(["Sort", "Student order · Descending"]);
});

it("연속 다운로드 요청이 제한되면 추가 자료를 읽지 않는다", async () => {
  for (let i = 0; i < 10; i++) expect((await POST(request())).status).toBe(200);
  expect((await POST(request())).status).toBe(429);
  expect(mFind).toHaveBeenCalledTimes(10);
});

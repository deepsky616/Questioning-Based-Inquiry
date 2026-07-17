import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendQuestionNotificationEmail: vi.fn() }));
vi.mock("@/lib/db", () => {
  const question = { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn() };
  const user = { findUnique: vi.fn(), findMany: vi.fn() };
  return {
    prisma: {
      question,
      user,
      $transaction: vi.fn((callback) => callback({ question, user })),
    },
  };
});

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { QUESTION_LIST_MAX } from "@/lib/questions";
import { GET } from "@/app/api/questions/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mFindMany = prisma.question.findMany as unknown as ReturnType<typeof vi.fn>;
const mCount = prisma.question.count as unknown as ReturnType<typeof vi.fn>;
const mGroupBy = prisma.question.groupBy as unknown as ReturnType<typeof vi.fn>;
const mUserFind = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mUserFindMany = prisma.user.findMany as unknown as ReturnType<typeof vi.fn>;
const mTransaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

const listReq = (query = "") => new Request(`http://localhost/api/questions${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
  mUserFind.mockResolvedValue({
    role: "TEACHER",
    school: "테스트초",
    teacherClasses: [],
  });
  mFindMany.mockResolvedValue([]);
  mCount.mockResolvedValue(0);
  mGroupBy.mockResolvedValue([]);
});

describe("질문 목록 조회 상한 (누적 무제한 조회 방지)", () => {
  it("전체 조회에도 최근 N건 상한(take)이 항상 걸린다", async () => {
    const res = await GET(listReq());
    expect(res.status).toBe(200);
    expect(mFindMany).toHaveBeenCalledTimes(1);
    const args = mFindMany.mock.calls[0][0];
    expect(args.take).toBe(QUESTION_LIST_MAX);
    expect(args.orderBy).toEqual({ createdAt: "desc" });
  });

  it("세션·필터를 지정해도 상한은 유지된다", async () => {
    await GET(listReq("?sessionId=s1&date=2026-07-08&likeSort=desc"));
    expect(mFindMany.mock.calls[0][0].take).toBe(QUESTION_LIST_MAX);
  });

  it("비로그인 조회는 401", async () => {
    mAuth.mockResolvedValue(null);
    expect((await GET(listReq())).status).toBe(401);
    expect(mFindMany).not.toHaveBeenCalled();
  });

  it("교사 페이지 조회는 30건씩 나누고 댓글 원문 대신 집계와 좋아요 표시 정보를 반환한다", async () => {
    mFindMany.mockResolvedValue([
      {
        id: "q1",
        content: "왜 계절이 바뀔까?",
        closure: "open",
        cognitive: "conceptual",
        closureScore: 0.8,
        cognitiveScore: 0.7,
        sessionId: "s1",
        session: { id: "s1", date: "2026-07-13", subject: "과학", topic: "계절" },
        author: { id: "student-1", name: "학생", grade: "5", className: "2", studentNumber: "1" },
        isPublic: true,
        flagged: false,
        flagReason: null,
        createdAt: new Date("2026-07-13T00:00:00.000Z"),
        _count: { likes: 3, comments: 2 },
        comments: [{ id: "flagged-comment" }],
        likes: [
          { userId: "t1", user: { id: "t1", name: "담당 교사" } },
          { userId: "t2", user: { id: "t2", name: "다른 교사" } },
        ],
      },
    ]);
    mCount.mockResolvedValueOnce(61).mockResolvedValueOnce(4);
    mGroupBy
      .mockResolvedValueOnce([
        { closure: "closed", _count: { _all: 20 } },
        { closure: "open", _count: { _all: 41 } },
      ])
      .mockResolvedValueOnce([
        { cognitive: "factual", _count: { _all: 21 } },
        { cognitive: "conceptual", _count: { _all: 22 } },
        { cognitive: "controversial", _count: { _all: 18 } },
      ]);

    const res = await GET(listReq("?view=page&page=2&pageSize=30&likeSort=desc"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mFindMany.mock.calls[0][0]).toMatchObject({ skip: 30, take: 30 });
    expect(body.pageInfo).toEqual({ page: 2, pageSize: 30, total: 61, totalPages: 3 });
    expect(body.summary).toEqual({
      total: 61,
      closure: { closed: 20, open: 41 },
      cognitive: { factual: 21, conceptual: 22, controversial: 18 },
      flagged: 4,
    });
    expect(body.items[0]).toMatchObject({
      id: "q1",
      likeCount: 3,
      commentCount: 2,
      hasFlaggedComment: true,
      myLike: true,
      likedBy: [
        { id: "t1", name: "담당 교사" },
        { id: "t2", name: "다른 교사" },
      ],
    });
    expect(body.items[0]).not.toHaveProperty("comments");
    expect(body.items[0]).not.toHaveProperty("likes");
    expect(body.items[0]).not.toHaveProperty("_count");
  });

  it("교사 페이지 조회에서 배포 질문 전용 수업을 제외한다", async () => {
    await GET(listReq("?view=page&likeSort=desc"));

    expect(mFindMany.mock.calls[0][0].where).toEqual(expect.objectContaining({
      AND: expect.arrayContaining([
        {
          OR: [
            { sessionId: null },
            { session: { unitDesignId: null } },
            { session: { sharedQuestions: { equals: [] } } },
          ],
        },
      ]),
    }));
  });

  it("학생순 페이지 조회는 전체 질문 후보 대신 학생별 수와 현재 페이지 질문만 읽는다", async () => {
    mGroupBy
      .mockResolvedValueOnce([
        { authorId: "student-2", _count: { _all: 30 } },
        { authorId: "student-1", _count: { _all: 31 } },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mUserFindMany.mockResolvedValue([
      { id: "student-1", grade: "5", className: "1", studentNumber: "2" },
      { id: "student-2", grade: "5", className: "1", studentNumber: "10" },
    ]);

    await GET(listReq("?view=page&page=2&pageSize=30&studentSort=asc"));

    expect(mUserFindMany).toHaveBeenCalledWith({
      where: { id: { in: expect.arrayContaining(["student-1", "student-2"]) } },
      select: { id: true, grade: true, className: true, studentNumber: true },
    });
    expect(mFindMany).toHaveBeenCalled();
    expect(mFindMany.mock.calls.every(([args]) => args.take > 0 && args.take <= 30)).toBe(true);
    expect(mFindMany.mock.calls[0][0].where.AND[1]).toEqual({ authorId: "student-1" });
    expect(mFindMany.mock.calls[1][0].where.AND[1]).toEqual({ authorId: "student-2" });
    expect(mTransaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
    });
  });

  it("교사 페이지 크기는 최대 100건으로 제한하고 학생 역할은 거부한다", async () => {
    await GET(listReq("?view=page&pageSize=999&likeSort=desc"));
    expect(mFindMany.mock.calls[0][0].take).toBe(100);

    vi.clearAllMocks();
    mAuth.mockResolvedValue({ user: { id: "student-1", role: "STUDENT" } });
    const response = await GET(listReq("?view=page"));
    expect(response.status).toBe(403);
  });
});

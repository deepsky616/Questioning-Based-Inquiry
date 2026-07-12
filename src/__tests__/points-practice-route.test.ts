import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/ai", () => ({
  AiKeyMissingError: class AiKeyMissingError extends Error {},
  AiQuotaError: class AiQuotaError extends Error {},
  generateJsonWithMetadata: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    pointLog: { aggregate: vi.fn(), create: vi.fn() },
    user: { update: vi.fn() },
    practiceCustomItem: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateJsonWithMetadata } from "@/lib/ai";
import { __resetRateLimit } from "@/lib/rate-limit";
import { PRACTICE_DAILY_CAP, PRACTICE_POINTS } from "@/lib/practice-points";
import { POST } from "@/app/api/points/practice/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mAggregate = prisma.pointLog.aggregate as unknown as ReturnType<typeof vi.fn>;
const mTx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const mGen = generateJsonWithMetadata as unknown as ReturnType<typeof vi.fn>;
const mCustomFind = prisma.practiceCustomItem.findFirst as unknown as ReturnType<typeof vi.fn>;

const req = (body: unknown) =>
  new Request("http://localhost/api/points/practice", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

// 은행 실제 문항: q01(닫힌·사실적), t01(target open), c01(주제)
const QUIZ_OK = { mode: "quiz", itemId: "q01", quizType: "closure", answer: "closed" };

const aiClassification = (closure: string, cognitive: string) => ({
  data: {
    closure,
    cognitive,
    closureScore: 0.3,
    cognitiveScore: 0.8,
    reasoning: "테스트 근거",
    feedback: "잘했어요",
    improvedExample: "",
    inappropriate: false,
    inappropriateReason: "",
  },
  model: "gemini-2.5-flash",
});

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimit();
  mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
  mAggregate.mockResolvedValue({ _sum: { points: 0 } });
  mTx.mockResolvedValue([]);
  mGen.mockResolvedValue(aiClassification("open", "conceptual"));
  mCustomFind.mockResolvedValue(null);
});

describe("연습 포인트 — 분류 퀴즈", () => {
  it("서버가 은행으로 재검증해 정답이면 지급한다", async () => {
    const res = await POST(req(QUIZ_OK));
    const data = await res.json();
    expect(data.correct).toBe(true);
    expect(data.awarded).toBe(PRACTICE_POINTS.QUIZ_CORRECT);
    expect(mTx).toHaveBeenCalledTimes(1);
  });

  it("클라이언트가 정답이라고 주장해도 은행과 다르면 지급하지 않는다", async () => {
    const res = await POST(req({ ...QUIZ_OK, answer: "open" }));
    const data = await res.json();
    expect(data.correct).toBe(false);
    expect(data.awarded).toBe(0);
    expect(mTx).not.toHaveBeenCalled();
  });

  it("존재하지 않는 문항은 400", async () => {
    expect((await POST(req({ ...QUIZ_OK, itemId: "없는문항" }))).status).toBe(400);
  });

  it("같은 문항 재도전은 unique 충돌(P2002)로 재지급되지 않는다", async () => {
    mTx.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }),
    );
    const data = await (await POST(req(QUIZ_OK))).json();
    expect(data.awarded).toBe(0);
    expect(data.alreadyAwarded).toBe(true);
  });

  it("하루 상한에 도달하면 지급하지 않는다", async () => {
    mAggregate.mockResolvedValue({ _sum: { points: PRACTICE_DAILY_CAP } });
    const data = await (await POST(req(QUIZ_OK))).json();
    expect(data.awarded).toBe(0);
    expect(data.capped).toBe(true);
    expect(mTx).not.toHaveBeenCalled();
  });

  it("교사 계정은 판정만 받고 지급은 없다", async () => {
    mAuth.mockResolvedValue({ user: { id: "t1", role: "TEACHER" } });
    const data = await (await POST(req(QUIZ_OK))).json();
    expect(data.correct).toBe(true);
    expect(data.awarded).toBe(0);
    expect(mTx).not.toHaveBeenCalled();
  });
});

describe("연습 포인트 — 질문 바꾸기·만들기 (서버 AI 판정)", () => {
  it("목표 유형 달성 시 지급하고 분류 결과를 돌려준다", async () => {
    const res = await POST(req({ mode: "transform", itemId: "t01", content: "주인공의 행동이 어떤 결과를 가져올까요?" }));
    const data = await res.json();
    expect(data.achieved).toBe(true);
    expect(data.awarded).toBe(PRACTICE_POINTS.TARGET_ACHIEVED);
    expect(data.classification.closure).toBe("open");
  });

  it("목표 미달성이면 지급 없이 분류·피드백만 돌려준다", async () => {
    mGen.mockResolvedValue(aiClassification("closed", "factual"));
    const data = await (await POST(req({ mode: "transform", itemId: "t01", content: "주인공 이름이 뭐야?" }))).json();
    expect(data.achieved).toBe(false);
    expect(data.awarded).toBe(0);
    expect(mTx).not.toHaveBeenCalled();
  });

  it("부적절 판정이면 목표 유형이어도 지급하지 않는다", async () => {
    mGen.mockResolvedValue({
      ...aiClassification("open", "controversial"),
      data: { ...aiClassification("open", "controversial").data, inappropriate: true, inappropriateReason: "비속어" },
    });
    const data = await (await POST(req({ mode: "create", topicId: "c01", target: "controversial", content: "나쁜 질문" }))).json();
    expect(data.achieved).toBe(false);
    expect(data.awarded).toBe(0);
  });

  it("만들기: 논쟁적 목표에 개념적 질문이면 미달성이다", async () => {
    mGen.mockResolvedValue(aiClassification("open", "conceptual"));
    const data = await (await POST(req({ mode: "create", topicId: "c01", target: "controversial", content: "문화유산은 무엇을 보여줄까?" }))).json();
    expect(data.achieved).toBe(false);
    expect(data.awarded).toBe(0);
  });

  it("비로그인은 401, 형식 오류는 400", async () => {
    mAuth.mockResolvedValue(null);
    expect((await POST(req(QUIZ_OK))).status).toBe(401);

    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    expect((await POST(req({ mode: "quiz" }))).status).toBe(400);
  });
});

describe("연습 포인트 — 교사 커스텀 문항", () => {
  const CUSTOM_QUIZ_ROW = {
    id: "cust1",
    mode: "quiz",
    content: "우리 반 규칙은 왜 필요할까요?",
    closure: "open",
    cognitive: "conceptual",
    explanation: "정답이 하나가 아니고 관계를 생각하는 질문이에요.",
    source: null, target: null, hint: null, example: null, title: null, passage: null,
  };

  it("내장 은행에 없는 문항 id는 커스텀 문항에서 찾아 채점·지급한다", async () => {
    mCustomFind.mockResolvedValue(CUSTOM_QUIZ_ROW);
    const data = await (await POST(req({ mode: "quiz", itemId: "cust1", quizType: "closure", answer: "open" }))).json();
    expect(mCustomFind).toHaveBeenCalledWith({ where: { id: "cust1", mode: "quiz", isActive: true } });
    expect(data.correct).toBe(true);
    expect(data.awarded).toBe(PRACTICE_POINTS.QUIZ_CORRECT);
  });

  it("커스텀 문항 오답은 지급하지 않는다", async () => {
    mCustomFind.mockResolvedValue(CUSTOM_QUIZ_ROW);
    const data = await (await POST(req({ mode: "quiz", itemId: "cust1", quizType: "closure", answer: "closed" }))).json();
    expect(data.correct).toBe(false);
    expect(mTx).not.toHaveBeenCalled();
  });

  it("비활성·미존재 커스텀 문항은 400", async () => {
    mCustomFind.mockResolvedValue(null);
    expect((await POST(req({ mode: "quiz", itemId: "cust-none", quizType: "closure", answer: "open" }))).status).toBe(400);
  });

  it("커스텀 바꾸기 문항은 DB의 목표 유형으로 판정한다", async () => {
    mCustomFind.mockResolvedValue({
      ...CUSTOM_QUIZ_ROW,
      id: "cust2", mode: "transform", content: null, closure: null, cognitive: null, explanation: null,
      source: "우리 반 규칙은 몇 개인가요?", target: "controversial",
      hint: "찬반이 갈리는 상황을 만들어 보세요.", example: "규칙이 많은 반과 적은 반, 어느 쪽이 좋을까요?",
    });
    mGen.mockResolvedValue(aiClassification("open", "controversial"));
    const data = await (await POST(req({ mode: "transform", itemId: "cust2", content: "규칙을 학생이 정해야 할까요?" }))).json();
    expect(data.achieved).toBe(true);
    expect(data.awarded).toBe(PRACTICE_POINTS.TARGET_ACHIEVED);
  });
});

describe("연습 포인트 — AI 실시간 출제 문항", () => {
  const mCreate = prisma.pointLog.create as unknown as ReturnType<typeof vi.fn>;

  it("transform-ai: 목표 달성 시 원문 해시 기반 키로 지급한다", async () => {
    mTx.mockImplementation(async (ops: unknown[]) => ops);
    const res = await POST(req({
      mode: "transform-ai",
      source: "우리나라의 수도는 어디인가요?",
      target: "open",
      content: "수도가 서울이 아니었다면 우리 생활은 어떻게 달라졌을까요?",
    }));
    const data = await res.json();
    expect(data.achieved).toBe(true);
    expect(data.awarded).toBe(PRACTICE_POINTS.TARGET_ACHIEVED);
    const roomCode = mCreate.mock.calls[0][0].data.roomCode as string;
    expect(roomCode).toMatch(/^transform:ai-[0-9a-f]{16}:\d{4}-\d{2}-\d{2}$/);
  });

  it("create-ai: 같은 제시문·목표는 같은 중복 방지 키를 갖는다(하루 1회)", async () => {
    mTx.mockImplementation(async (ops: unknown[]) => ops);
    const body = {
      mode: "create-ai",
      passage: "우리 동네 시장에는 오래된 가게가 많아요. 최근 큰 마트가 생기면서 시장을 찾는 사람이 줄었어요.",
      target: "conceptual",
      content: "마트가 생긴 것과 시장 손님이 줄어든 것은 어떤 관계가 있을까요?",
    };
    await POST(req(body));
    const first = mCreate.mock.calls[0][0].data.roomCode;
    mCreate.mockClear();
    await POST(req(body));
    expect(mCreate.mock.calls[0][0].data.roomCode).toBe(first);
  });

  it("transform-ai: 원문 누락 등 형식 오류는 400", async () => {
    expect((await POST(req({ mode: "transform-ai", target: "open", content: "질문" }))).status).toBe(400);
  });
});

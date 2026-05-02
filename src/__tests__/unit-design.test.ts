import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted로 생성자 mock을 팩토리 밖에서 접근 가능하게 선언
const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    systemConfig: { findUnique: vi.fn() },
    questionSession: { create: vi.fn() },
  },
}));
vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(function () {
    return {
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    };
  }),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET, POST } from "@/app/api/unit-design/route";
import { DELETE } from "@/app/api/unit-design/[id]/route";
import { POST as createSessionFromDesign } from "@/app/api/unit-design/[id]/session/route";
import { POST as generatePOST } from "@/app/api/unit-design/generate/route";
import { buildPrompt } from "@/lib/unit-design-prompt";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockQueryRaw = prisma.$queryRaw as ReturnType<typeof vi.fn>;
const mockQueryRawUnsafe = prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>;
const mockExecRaw = prisma.$executeRawUnsafe as ReturnType<typeof vi.fn>;
const mockSessionCreate = prisma.questionSession.create as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.systemConfig.findUnique as ReturnType<typeof vi.fn>;

const TEACHER_SESSION = { user: { id: "teacher-1", role: "TEACHER" } };
const STUDENT_SESSION = { user: { id: "student-1", role: "STUDENT" } };

function makeRequest(body?: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/unit-design", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeDeleteRequest(id: string): [Request, { params: { id: string } }] {
  return [
    new Request(`http://localhost/api/unit-design/${id}`, { method: "DELETE" }),
    { params: { id } },
  ];
}

function makeDesignSessionRequest(
  id: string,
  body: unknown,
): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/unit-design/${id}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── GET /api/unit-design ─────────────────────────────────────────────────────

describe("GET /api/unit-design — 단원 설계 목록", () => {
  it("세션이 없으면 401을 반환한다", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/unit-design"));
    expect(res.status).toBe(401);
  });

  it("교사 세션이면 단원 설계 목록을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([
      {
        id: "ud-1",
        title: "광합성 단원",
        subject: "과학",
        grade_range: "3-4",
        area: "생명과학",
        inquiry_questions: [{ type: "factual", content: "광합성이 일어나는 장소는 어디인가?" }],
        created_at: new Date("2026-04-01"),
      },
    ]);

    const res = await GET(new Request("http://localhost/api/unit-design"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("ud-1");
    expect(body[0].gradeRange).toBe("3-4");
    expect(body[0].inquiryQuestions).toEqual([
      { type: "factual", content: "광합성이 일어나는 장소는 어디인가?" },
    ]);
  });

  it("단원 설계가 없으면 빈 배열을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/unit-design"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});

// ─── POST /api/unit-design ────────────────────────────────────────────────────

const VALID_DESIGN = {
  title: "광합성과 에너지",
  subject: "과학",
  gradeRange: "3-4",
  area: "생명과학",
  coreIdea: "식물은 빛 에너지를 이용해 유기물을 합성한다",
  selectedKeywords: ["광합성", "엽록체", "에너지 전환"],
  coreSentences: ["식물은 빛 에너지를 이용해 포도당을 만든다"],
  essentialQuestions: ["생물은 어떻게 에너지를 얻고 활용하는가?"],
  inquiryQuestions: [{ type: "factual", content: "광합성이 일어나는 장소는 어디인가?" }],
};

describe("POST /api/unit-design — 단원 설계 저장", () => {
  it("세션이 없으면 401을 반환한다", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest(VALID_DESIGN));
    expect(res.status).toBe(401);
  });

  it("학생 역할이면 403을 반환한다", async () => {
    mockAuth.mockResolvedValue(STUDENT_SESSION);
    const res = await POST(makeRequest(VALID_DESIGN));
    expect(res.status).toBe(403);
  });

  it("유효한 데이터로 저장하면 ok와 designId를 반환하고 세션은 자동 생성하지 않는다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRawUnsafe.mockResolvedValue([{ id: "ud-new" }]);

    const res = await POST(makeRequest(VALID_DESIGN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.designId).toBe("ud-new");
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("탐구 질문이 없으면 세션을 생성하지 않는다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRawUnsafe.mockResolvedValue([{ id: "ud-no-inquiry" }]);

    const res = await POST(makeRequest({ ...VALID_DESIGN, inquiryQuestions: [] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.designId).toBe("ud-no-inquiry");
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("title이 빈 문자열이면 400을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    const res = await POST(makeRequest({ ...VALID_DESIGN, title: "" }));
    expect(res.status).toBe(400);
  });

  it("inquiryQuestions 형식이 잘못되면 400을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    const res = await POST(makeRequest({ ...VALID_DESIGN, inquiryQuestions: ["잘못된형식"] }));
    expect(res.status).toBe(400);
  });

  it("curriculumAreaId가 없어도 저장된다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRawUnsafe.mockResolvedValue([{ id: "ud-no-area" }]);
    mockSessionCreate.mockResolvedValue({ id: "qs-no-area" });

    const res = await POST(makeRequest({ ...VALID_DESIGN, curriculumAreaId: undefined }));
    expect(res.status).toBe(200);
  });
});

// ─── DELETE /api/unit-design/[id] ────────────────────────────────────────────

describe("DELETE /api/unit-design/[id] — 단원 설계 삭제", () => {
  it("세션이 없으면 401을 반환한다", async () => {
    mockAuth.mockResolvedValue(null);
    const [req, ctx] = makeDeleteRequest("ud-1");
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(401);
  });

  it("소유자가 아니면 403을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([{ teacher_id: "other-teacher" }]);

    const [req, ctx] = makeDeleteRequest("ud-1");
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(403);
  });

  it("데이터가 없으면 403을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([]);

    const [req, ctx] = makeDeleteRequest("nonexistent");
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(403);
  });

  it("소유자이면 삭제 후 ok를 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([{ teacher_id: "teacher-1" }]);
    mockExecRaw.mockResolvedValue(undefined);

    const [req, ctx] = makeDeleteRequest("ud-1");
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

// ─── POST /api/unit-design/[id]/session ──────────────────────────────────────

describe("POST /api/unit-design/[id]/session — 저장된 탐구질문 세션 생성", () => {
  const SAVED_DESIGN = {
    id: "ud-1",
    teacher_id: "teacher-1",
    title: "광합성과 에너지",
    subject: "과학",
    inquiry_questions: [
      { type: "factual", content: "광합성이 일어나는 장소는 어디인가?" },
      { type: "conceptual", content: "광합성과 호흡은 어떻게 다른가?" },
    ],
  };

  it("세션이 없으면 401을 반환한다", async () => {
    mockAuth.mockResolvedValue(null);
    const [req, ctx] = makeDesignSessionRequest("ud-1", {
      date: "2026-05-10",
      sharedQuestions: [SAVED_DESIGN.inquiry_questions[0]],
    });

    const res = await createSessionFromDesign(req, ctx);
    expect(res.status).toBe(401);
  });

  it("학생 역할이면 403을 반환한다", async () => {
    mockAuth.mockResolvedValue(STUDENT_SESSION);
    const [req, ctx] = makeDesignSessionRequest("ud-1", {
      date: "2026-05-10",
      sharedQuestions: [SAVED_DESIGN.inquiry_questions[0]],
    });

    const res = await createSessionFromDesign(req, ctx);
    expect(res.status).toBe(403);
  });

  it("저장된 설계의 소유자가 아니면 403을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([{ ...SAVED_DESIGN, teacher_id: "other-teacher" }]);
    const [req, ctx] = makeDesignSessionRequest("ud-1", {
      date: "2026-05-10",
      sharedQuestions: [SAVED_DESIGN.inquiry_questions[0]],
    });

    const res = await createSessionFromDesign(req, ctx);
    expect(res.status).toBe(403);
  });

  it("저장된 탐구질문 중 선택한 질문만 원하는 날짜의 수업 세션으로 생성한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([SAVED_DESIGN]);
    mockSessionCreate.mockResolvedValue({
      id: "qs-1",
      date: "2026-05-10",
      subject: "과학",
      topic: "광합성과 에너지",
      sharedQuestions: [SAVED_DESIGN.inquiry_questions[1]],
    });

    const [req, ctx] = makeDesignSessionRequest("ud-1", {
      date: "2026-05-10",
      topic: "광합성 탐구 수업",
      defaultQuestionPublic: true,
      sharedQuestions: [SAVED_DESIGN.inquiry_questions[1]],
    });

    const res = await createSessionFromDesign(req, ctx);
    expect(res.status).toBe(201);
    expect(mockSessionCreate).toHaveBeenCalledWith({
      data: {
        date: "2026-05-10",
        subject: "과학",
        topic: "광합성 탐구 수업",
        teacherId: "teacher-1",
        unitDesignId: "ud-1",
        sharedQuestions: [SAVED_DESIGN.inquiry_questions[1]],
        defaultQuestionPublic: true,
      },
    });
  });

  it("저장된 탐구질문에 없는 질문은 400을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([SAVED_DESIGN]);
    const [req, ctx] = makeDesignSessionRequest("ud-1", {
      date: "2026-05-10",
      sharedQuestions: [{ type: "factual", content: "임의 질문" }],
    });

    const res = await createSessionFromDesign(req, ctx);
    expect(res.status).toBe(400);
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("선택한 탐구질문이 없으면 400을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([SAVED_DESIGN]);
    const [req, ctx] = makeDesignSessionRequest("ud-1", {
      date: "2026-05-10",
      sharedQuestions: [],
    });

    const res = await createSessionFromDesign(req, ctx);
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/unit-design/generate ──────────────────────────────────────────

const GENERATE_BASE = {
  subject: "과학",
  gradeRange: "3-4",
  area: "생명과학",
  coreIdea: "식물은 빛 에너지를 이용해 유기물을 합성한다",
  knowledgeItems: ["광합성", "엽록체"],
  processItems: ["관찰", "분류"],
  valueItems: ["생명 존중"],
  achievements: [{ code: "4과03-01", content: "광합성 과정을 설명한다" }],
  selectedKeywords: [],
  coreSentences: [],
  essentialQuestions: [],
};

const PROMPT_BASE = {
  ...GENERATE_BASE,
  achievements: [{ code: "[4과03-01]", content: "광합성 과정을 설명한다" }],
  selectedContentItems: [],
  achievementExplanations: {},
  achievementConsiderations: [],
  context: undefined,
};

function setAiResponse(text: string) {
  mockGenerateContent.mockResolvedValue({ response: { text: () => text } });
}

describe("POST /api/unit-design/generate — AI 생성", () => {
  it("세션이 없으면 401을 반환한다", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await generatePOST(makeRequest({ ...GENERATE_BASE, step: "keywords" }));
    expect(res.status).toBe(401);
  });

  it("학생 역할이면 403을 반환한다", async () => {
    mockAuth.mockResolvedValue(STUDENT_SESSION);
    const res = await generatePOST(makeRequest({ ...GENERATE_BASE, step: "keywords" }));
    expect(res.status).toBe(403);
  });

  it("API 키가 없으면 400을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockFindUnique.mockResolvedValue(null);

    const res = await generatePOST(makeRequest({ ...GENERATE_BASE, step: "keywords" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("API 키");
  });

  it("keywords 단계: AI 응답에서 핵심어 배열을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockFindUnique
      .mockResolvedValueOnce({ value: "test-api-key" })
      .mockResolvedValueOnce({ value: "gemini-2.0-flash" });

    setAiResponse('{"keywords": ["광합성", "엽록체", "에너지 전환"]}');

    const res = await generatePOST(makeRequest({ ...GENERATE_BASE, step: "keywords" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keywords).toEqual(["광합성", "엽록체", "에너지 전환"]);
  });

  it("sentences 단계: AI 응답에서 핵심 문장 배열을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockFindUnique
      .mockResolvedValueOnce({ value: "test-api-key" })
      .mockResolvedValueOnce(null);

    setAiResponse('{"sentences": ["식물은 빛 에너지를 이용해 포도당을 만든다"]}');

    const res = await generatePOST(
      makeRequest({ ...GENERATE_BASE, step: "sentences", selectedKeywords: ["광합성"] })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sentences).toHaveLength(1);
  });

  it("questions 단계: AI 응답에서 핵심 질문 배열을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockFindUnique
      .mockResolvedValueOnce({ value: "test-api-key" })
      .mockResolvedValueOnce(null);

    setAiResponse('{"questions": ["생물은 어떻게 에너지를 얻는가?"]}');

    const res = await generatePOST(
      makeRequest({ ...GENERATE_BASE, step: "questions", coreSentences: ["식물은 빛 에너지를 이용한다"] })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toHaveLength(1);
  });

  it("inquiry 단계: AI 응답에서 탐구 질문 배열을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockFindUnique
      .mockResolvedValueOnce({ value: "test-api-key" })
      .mockResolvedValueOnce(null);

    setAiResponse(
      '{"inquiryQuestions": [{"type": "factual", "content": "광합성이 일어나는 장소는?"}, {"type": "conceptual", "content": "광합성과 호흡의 차이는?"}]}'
    );

    const res = await generatePOST(
      makeRequest({
        ...GENERATE_BASE,
        step: "inquiry",
        essentialQuestions: ["생물은 어떻게 에너지를 얻는가?"],
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inquiryQuestions).toHaveLength(2);
    expect(body.inquiryQuestions[0].type).toBe("factual");
  });

  it("AI 응답에서 JSON을 파싱할 수 없으면 500을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockFindUnique
      .mockResolvedValueOnce({ value: "test-api-key" })
      .mockResolvedValueOnce(null);

    setAiResponse("JSON이 아닌 응답입니다");

    const res = await generatePOST(makeRequest({ ...GENERATE_BASE, step: "keywords" }));
    expect(res.status).toBe(500);
  });

  it("step 값이 유효하지 않으면 400을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    const res = await generatePOST(makeRequest({ ...GENERATE_BASE, step: "invalid" }));
    expect(res.status).toBe(400);
  });
});

describe("unit-design prompt — 선택 성취기준 맥락", () => {
  it("keywords 단계는 선택한 성취기준의 해설만 포함한다", () => {
    const prompt = buildPrompt({
      ...PROMPT_BASE,
      step: "keywords",
      achievementExplanations: {
        "[4과03-01]": "광합성은 빛 에너지 전환 관점에서 다룬다.",
        "[4과03-99]": "선택하지 않은 성취기준 해설",
      },
      achievementConsiderations: ["실험 안전과 생명 존중을 함께 고려한다."],
    });

    expect(prompt).toContain("[선택 성취기준 해설]");
    expect(prompt).toContain("광합성은 빛 에너지 전환 관점");
    expect(prompt).toContain("실험 안전과 생명 존중");
    expect(prompt).not.toContain("선택하지 않은 성취기준 해설");
  });

  it("핵심 질문과 탐구 질문 단계도 선택 성취기준 기반 맥락을 포함한다", () => {
    const questionsPrompt = buildPrompt({
      ...PROMPT_BASE,
      step: "questions",
      coreSentences: ["식물은 빛 에너지를 생명 활동에 필요한 물질로 전환한다."],
      achievementExplanations: {
        "[4과03-01]": "광합성을 에너지 전환과 연결한다.",
      },
    });
    const inquiryPrompt = buildPrompt({
      ...PROMPT_BASE,
      step: "inquiry",
      essentialQuestions: ["생물은 어떻게 에너지를 얻고 활용하는가?"],
      achievementConsiderations: ["학생의 관찰 경험과 연결한다."],
    });

    expect(questionsPrompt).toContain("[선택 성취기준 기반 맥락]");
    expect(questionsPrompt).toContain("광합성을 에너지 전환과 연결한다.");
    expect(inquiryPrompt).toContain("[선택 성취기준 기반 맥락]");
    expect(inquiryPrompt).toContain("학생의 관찰 경험과 연결한다.");
  });
});

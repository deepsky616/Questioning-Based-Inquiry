import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted로 생성자 mock을 팩토리 밖에서 접근 가능하게 선언
const mockGenerateContent = vi.hoisted(() => vi.fn());
const aiState = vi.hoisted(() => ({ apiKey: "test-api-key" as string | null, model: "gemini-2.5-flash" }));

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/resolve-ai-config", () => ({
  resolveUserAiConfig: vi.fn(async () => ({ ...aiState })),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    $transaction: vi.fn(),
    systemConfig: { findUnique: vi.fn() },
    questionSession: { create: vi.fn() },
    question: { create: vi.fn() },
  },
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET, POST } from "@/app/api/unit-design/route";
import { DELETE, PATCH } from "@/app/api/unit-design/[id]/route";
import { POST as createSessionFromDesign } from "@/app/api/unit-design/[id]/session/route";
import { POST as generatePOST } from "@/app/api/unit-design/generate/route";
import { buildPrompt } from "@/lib/unit-design-prompt";
import { __resetRateLimit } from "@/lib/rate-limit";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockQueryRaw = prisma.$queryRaw as ReturnType<typeof vi.fn>;
const mockQueryRawUnsafe = prisma.$queryRawUnsafe as ReturnType<typeof vi.fn>;
const mockExecRaw = prisma.$executeRawUnsafe as ReturnType<typeof vi.fn>;
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
const mockUserFindUnique = prisma.user.findUnique as ReturnType<typeof vi.fn>;
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

function makeDeleteRequest(id: string): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/unit-design/${id}`, { method: "DELETE" }),
    { params: Promise.resolve({ id }) },
  ];
}

function makePatchRequest(
  id: string,
  body: unknown,
): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/unit-design/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
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
  __resetRateLimit();
  aiState.apiKey = "test-api-key";
  mockUserFindUnique.mockResolvedValue({
    role: "TEACHER",
    school: "한빛초",
    teacherClasses: [{ grade: "5", className: "1" }],
  });
  mockTransaction.mockImplementation(async (callback) => callback(prisma));
});

// ─── GET /api/unit-design ─────────────────────────────────────────────────────

describe("GET /api/unit-design — 탐구 질문 목록", () => {
  it("세션이 없으면 401을 반환한다", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/unit-design"));
    expect(res.status).toBe(401);
  });

  it("교사 세션이면 탐구 질문 목록을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([
      {
        id: "ud-1",
        title: "광합성 단원",
        subject: "과학",
        grade_range: "3-4",
        area: "생명과학",
        selected_achievements: [{
          code: "[4과05-01]",
          content: "식물의 생활을 관찰하고 특징을 설명할 수 있다.",
        }],
        learning_guides: {
          coreIdea: { explanation: "식물이 빛을 이용하는 큰 원리를 알아봐요.", lifeConnection: "화분을 떠올려 보세요.", keywords: [] },
          coreSentences: [],
          essentialQuestions: [],
        },
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
    expect(body[0].achievements).toEqual([{
      code: "[4과05-01]",
      content: "식물의 생활을 관찰하고 특징을 설명할 수 있다.",
    }]);
    expect(body[0].inquiryQuestions).toEqual([
      { type: "factual", content: "광합성이 일어나는 장소는 어디인가?" },
    ]);
    expect(body[0].learningGuides.coreIdea.explanation).toContain("큰 원리");
  });

  it("탐구 질문가 없으면 빈 배열을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([]);

    const res = await GET(new Request("http://localhost/api/unit-design"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});

// ─── POST /api/unit-design ────────────────────────────────────────────────────

const LEARNING_GUIDES = {
  coreIdea: {
    explanation: "식물이 빛을 이용하는 큰 원리를 알아봐요.",
    lifeConnection: "화분이 햇빛 쪽으로 자라는 모습을 떠올려 보세요.",
    keywords: [{ term: "광합성", meaning: "빛으로 양분을 만드는 과정" }],
  },
  achievements: [],
  coreSentences: [{ index: 0, explanation: "식물이 빛으로 필요한 물질을 만들어요." }],
  essentialQuestions: [{ index: 0, thinkingFocus: "에너지를 얻는 방법을 살펴봐요.", perspectives: ["원인", "변화"] }],
};

const VALID_DESIGN = {
  title: "광합성과 에너지",
  subject: "과학",
  gradeRange: "3-4",
  area: "생명과학",
  coreIdea: "식물은 빛 에너지를 이용해 유기물을 합성한다",
  achievements: [{
    code: "[4과05-01]",
    content: "식물의 생활을 관찰하고 특징을 설명할 수 있다.",
  }],
  selectedKeywords: ["광합성", "엽록체", "에너지 전환"],
  coreSentences: ["식물은 빛 에너지를 이용해 포도당을 만든다"],
  essentialQuestions: ["생물은 어떻게 에너지를 얻고 활용하는가?"],
  learningGuides: LEARNING_GUIDES,
  inquiryQuestions: [{ type: "factual" as const, content: "광합성이 일어나는 장소는 어디인가?" }],
};

const COMPLETE_GENERATED_GUIDES = {
  learningGuides: {
    coreIdea: {
      explanation: "핵심 아이디어를 쉽게 풀어요.",
      lifeConnection: "학교 화단을 떠올려요.",
      keywords: [
        { term: "생태계", meaning: "생물과 환경이 관계를 맺는 체계" },
        { term: "광합성", meaning: "식물이 빛으로 양분을 만드는 과정" },
        { term: "먹이 사슬", meaning: "먹고 먹히는 관계의 연결" },
      ],
    },
    achievements: [{
      index: 0,
      explanation: "식물의 생활을 관찰하고 특징을 설명하는 목표를 쉽게 풀어요.",
    }],
    coreSentences: [{ index: 0, explanation: "핵심 문장을 쉽게 풀어요." }],
    essentialQuestions: [{
      index: 0,
      thinkingFocus: "관계와 변화를 살펴봐요.",
      perspectives: ["관계", "변화"],
    }],
  },
  guides: [{
    index: 0,
    meaning: "질문이 묻는 뜻을 쉽게 풀어요.",
    keywords: [
      { term: "생산자", meaning: "스스로 양분을 만드는 생물" },
      { term: "에너지", meaning: "생물이 살아가는 데 필요한 힘" },
    ],
    thinkingStart: "식물이 양분을 만드는 과정을 살펴봐요.",
  }],
};

describe("POST /api/unit-design — 탐구 질문 저장", () => {
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

  it("유효한 데이터로 저장하면 같은 설계 식별값과 날짜를 반환하고 대상과 공개 설정을 보존한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    const createdAt = new Date("2026-07-13T00:00:00.000Z");
    const updatedAt = new Date("2026-07-13T00:00:01.000Z");
    mockQueryRawUnsafe.mockResolvedValue([{ id: "ud-new", created_at: createdAt, updated_at: updatedAt }]);

    const input = {
      ...VALID_DESIGN,
      grade: "5",
      sessionDate: "2026-07-20",
      isActive: false,
      defaultQuestionPublic: false,
      likesVisibleToPeers: true,
      commentsVisibleToPeers: false,
      targetClassValue: "class:5:1",
      targetStudentIds: ["student-1"],
    };

    const res = await POST(makeRequest(input));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.designId).toBe("ud-new");
    expect(body.design).toMatchObject({
      id: body.designId,
      grade: "5",
      sessionDate: "2026-07-20",
      achievements: VALID_DESIGN.achievements,
    });
    const savedArguments = mockQueryRawUnsafe.mock.calls[0].slice(1);
    expect(JSON.parse(savedArguments[8] as string)).toEqual(VALID_DESIGN.achievements);
    expect(JSON.parse(savedArguments[12] as string)).toEqual(LEARNING_GUIDES);
    expect(savedArguments.slice(13)).toEqual([
      "5",
      "2026-07-20",
      false,
      false,
      true,
      false,
      "class:5:1",
      JSON.stringify(["student-1"]),
    ]);
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

describe("PATCH /api/unit-design/[id] — 탐구 질문 수정", () => {
  it("성취기준 번호와 내용을 함께 수정한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([{ teacher_id: "teacher-1" }]);
    mockQueryRawUnsafe.mockResolvedValue([{ updated_at: new Date("2026-07-27T00:00:00.000Z") }]);
    const achievements = [{
      code: "[4과05-02]",
      content: "식물의 생김새와 생활 방식이 환경과 관련되어 있음을 설명할 수 있다.",
    }];

    const [req, ctx] = makePatchRequest("ud-1", { achievements });
    const res = await PATCH(req, ctx);

    expect(res.status).toBe(200);
    expect(mockQueryRawUnsafe.mock.calls[0][0]).toContain("selected_achievements = $1::jsonb");
    expect(JSON.parse(mockQueryRawUnsafe.mock.calls[0][1] as string)).toEqual(achievements);
  });
});

// ─── DELETE /api/unit-design/[id] ────────────────────────────────────────────

describe("DELETE /api/unit-design/[id] — 탐구 질문 삭제", () => {
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
      {
        type: "factual",
        content: "광합성이 일어나는 장소는 어디인가?",
        studentGuide: {
          meaning: "광합성이 일어나는 식물의 기관을 찾는 질문이에요.",
          keywords: [],
          thinkingStart: "잎과 줄기의 역할을 살펴보세요.",
        },
      },
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
      unitDesignId: "ud-1",
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
    const body = await res.json();
    expect(body).toMatchObject({ id: "qs-1", unitDesignId: "ud-1" });
    expect(mockSessionCreate).toHaveBeenCalledWith({
      data: {
        date: "2026-05-10",
        subject: "과학",
        topic: "광합성 탐구 수업",
        teacherId: "teacher-1",
        unitDesignId: "ud-1",
        sharedQuestions: [{ ...SAVED_DESIGN.inquiry_questions[1], publishedAt: expect.any(String) }],
        targetType: "ALL",
        targetGrade: null,
        targetClassName: null,
        targetStudentId: null,
        targetStudentIds: [],
        defaultQuestionPublic: true,
        isActive: true,
        likesVisibleToPeers: true,
        commentsVisibleToPeers: true,
      },
    });
  });

  it("수업에 배포할 때 요청의 안내가 아니라 저장된 학생용 안내를 복사한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([SAVED_DESIGN]);
    mockSessionCreate.mockImplementation(async ({ data }) => ({ id: "qs-guide", ...data }));

    const [req, ctx] = makeDesignSessionRequest("ud-1", {
      date: "2026-05-10",
      sharedQuestions: [{
        type: "factual",
        content: "광합성이 일어나는 장소는 어디인가?",
        studentGuide: {
          meaning: "요청에서 바꾼 설명",
          keywords: [],
          thinkingStart: "요청에서 바꾼 문장",
        },
      }],
    });

    const res = await createSessionFromDesign(req, ctx);

    expect(res.status).toBe(201);
    expect(mockSessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sharedQuestions: [{
          ...SAVED_DESIGN.inquiry_questions[0],
          publishedAt: expect.any(String),
        }],
      }),
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

  it("질문 없이 만들면 탐구질문 수업 세션(빈 sharedQuestions)이 생성된다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([SAVED_DESIGN]);
    const [req, ctx] = makeDesignSessionRequest("ud-1", {
      date: "2026-05-10",
      topic: "탐구질문 수업",
      sharedQuestions: [],
    });

    const res = await createSessionFromDesign(req, ctx);
    expect(res.status).toBe(201);
    expect(mockSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sharedQuestions: [], unitDesignId: "ud-1" }),
      }),
    );
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
  mockGenerateContent.mockResolvedValue({ text });
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
    aiState.apiKey = null;

    const res = await generatePOST(makeRequest({ ...GENERATE_BASE, step: "keywords" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("API 키");
  });

  it("keywords 단계: AI 응답에서 핵심어 배열을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockFindUnique
      .mockResolvedValueOnce({ value: "test-api-key" })
      .mockResolvedValueOnce({ value: "gemini-2.5-flash" });

    setAiResponse('{"keywords": ["광합성", "엽록체", "에너지 전환"]}');

    const res = await generatePOST(makeRequest({ ...GENERATE_BASE, step: "keywords" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const prompt = mockGenerateContent.mock.calls[0][0].contents as string;
    expect(body.keywords).toEqual(["광합성", "엽록체", "에너지 전환"]);
    expect(prompt).toContain("광합성");
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

    setAiResponse(JSON.stringify({
      inquiryQuestions: [
        { type: "factual", content: "광합성이 일어나는 장소는?" },
        { type: "conceptual", content: "광합성과 호흡의 차이는?" },
      ],
    }));

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
    expect(body.inquiryQuestions[0]).not.toHaveProperty("studentGuide");
    expect(body).not.toHaveProperty("learningGuides");
  });

  it("learning_guides 단계: 기존 단원 내용을 바꾸지 않는 학생용 설명을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockFindUnique
      .mockResolvedValueOnce({ value: "test-api-key" })
      .mockResolvedValueOnce(null);
    setAiResponse(JSON.stringify(COMPLETE_GENERATED_GUIDES));

    const res = await generatePOST(makeRequest({
      ...GENERATE_BASE,
      step: "learning_guides",
      coreSentences: VALID_DESIGN.coreSentences,
      essentialQuestions: VALID_DESIGN.essentialQuestions,
      inquiryQuestions: VALID_DESIGN.inquiryQuestions,
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.learningGuides.coreIdea.lifeConnection).toContain("화단");
  });

  it("학생용 설명 첫 응답이 불완전하면 한 번 보완해 완전한 결과만 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockGenerateContent
      .mockResolvedValueOnce({ text: JSON.stringify({
        learningGuides: {
          coreIdea: { explanation: "쉽게", lifeConnection: "생활", keywords: [] },
          coreSentences: [],
          essentialQuestions: [],
        },
        guides: [],
      }) })
      .mockResolvedValueOnce({ text: JSON.stringify(COMPLETE_GENERATED_GUIDES) });

    const res = await generatePOST(makeRequest({
      ...VALID_DESIGN,
      step: "learning_guides",
    }));

    expect(res.status).toBe(200);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    await expect(res.json()).resolves.toEqual(COMPLETE_GENERATED_GUIDES);
  });

  it("학생용 설명 첫 응답이 올바른 제이슨이 아니어도 한 번 보완한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockGenerateContent
      .mockResolvedValueOnce({ text: "올바른 제이슨이 아닌 응답" })
      .mockResolvedValueOnce({ text: JSON.stringify(COMPLETE_GENERATED_GUIDES) });

    const res = await generatePOST(makeRequest({
      ...VALID_DESIGN,
      step: "learning_guides",
    }));

    expect(res.status).toBe(200);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    await expect(res.json()).resolves.toEqual(COMPLETE_GENERATED_GUIDES);
  });

  it("보완 결과도 불완전하면 부분 결과를 반환하지 않는다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ learningGuides: {}, guides: [] }),
    });

    const res = await generatePOST(makeRequest({
      ...VALID_DESIGN,
      step: "learning_guides",
    }));

    expect(res.status).toBe(502);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("완전") });
  });

  it("student_guides 단계: 기존 질문 원문을 바꾸지 않는 학생용 안내 초안을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockFindUnique
      .mockResolvedValueOnce({ value: "test-api-key" })
      .mockResolvedValueOnce(null);
    setAiResponse(
      '{"guides": [{"index": 0, "meaning": "광합성 장소를 확인하는 질문이에요.", "keywords": [], "thinkingStart": "식물의 기관을 살펴보세요."}]}'
    );

    const res = await generatePOST(makeRequest({
      ...GENERATE_BASE,
      step: "student_guides",
      inquiryQuestions: [{ type: "factual", content: "광합성은 어디에서 일어날까?" }],
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.guides[0]).toEqual(expect.objectContaining({ index: 0 }));
  });

  it("AI 응답에서 JSON을 파싱할 수 없으면 502를 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockFindUnique
      .mockResolvedValueOnce({ value: "test-api-key" })
      .mockResolvedValueOnce(null);

    setAiResponse("JSON이 아닌 응답입니다");

    const res = await generatePOST(makeRequest({ ...GENERATE_BASE, step: "keywords" }));
    // AI(upstream) 응답 파싱 실패는 502(Bad Gateway): route.ts 참고
    expect(res.status).toBe(502);
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
      selectedKeywords: ["광합성", "에너지 전환"],
      coreSentences: ["식물은 빛 에너지를 생명 활동에 필요한 물질로 전환한다."],
      essentialQuestions: ["생물은 어떻게 에너지를 얻고 활용하는가?"],
      achievementConsiderations: ["학생의 관찰 경험과 연결한다."],
    });

    expect(questionsPrompt).toContain("[선택 성취기준 기반 맥락]");
    expect(questionsPrompt).toContain("광합성을 에너지 전환과 연결한다.");
    expect(inquiryPrompt).toContain("[선택 성취기준 기반 맥락]");
    expect(inquiryPrompt).toContain("학생의 관찰 경험과 연결한다.");
    expect(inquiryPrompt).toContain("[선택한 핵심어] 광합성, 에너지 전환");
    expect(inquiryPrompt).toContain("[선택 핵심 문장]");
    expect(inquiryPrompt).toContain("식물은 빛 에너지를 생명 활동에 필요한 물질로 전환한다.");
    expect(inquiryPrompt).toContain("[선택 핵심 질문]");
    expect(inquiryPrompt).toContain("생물은 어떻게 에너지를 얻고 활용하는가?");
    expect(inquiryPrompt).toContain("factual (사실적): 사실·정보 확인·기억 → 3~4개");
    expect(inquiryPrompt).toContain("conceptual (개념적): 추론·비교·분석·해석 → 3~4개");
    expect(inquiryPrompt).toContain("controversial (논쟁적): 판단·의견·가치·적용 → 정확히 2개");
    expect(inquiryPrompt).toContain('"inquiryQuestions"');
    expect(inquiryPrompt).not.toContain('"studentGuide"');
    expect(inquiryPrompt).not.toContain('"learningGuides"');
  });

  it("learning_guides 단계는 원문 유지와 정답·결론 제시 금지를 명시한다", () => {
    const prompt = buildPrompt({
      ...PROMPT_BASE,
      step: "learning_guides",
      selectedKeywords: ["광합성", "에너지 전환"],
      coreSentences: VALID_DESIGN.coreSentences,
      essentialQuestions: VALID_DESIGN.essentialQuestions,
      inquiryQuestions: VALID_DESIGN.inquiryQuestions,
    });

    expect(prompt).toContain(VALID_DESIGN.coreIdea);
    expect(prompt).toContain("[선택 성취기준]");
    expect(prompt).toContain(PROMPT_BASE.achievements[0].code);
    expect(prompt).toContain(PROMPT_BASE.achievements[0].content);
    expect(prompt).toContain(VALID_DESIGN.coreSentences[0]);
    expect(prompt).toContain(VALID_DESIGN.essentialQuestions[0]);
    expect(prompt).toContain("[선택한 핵심어] 광합성, 에너지 전환");
    expect(prompt).toContain("서로 다른 핵심 낱말을 3~5개");
    expect(prompt).toContain("모든 성취기준");
    expect(prompt).toContain("learningGuides.achievements");
    expect(prompt).toContain("모든 원문에 대해 쉬운 표현을 하나씩");
    expect(prompt).toContain("모든 원문에 대해 thinkingFocus 한 문장");
    expect(prompt).toContain("모든 탐구 질문에 대해 원문과 같은 index");
    expect(prompt).toContain("서로 다른 핵심 낱말 2~5개");
    expect(prompt).toContain("원문을 바꾸지 마세요");
    expect(prompt).toContain("정답이나 결론을 제시하지 마세요");
  });

  it("learning_guides 제이슨 예시도 핵심 낱말 개수와 쉬운 뜻 규칙을 지킨다", () => {
    const prompt = buildPrompt({
      ...PROMPT_BASE,
      step: "learning_guides",
      selectedKeywords: ["광합성", "에너지 전환"],
      coreSentences: VALID_DESIGN.coreSentences,
      essentialQuestions: VALID_DESIGN.essentialQuestions,
      inquiryQuestions: VALID_DESIGN.inquiryQuestions,
    });
    const exampleStart = prompt.indexOf('{"learningGuides"');
    expect(exampleStart).toBeGreaterThanOrEqual(0);

    const example = JSON.parse(prompt.slice(exampleStart)) as {
      learningGuides: {
        coreIdea: { keywords: Array<{ term: string; meaning: string }> };
      };
      guides: Array<{ keywords: Array<{ term: string; meaning: string }> }>;
    };
    const coreIdeaKeywords = example.learningGuides.coreIdea.keywords;
    expect(coreIdeaKeywords.length).toBeGreaterThanOrEqual(3);
    expect(coreIdeaKeywords.length).toBeLessThanOrEqual(5);
    expect(coreIdeaKeywords.every(({ term, meaning }) => term.trim() && meaning.trim())).toBe(true);
    expect(example.guides.length).toBeGreaterThan(0);
    for (const guide of example.guides) {
      expect(guide.keywords.length).toBeGreaterThanOrEqual(2);
      expect(guide.keywords.length).toBeLessThanOrEqual(5);
      expect(guide.keywords.every(({ term, meaning }) => term.trim() && meaning.trim())).toBe(true);
    }
  });

  it("student_guides 단계는 질문 원문과 학년 수준을 포함하고 원문 변경을 금지한다", () => {
    const prompt = buildPrompt({
      ...PROMPT_BASE,
      step: "student_guides",
      inquiryQuestions: [{ type: "controversial", content: "학교에서 인공지능 사용을 제한해야 할까?" }],
    });

    expect(prompt).toContain("학교에서 인공지능 사용을 제한해야 할까?");
    expect(prompt).toContain("질문 원문을 바꾸거나 다시 쓰지 마세요");
    expect(prompt).toContain("정답이나 특정 입장을 제시하지 마세요");
  });

  it("recommend_by_unit 단계는 단원명과 제공 목록(번호)만 포함하고 선택 규칙을 명시한다", () => {
    const prompt = buildPrompt({
      ...PROMPT_BASE,
      step: "recommend_by_unit",
      unitName: "식물의 한살이",
      achievements: [{ code: "[4과03-01]", content: "광합성 과정을 설명한다" }],
      knowledgeItems: ["광합성", "증산 작용"],
      processItems: ["관찰하기"],
      valueItems: ["생명 존중"],
    });
    expect(prompt).toContain("식물의 한살이");
    expect(prompt).toContain("[4과03-01]");
    expect(prompt).toContain("0. 광합성");
    expect(prompt).toContain("recommendedCodes");
    expect(prompt).toContain("knowledgeIdx");
    // 새로 만들지 말고 제공 목록에서만 선택하도록 지시
    expect(prompt).toContain("새로 만들어내지 마세요");
  });
});

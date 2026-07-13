import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(() => ({ success: true })) }));
vi.mock("@/lib/resolve-ai-config", () => ({ resolveUserAiConfig: vi.fn() }));
vi.mock("@/lib/translate", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/translate")>();
  return { ...actual, translateTexts: vi.fn() };
});
vi.mock("@/lib/db", () => ({
  prisma: {
    questionSession: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    translation: { findUnique: vi.fn(), upsert: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import { POST } from "@/app/api/sessions/[id]/design-context/translate/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveUserAiConfig } from "@/lib/resolve-ai-config";
import { translateTexts } from "@/lib/translate";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mSession = prisma.questionSession.findUnique as unknown as ReturnType<typeof vi.fn>;
const mUser = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mQueryRaw = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;
const mFind = prisma.translation.findUnique as unknown as ReturnType<typeof vi.fn>;
const mUpsert = prisma.translation.upsert as unknown as ReturnType<typeof vi.fn>;
const mResolve = resolveUserAiConfig as unknown as ReturnType<typeof vi.fn>;
const mTranslate = translateTexts as unknown as ReturnType<typeof vi.fn>;

const ctx = { params: Promise.resolve({ id: "s1" }) };

function req(locale: string) {
  return new Request("http://localhost/api/sessions/s1/design-context/translate", {
    method: "POST",
    headers: { cookie: `NEXT_LOCALE=${locale}` },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mAuth.mockResolvedValue({ user: { id: "st1", role: "STUDENT", grade: "5", className: "1" } });
  mUser.mockResolvedValue({ id: "st1", role: "STUDENT", school: "테스트학교", grade: "5", className: "1" });
  mSession.mockResolvedValue({
    unitDesignId: "ud1",
    date: "2026-07-01",
    teacherId: "t1",
    targetType: "CLASS",
    targetGrade: "5",
    targetClassName: "1",
    targetStudentId: null,
    targetStudentIds: [],
    teacher: {
      school: "테스트학교",
      teacherClasses: [{ grade: "5", className: "1" }],
    },
  });
  mQueryRaw.mockResolvedValue([{
    id: "ud1",
    title: "평면도형의 둘레와 넓이",
    subject: "수학",
    grade_range: "5-6",
    grade: "5",
    area: "도형과 측정",
    core_idea: "도형은 길이와 넓이로 설명할 수 있다",
    core_sentences: ["둘레는 도형의 가장자리 길이입니다."],
    essential_questions: ["넓이는 어떻게 비교할 수 있을까요?"],
    inquiry_questions: [{ type: "factual", content: "직사각형의 둘레는 어떻게 구하나요?" }],
  }]);
  mFind.mockResolvedValue(null);
  mUpsert.mockResolvedValue({});
  mResolve.mockResolvedValue({ apiKey: "k", model: "m" });
  mTranslate.mockResolvedValue([
    "Perimeter and Area of Plane Figures",
    "Math",
    "Shapes and Measurement",
    "Shapes can be described by length and area.",
    "Perimeter is the length around a figure.",
    "How can we compare area?",
    "How do you find the perimeter of a rectangle?",
  ]);
});

describe("POST design-context translate", () => {
  it("학생 질문하기 참고자료의 교과·단원·본문을 영어로 번역한다", async () => {
    const res = await POST(req("en"), ctx);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.context.subject).toBe("Math");
    expect(data.context.title).toBe("Perimeter and Area of Plane Figures");
    expect(data.context.coreSentences[0]).toBe("Perimeter is the length around a figure.");
    expect(data.context.inquiryQuestions[0].content).toBe("How do you find the perimeter of a rectangle?");
    expect(mTranslate).toHaveBeenCalledWith(
      [
        "평면도형의 둘레와 넓이",
        "수학",
        "도형과 측정",
        "도형은 길이와 넓이로 설명할 수 있다",
        "둘레는 도형의 가장자리 길이입니다.",
        "넓이는 어떻게 비교할 수 있을까요?",
        "직사각형의 둘레는 어떻게 구하나요?",
      ],
      "en",
      "st1",
      "k",
      "m",
    );
  });
});

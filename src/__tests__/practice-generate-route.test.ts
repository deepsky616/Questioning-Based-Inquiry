import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/ai", () => ({
  AiKeyMissingError: class AiKeyMissingError extends Error {},
  AiQuotaError: class AiQuotaError extends Error {},
  AiBusyError: class AiBusyError extends Error {
    constructor() {
      super("AI_BUSY");
    }
  },
  generateJsonWithMetadata: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateJsonWithMetadata, AiBusyError } from "@/lib/ai";
import { JsonExtractionError } from "@/lib/json-extract";
import { __resetRateLimit } from "@/lib/rate-limit";
import {
  hashPracticeGenerationContent,
  verifyPracticeGenerationProof,
} from "@/lib/practice-generation-proof";
import { POST } from "@/app/api/practice/generate/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mUserFindUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const mGen = generateJsonWithMetadata as unknown as ReturnType<typeof vi.fn>;

const req = (body: unknown) =>
  new Request("http://localhost/api/practice/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimit();
  process.env.GAME_ACTIVITY_HASH_SECRET = "practice-generate-test-secret-at-least-32-characters";
  mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
  mUserFindUnique.mockResolvedValue({ role: "STUDENT" });
});

describe("연습 AI 실시간 출제", () => {
  it("바꾸기: 원본 질문·힌트·예시에 서버가 정한 목표 유형을 붙여 돌려준다", async () => {
    mGen.mockResolvedValue({
      data: { source: "우리나라의 수도는 어디인가요?", hint: "까닭을 물어보세요.", example: "수도가 서울이 되면서 어떤 변화가 생겼을까요?" },
      model: "gemini-2.5-flash-lite",
    });
    const res = await POST(req({ mode: "transform" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.source).toContain("수도");
    expect(["open", "conceptual", "controversial"]).toContain(data.target);
    expect(data.hint.length).toBeGreaterThan(0);
    expect(data.example.length).toBeGreaterThan(0);
    expect(verifyPracticeGenerationProof(data.generationProof)).toMatchObject({
      userId: "s1",
      mode: "transform",
      target: data.target,
      contentHash: hashPracticeGenerationContent(data.source),
    });
  });

  it("만들기: 제목과 제시문을 돌려준다", async () => {
    mGen.mockResolvedValue({
      data: { title: "우리 동네 시장", passage: "우리 동네 시장에는 오래된 가게가 많아요. 최근 큰 마트가 생기면서 시장을 찾는 사람이 줄어 상인들의 걱정이 커지고 있어요." },
      model: "gemini-2.5-flash-lite",
    });
    const data = await (await POST(req({ mode: "create" }))).json();
    expect(data.title).toBe("우리 동네 시장");
    expect(data.passage.length).toBeGreaterThanOrEqual(30);
    expect(verifyPracticeGenerationProof(data.generationProof)).toMatchObject({
      userId: "s1",
      mode: "create",
      target: null,
      contentHash: hashPracticeGenerationContent(data.passage),
    });
  });

  it("AI 응답이 형식에 어긋나면 502 (클라이언트는 은행으로 폴백)", async () => {
    mGen.mockResolvedValue({ data: { source: "짧음" }, model: "m" });
    expect((await POST(req({ mode: "transform" }))).status).toBe(502);
  });

  it("AI 응답을 해석할 수 없어도 재시도 가능한 502를 돌려준다", async () => {
    mGen.mockRejectedValueOnce(new JsonExtractionError("출제 응답 형식 오류"));

    expect((await POST(req({ mode: "transform" }))).status).toBe(502);
  });

  it("AI 혼잡은 503, 비로그인은 401, 형식 오류는 400", async () => {
    mGen.mockRejectedValueOnce(new AiBusyError());
    expect((await POST(req({ mode: "create" }))).status).toBe(503);

    mAuth.mockResolvedValue(null);
    expect((await POST(req({ mode: "create" }))).status).toBe(401);

    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    expect((await POST(req({ mode: "quiz" }))).status).toBe(400);
  });

  it("삭제된 계정의 남은 인증으로는 출제 모델을 호출하지 않는다", async () => {
    mUserFindUnique.mockResolvedValue(null);

    const response = await POST(req({ mode: "transform" }));

    expect(response.status).toBe(401);
    expect(mGen).not.toHaveBeenCalled();
  });
});

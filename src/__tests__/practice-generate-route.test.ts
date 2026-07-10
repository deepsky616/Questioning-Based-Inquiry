import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/ai", () => ({
  AiKeyMissingError: class AiKeyMissingError extends Error {},
  AiBusyError: class AiBusyError extends Error {
    constructor() {
      super("AI_BUSY");
    }
  },
  generateJsonWithMetadata: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { generateJsonWithMetadata, AiBusyError } from "@/lib/ai";
import { __resetRateLimit } from "@/lib/rate-limit";
import { POST } from "@/app/api/practice/generate/route";

const mAuth = auth as unknown as ReturnType<typeof vi.fn>;
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
  mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
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
  });

  it("만들기: 제목과 제시문을 돌려준다", async () => {
    mGen.mockResolvedValue({
      data: { title: "우리 동네 시장", passage: "우리 동네 시장에는 오래된 가게가 많아요. 최근 큰 마트가 생기면서 시장을 찾는 사람이 줄어 상인들의 걱정이 커지고 있어요." },
      model: "gemini-2.5-flash-lite",
    });
    const data = await (await POST(req({ mode: "create" }))).json();
    expect(data.title).toBe("우리 동네 시장");
    expect(data.passage.length).toBeGreaterThanOrEqual(30);
  });

  it("AI 응답이 형식에 어긋나면 502 (클라이언트는 은행으로 폴백)", async () => {
    mGen.mockResolvedValue({ data: { source: "짧음" }, model: "m" });
    expect((await POST(req({ mode: "transform" }))).status).toBe(502);
  });

  it("AI 혼잡은 503, 비로그인은 401, 형식 오류는 400", async () => {
    mGen.mockRejectedValue(new AiBusyError());
    expect((await POST(req({ mode: "create" }))).status).toBe(503);

    mAuth.mockResolvedValue(null);
    expect((await POST(req({ mode: "create" }))).status).toBe(401);

    mAuth.mockResolvedValue({ user: { id: "s1", role: "STUDENT" } });
    expect((await POST(req({ mode: "quiz" }))).status).toBe(400);
  });
});

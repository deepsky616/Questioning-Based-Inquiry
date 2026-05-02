import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: vi.fn() } }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GET } from "@/app/api/curriculum/route";
import { GET as GET_ENRICHED } from "@/app/api/curriculum/enriched/route";

const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockQueryRaw = prisma.$queryRaw as ReturnType<typeof vi.fn>;

const TEACHER_SESSION = { user: { id: "teacher-1", role: "TEACHER" } };

const AREA_ROW = {
  id: "area-1",
  subject: "과학",
  grade_range: "3-4",
  area: "생명과학",
  core_idea: "핵심아이디어 예시",
  knowledge_items: ["지식1"],
  process_items: ["과정1"],
  value_items: ["가치1"],
  middle_knowledge_items: [],
  middle_process_items: [],
  middle_value_items: [],
  achievements: [{ code: "4과03-01", content: "성취기준 예시" }],
  units: [],
};

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/curriculum");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/curriculum — 인증", () => {
  it("세션이 없으면 401을 반환한다", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });
});

describe("GET /api/curriculum — 교과 목록", () => {
  it("subject 없이 요청하면 교과 목록을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([{ subject: "국어" }, { subject: "과학" }]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjects).toEqual(["국어", "과학"]);
  });
});

describe("GET /api/curriculum — 학년군 목록", () => {
  it("subject만 있으면 학년군 목록을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([{ grade_range: "3-4" }, { grade_range: "5-6" }]);

    const res = await GET(makeRequest({ subject: "과학" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gradeRanges).toEqual(["3-4", "5-6"]);
  });
});

describe("GET /api/curriculum — 영역 단건 조회", () => {
  // 라우팅 순서: !subject → subject&&!gradeRange → areaId → subject+gradeRange
  // areaId 분기에 도달하려면 subject와 gradeRange도 함께 전달해야 한다
  it("areaId가 있으면 영역 단건을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([AREA_ROW]);

    const res = await GET(makeRequest({ areaId: "area-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("area-1");
    expect(body.subject).toBe("과학");
    expect(body.gradeRange).toBe("3-4");
    expect(body.coreIdea).toBe("핵심아이디어 예시");
  });

  it("areaId에 해당하는 데이터가 없으면 404를 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([]);

    const res = await GET(makeRequest({ areaId: "nonexistent" }));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/curriculum — 영역 목록", () => {
  it("subject와 gradeRange가 있으면 영역 목록을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([
      { id: "area-1", area: "생명과학", core_idea: "핵심아이디어 A" },
      { id: "area-2", area: "물질과 에너지", core_idea: "핵심아이디어 B" },
    ]);

    const res = await GET(makeRequest({ subject: "과학", gradeRange: "3-4" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.areas).toHaveLength(2);
    expect(body.areas[0]).toEqual({ id: "area-1", area: "생명과학", coreIdea: "핵심아이디어 A" });
  });

  it("해당 조건의 영역이 없으면 빈 배열을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([]);

    const res = await GET(makeRequest({ subject: "과학", gradeRange: "1-2" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.areas).toEqual([]);
  });
});

describe("GET /api/curriculum/enriched — MD 기반 보강 데이터", () => {
  it("areaId의 교과·학년군·영역에 맞는 성취기준 해설과 세부 그룹을 반환한다", async () => {
    mockAuth.mockResolvedValue(TEACHER_SESSION);
    mockQueryRaw.mockResolvedValue([
      {
        ...AREA_ROW,
        subject: "수학",
        grade_range: "3-4",
        area: "도형과 측정",
        units: [],
      },
    ]);

    const res = await GET_ENRICHED(makeRequest({ areaId: "math-geometry" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.achievements).toHaveLength(25);
    expect(body.achievementGroups.map((group: { name: string }) => group.name)).toContain("도형의 기초");
    expect(body.achievementExplanations["[4수03-04]"]).toContain("평면도형의 이동");
    expect(body.achievementConsiderations.length).toBeGreaterThan(0);
  });
});

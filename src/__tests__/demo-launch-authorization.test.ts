import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configure: vi.fn(),
  findFirst: vi.fn(),
  rateLimit: vi.fn(),
}));
vi.mock("next-auth", () => ({ default: (config: unknown) => { mocks.configure(config); return {}; } }));
vi.mock("next-auth/providers/credentials", () => ({ default: (config: unknown) => config }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
import "@/lib/auth";

type Credentials = Record<string, unknown>;
const config = mocks.configure.mock.calls[0][0] as {
  providers: { id?: string; authorize: (credentials: Credentials) => Promise<unknown> }[];
};
const authorize = config.providers.find((provider) => provider.id === "demo-launch")!.authorize;
const ticket = "test-role-launch-ticket";
const student = { id: "usb-demo-student-01", name: "김질문", role: "STUDENT", isDemo: true, school: "질문초등학교", grade: "5", className: "1", studentNumber: "1" };
const teacher = { id: "usb-demo-teacher", name: "김탐구", role: "TEACHER", isDemo: true, school: "질문초등학교" };

beforeEach(() => {
  mocks.findFirst.mockReset();
  mocks.rateLimit.mockReset().mockReturnValue({ success: true });
  vi.stubEnv("DEMO_LAUNCH_ENABLED", "true");
  vi.stubEnv("DEMO_LAUNCH_TOKEN_HASH", createHash("sha256").update(ticket).digest("hex"));
  vi.stubEnv("DEMO_LAUNCH_EXPIRES_AT", "2099-01-01T00:00:00Z");
});
afterEach(() => vi.unstubAllEnvs());

describe("교사와 학생 시연 인증", () => {
  it.each([undefined, "", "student"])("기존 학생 링크와 명시적 학생 선택을 같은 고정 계정으로 연결한다: %s", async (role) => {
    mocks.findFirst.mockResolvedValue(student);
    expect(await authorize({ ticket, role })).toMatchObject(student);
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: {
      id: student.id, role: "STUDENT", isDemo: true, school: "질문초등학교", grade: { in: ["5", "4"] }, className: "1", studentNumber: "1",
    } });
  });

  it("교사 선택은 같은 학교·학급의 지정 더미 교사만 조회한다", async () => {
    mocks.findFirst.mockResolvedValue(teacher);
    expect(await authorize({ ticket, role: "teacher", userId: "another-teacher", email: "ignored@example.test" })).toMatchObject(teacher);
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: {
      id: teacher.id, role: "TEACHER", isDemo: true, school: "질문초등학교",
      teacherClasses: { some: { grade: { in: ["5", "4"] }, className: "1" } },
    } });
  });

  it.each(["admin", "TEACHER", null, 1, {}, ["teacher"]])("조작된 역할은 데이터 조회 전에 거절한다: %j", async (role) => {
    expect(await authorize({ ticket, role })).toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it.each(["wrong-ticket", "", undefined])("유효하지 않은 실행 표로는 교사에 로그인할 수 없다", async (value) => {
    expect(await authorize({ ticket: value, role: "teacher" })).toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("만료된 실행 표를 거절한다", async () => {
    vi.stubEnv("DEMO_LAUNCH_EXPIRES_AT", "2020-01-01T00:00:00Z");
    expect(await authorize({ ticket, role: "teacher" })).toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("조회 조건에 맞는 더미 계정이 없으면 다른 계정으로 대체하지 않는다", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await authorize({ ticket, role: "teacher" })).toBeNull();
    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
  });

  it("로그인 시도 제한을 초과하면 조회하지 않는다", async () => {
    mocks.rateLimit.mockReturnValue({ success: false });
    expect(await authorize({ ticket, role: "teacher" })).toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});

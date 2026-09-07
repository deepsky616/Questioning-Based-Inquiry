import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), update: vi.fn(), transaction: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ prisma: { user: { update: mocks.update, findUnique: mocks.findUnique, updateMany: mocks.updateMany }, $transaction: mocks.transaction } }));
import { DELETE as deleteAccount } from "@/app/api/account/delete/route";
import { DELETE as deleteConfig, POST as saveConfig } from "@/app/api/config/route";
import { POST as addStudents } from "@/app/api/students/bulk/route";
import { DELETE as deleteStudent } from "@/app/api/teacher/students/[id]/route";
import { POST as resetPassword } from "@/app/api/teacher/students/reset-password/route";

const request = () => new Request("https://example.test/api/test", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
const operations = [
  ["계정 탈퇴", () => deleteAccount()],
  ["인공지능 설정 삭제", () => deleteConfig()],
  ["인공지능 설정 저장", () => saveConfig(request())],
  ["학생 추가", () => addStudents(request())],
  ["학생 삭제", () => deleteStudent(request(), { params: Promise.resolve({ id: "usb-demo-student-01" }) })],
  ["학생 비밀번호 초기화", () => resetPassword(request())],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "usb-demo-teacher", role: "TEACHER", isDemo: true } });
});

describe("시연 계정 연결 보호", () => {
  it.each(operations)("더미 교사의 %s 요청은 데이터에 접근하기 전에 거절한다", async (_label, run) => {
    const response = await run();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "시연 계정의 계정 관리와 인공지능 설정은 변경할 수 없습니다." });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it.each([false, undefined])("일반 교사의 기존 설정 삭제는 허용한다: %s", async (isDemo) => {
    mocks.auth.mockResolvedValue({ user: { id: "regular-teacher", role: "TEACHER", isDemo } });
    mocks.update.mockResolvedValue({});
    expect((await deleteConfig()).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "regular-teacher" }, data: { aiApiKey: null, aiModel: null } });
  });
});

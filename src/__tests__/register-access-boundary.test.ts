import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-rate-limit", () => ({
  checkRateLimit: vi.fn(() => null),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));
vi.mock("@/lib/email", () => ({
  sendTeacherWelcomeEmail: vi.fn(async () => ({ ok: true })),
}));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(async () => "hashed-password") },
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { POST } from "@/app/api/auth/register/route";
import { prisma } from "@/lib/db";

const findFirst = prisma.user.findFirst as unknown as ReturnType<typeof vi.fn>;
const findUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const createUser = prisma.user.create as unknown as ReturnType<typeof vi.fn>;

const request = (body: unknown) => new Request("http://localhost/api/auth/register", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const teacherBody = {
  role: "TEACHER",
  email: "teacher@example.com",
  name: "새 교사",
  school: "한빛초",
  teacherClasses: [{ grade: "5", className: "1" }],
  password: "Teacher1!",
};

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue(null);
  findUnique.mockResolvedValue(null);
  createUser.mockResolvedValue({
    id: "teacher-new",
    role: "TEACHER",
    name: "새 교사",
    email: "teacher@example.com",
  });
});

describe("공개 가입 권한 경계", () => {
  it("공개 주소에서는 학생 계정을 만들 수 없다", async () => {
    const response = await POST(request({
      role: "STUDENT",
      name: "새 학생",
      school: "한빛초",
      grade: "5",
      className: "1",
      studentNumber: "99",
      password: "Student1!",
    }));

    expect(response.status).toBe(403);
    expect(findFirst).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("교사 가입 코드 없이 교사 계정을 만들 수 있다", async () => {
    const response = await POST(request(teacherBody));

    expect(response.status).toBe(200);
    expect(createUser).toHaveBeenCalledOnce();
    expect(createUser.mock.calls[0][0].data).not.toHaveProperty("registrationCode");
  });
});

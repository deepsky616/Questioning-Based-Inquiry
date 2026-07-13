import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sendTeacherWelcomeEmail } from "@/lib/email";
import { validatePasswordPolicy } from "@/lib/password-policy";
import { checkRateLimit, getClientIp } from "@/lib/api-rate-limit";

const studentSchema = z.object({
  role: z.literal("STUDENT"),
  name: z.string().min(2, "이름을 2자 이상 입력해 주세요"),
  school: z.string().min(1, "학교를 입력해 주세요"),
  grade: z.string().min(1, "학년을 입력해 주세요"),
  className: z.string().min(1, "반을 입력해 주세요"),
  studentNumber: z.string().min(1, "번호를 입력해 주세요"),
  password: z.string().min(1, "비밀번호를 입력해 주세요"),
});

const teacherSchema = z.object({
  role: z.literal("TEACHER"),
  email: z.string().email("올바른 이메일 주소를 입력해 주세요"),
  name: z.string().min(2, "이름을 2자 이상 입력해 주세요"),
  school: z.string().min(1, "학교를 입력해 주세요"),
  teacherClasses: z.array(
    z.object({
      grade: z.string().min(1, "담당 학급의 학년을 입력해 주세요"),
      className: z.string().min(1, "담당 학급의 반을 입력해 주세요"),
    })
  ).min(1, "담당 학급을 1개 이상 추가해 주세요"),
  password: z.string().min(1, "비밀번호를 입력해 주세요"),
  registrationCode: z.string().max(256).optional(),
});

const registerSchema = z.discriminatedUnion("role", [studentSchema, teacherSchema]);

function hasValidTeacherRegistrationCode(value: string | undefined): boolean {
  const expected = process.env.TEACHER_REGISTRATION_CODE;
  if (!expected || expected.length < 12 || !value) return false;
  const expectedBuffer = Buffer.from(expected);
  const valueBuffer = Buffer.from(value);
  return expectedBuffer.length === valueBuffer.length && timingSafeEqual(expectedBuffer, valueBuffer);
}

export async function POST(req: Request) {
  // 레이트 리밋: IP당 분당 30회 (봇 대량 가입 방지. 학교 NAT 뒤에서 한 학급이
  // 동시에 가입하는 경우를 막지 않도록 여유 있게 설정)
  const limited = checkRateLimit(`register:ip:${getClientIp(req)}`, 30);
  if (limited) return limited;

  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

    if (data.role === "STUDENT") {
      return NextResponse.json(
        { error: "학생 계정은 담당 교사가 학생 관리에서 등록해야 합니다" },
        { status: 403 },
      );
    }
    if (!hasValidTeacherRegistrationCode(data.registrationCode)) {
      return NextResponse.json({ error: "교사 가입 코드가 올바르지 않습니다" }, { status: 403 });
    }

    const policyError = validatePasswordPolicy(data.password);
    if (policyError) return NextResponse.json({ error: policyError }, { status: 400 });

    const existingTeacher = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingTeacher) {
      return NextResponse.json({ error: "이미 등록된 교사입니다" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: "TEACHER",
        school: data.school,
        grade: null,
        className: null,
        studentNumber: null,
        teacherClasses: {
          create: data.teacherClasses.map((c) => ({
            id: `tc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            grade: c.grade.trim(),
            className: c.className.trim(),
          })),
        },
      },
    });

    if (user.role === "TEACHER" && user.email) {
      const emailResult = await sendTeacherWelcomeEmail(user.email, user.name);
      if (!emailResult.ok) {
        logger.error("Teacher welcome email error:", emailResult.error);
      }
    }

    return NextResponse.json({ id: user.id, name: user.name, role: user.role });
  } catch (error) {
    if (error instanceof z.ZodError) {
      // 어떤 항목이 잘못됐는지 구체적으로 안내
      const first = error.errors[0];
      return NextResponse.json({ error: first?.message ?? "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    logger.error("Registration error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}

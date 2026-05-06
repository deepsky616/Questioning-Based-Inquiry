import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sendTeacherWelcomeEmail } from "@/lib/email";

const studentSchema = z.object({
  role: z.literal("STUDENT"),
  name: z.string().min(2),
  school: z.string().min(1),
  grade: z.string().min(1),
  className: z.string().min(1),
  studentNumber: z.string().min(1),
  password: z.string().min(4),
});

const teacherSchema = z.object({
  role: z.literal("TEACHER"),
  email: z.string().email(),
  name: z.string().min(2),
  school: z.string().min(1),
  teacherClasses: z.array(
    z.object({ grade: z.string().min(1), className: z.string().min(1) })
  ).min(1),
  password: z.string().min(6),
});

const registerSchema = z.discriminatedUnion("role", [studentSchema, teacherSchema]);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

    if (data.role === "STUDENT") {
      const existingStudent = await prisma.user.findFirst({
        where: { role: "STUDENT", school: data.school, grade: data.grade, className: data.className, studentNumber: data.studentNumber },
      });
      if (existingStudent) {
        return NextResponse.json({ error: "이미 등록된 학생입니다" }, { status: 400 });
      }
    } else {
      const existingTeacher = await prisma.user.findUnique({ where: { email: data.email } });
      if (existingTeacher) {
        return NextResponse.json({ error: "이미 등록된 교사입니다" }, { status: 400 });
      }
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        ...(data.role === "TEACHER" ? { email: data.email } : {}),
        password: hashedPassword,
        name: data.name,
        role: data.role,
        school: data.school,
        grade: data.role === "STUDENT" ? data.grade : null,
        className: data.role === "STUDENT" ? data.className : null,
        studentNumber: data.role === "STUDENT" ? data.studentNumber : null,
        ...(data.role === "TEACHER"
          ? {
              teacherClasses: {
                create: data.teacherClasses.map((c) => ({
                  id: `tc_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                  grade: c.grade.trim(),
                  className: c.className.trim(),
                })),
              },
            }
          : {}),
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
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    logger.error("Registration error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}

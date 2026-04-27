import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { buildStudentEmail } from "@/lib/student-auth";

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
  school: z.string().optional(),
  password: z.string().min(6),
});

const registerSchema = z.discriminatedUnion("role", [studentSchema, teacherSchema]);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

    let email: string;
    if (data.role === "STUDENT") {
      email = buildStudentEmail(data.school, data.grade, data.className, data.studentNumber);
    } else {
      email = data.email;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: data.role === "TEACHER" ? "이미 등록된 교사입니다" : "이미 등록된 학생입니다" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: data.name,
        role: data.role,
        school: data.role === "STUDENT" ? data.school : (data.school ?? null),
        grade: data.role === "STUDENT" ? data.grade : null,
        className: data.role === "STUDENT" ? data.className : null,
        studentNumber: data.role === "STUDENT" ? data.studentNumber : null,
      },
    });

    return NextResponse.json({ id: user.id, name: user.name, role: user.role });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    console.error("Registration error:", error);
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}

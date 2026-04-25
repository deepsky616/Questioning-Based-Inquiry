import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { buildStudentEmail } from "@/lib/student-auth";
import { auth } from "@/lib/auth";

const bulkSchema = z.object({
  school: z.string().min(1),
  grade: z.string().min(1),
  className: z.string().min(1),
  defaultPassword: z.string().min(4),
  students: z.array(
    z.object({
      studentNumber: z.string().min(1),
      name: z.string().min(1),
    })
  ).min(1),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session || (session.user as any)?.role !== "TEACHER") {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { school, grade, className, defaultPassword, students } = bulkSchema.parse(body);

    const hashedPassword = await bcrypt.hash(defaultPassword, 12);

    const results = { created: 0, skipped: 0, errors: [] as string[] };

    for (const s of students) {
      const email = buildStudentEmail(school, grade, className, s.studentNumber);
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) {
        results.skipped++;
        continue;
      }
      try {
        await prisma.user.create({
          data: {
            email,
            password: hashedPassword,
            name: s.name,
            role: "STUDENT",
            school,
            grade,
            className,
            studentNumber: s.studentNumber,
          },
        });
        results.created++;
      } catch {
        results.errors.push(`${s.name}(${s.studentNumber}번) 등록 실패`);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    return NextResponse.json({ error: "서버 오류가 발생했습니다" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { buildStudentEmail } from "@/lib/student-auth";
import { auth } from "@/lib/auth";
import { sendBulkStudentSummaryEmail } from "@/lib/email";
import { partitionStudents, buildStudentCreateData } from "@/lib/student-registration";
import { formatErrorBody } from "@/lib/api-error";

const bulkSchema = z.object({
  school: z.string().min(1),
  grade: z.string().min(1),
  className: z.string().min(1),
  defaultPassword: z.string().min(4),
  students: z
    .array(
      z.object({
        studentNumber: z.string().min(1),
        name: z.string().min(1),
      })
    )
    .min(1),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "TEACHER") {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { school, grade, className, defaultPassword, students } = bulkSchema.parse(body);

    const classInfo = { school, grade, className };
    const allEmails = students.map((s) =>
      buildStudentEmail(school, grade, className, s.studentNumber)
    );

    // 기존 학생 이메일을 한 번에 조회 (N+1 → 1쿼리)
    const existingUsers = await prisma.user.findMany({
      where: { email: { in: allEmails } },
      select: { email: true },
    });
    const existingEmails = new Set(existingUsers.map((u) => u.email));

    const { toCreate, skippedCount } = partitionStudents(students, classInfo, existingEmails);

    const hashedPassword = await bcrypt.hash(defaultPassword, 12);
    const errors: string[] = [];
    let created = 0;

    if (toCreate.length > 0) {
      try {
        // 생성 대상을 트랜잭션으로 한 번에 처리
        const createData = toCreate.map((s) =>
          buildStudentCreateData(
            { studentNumber: s.studentNumber, name: s.name },
            classInfo,
            hashedPassword
          )
        );
        await prisma.$transaction(
          createData.map((data) => prisma.user.create({ data }))
        );
        created = createData.length;
      } catch {
        errors.push("일부 학생 등록에 실패했습니다");
      }
    }

    const results = { created, skipped: skippedCount, errors };

    const teacherEmail = session.user.email;
    if (teacherEmail) {
      const emailResult = await sendBulkStudentSummaryEmail({
        to: teacherEmail,
        teacherName: session.user.name ?? "선생님",
        school,
        grade,
        className,
        created: results.created,
        skipped: results.skipped,
        errors: results.errors,
      });
      if (!emailResult.ok) {
        console.error("Bulk student summary email error:", emailResult.error);
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    const { message, status } = formatErrorBody(error);
    return NextResponse.json({ error: message }, { status });
  }
}

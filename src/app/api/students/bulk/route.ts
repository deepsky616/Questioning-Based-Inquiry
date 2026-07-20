import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { sendBulkStudentSummaryEmail } from "@/lib/email";
import {
  STUDENT_REGISTRATION_LIMITS,
  partitionStudents,
  buildStudentCreateData,
} from "@/lib/student-registration";
import { formatErrorBody } from "@/lib/api-error";
import { validatePasswordPolicy } from "@/lib/password-policy";
import {
  isClassInTeacherScope,
  loadTeacherStudentScope,
} from "@/lib/teacher-student-access";

const bulkSchema = z.object({
  school: z.string().trim().min(1).max(STUDENT_REGISTRATION_LIMITS.school),
  grade: z.string().trim().min(1).max(STUDENT_REGISTRATION_LIMITS.grade),
  className: z.string().trim().min(1).max(STUDENT_REGISTRATION_LIMITS.className),
  defaultPassword: z.string().min(1),
  students: z
    .array(
      z.object({
        studentNumber: z.string().trim().min(1).max(STUDENT_REGISTRATION_LIMITS.studentNumber),
        name: z.string().trim().min(1).max(STUDENT_REGISTRATION_LIMITS.name),
      })
    )
    .min(1)
    .max(STUDENT_REGISTRATION_LIMITS.batchSize),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "TEACHER") {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { school, grade, className, defaultPassword, students } = bulkSchema.parse(body);
    const teacherScope = await loadTeacherStudentScope(session.user.id);
    if (
      !teacherScope ||
      teacherScope.school !== school ||
      !isClassInTeacherScope(teacherScope, grade, className)
    ) {
      return NextResponse.json({ error: "담당 학교와 학급에만 학생을 등록할 수 있습니다" }, { status: 403 });
    }

    const passwordError = validatePasswordPolicy(defaultPassword);
    if (passwordError) {
      return NextResponse.json({ error: `기본 비밀번호: ${passwordError}` }, { status: 400 });
    }

    const classInfo = { school, grade, className };
    const allNumbers = students.map((s) => s.studentNumber);

    // 기존 학생 학번을 한 번에 조회 (N+1 → 1쿼리)
    const existingUsers = await prisma.user.findMany({
      where: { role: "STUDENT", school, grade, className, studentNumber: { in: allNumbers } },
      select: { studentNumber: true },
    });
    const existingNumbers = new Set(existingUsers.map((u) => u.studentNumber ?? ""));

    const { toCreate, skippedCount } = partitionStudents(students, classInfo, existingNumbers);

    const hashedPassword = await bcrypt.hash(defaultPassword, 12);
    const errors: string[] = [];
    let created = 0;
    let skipped = skippedCount;

    if (toCreate.length > 0) {
      try {
        const createData = toCreate.map((s) =>
          buildStudentCreateData(
            { studentNumber: s.studentNumber, name: s.name },
            classInfo,
            hashedPassword
          )
        );
        const inserted = await prisma.user.createMany({
          data: createData,
          skipDuplicates: true,
        });
        created = inserted.count;
        skipped += createData.length - inserted.count;
      } catch {
        errors.push("일부 학생 등록에 실패했습니다");
      }
    }

    const results = { created, skipped, errors };

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

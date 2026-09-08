import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth-helpers";
import { isStudentInTeacherScope, loadTeacherStudentScope } from "@/lib/teacher-student-access";

const inputSchema = z.object({
  questionId: z.string().min(1).max(150),
  revisedContent: z.string().trim().min(5).max(300),
  reflection: z.string().trim().min(5).max(600),
  revision: z.number().int().min(0).max(100000),
}).strict();
const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
export async function GET(request: NextRequest) {
  const user = getSessionUser(await auth());
  if (!user.id) return fail(401, "로그인이 필요합니다");
  if (user.role !== "STUDENT" && user.role !== "TEACHER") return fail(403, "조회 권한이 없습니다");
  const targetId = request.nextUrl.searchParams.get("studentId") || user.id;
  if (user.role === "STUDENT" && targetId !== user.id) return fail(403, "본인의 기록만 볼 수 있습니다");
  try {
  if (user.role === "TEACHER") {
    const [scope, student] = await Promise.all([
      loadTeacherStudentScope(user.id),
      prisma.user.findUnique({ where: { id: targetId }, select: { role: true, school: true, grade: true, className: true } }),
    ]);
    if (!scope || !student || !isStudentInTeacherScope(scope, student)) return fail(403, "담당 학생의 기록만 볼 수 있습니다");
  }
    const [questions, records] = await Promise.all([
      prisma.question.findMany({ where: { authorId: targetId, source: "STUDENT" }, select: { id: true, content: true, session: { select: { date: true, subject: true, topic: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 }),
      prisma.questionGrowth.findMany({ where: { question: { authorId: targetId } }, orderBy: [{ updatedAt: "desc" }, { questionId: "desc" }], take: 100 }),
    ]);
    return NextResponse.json({ questions, records, canEdit: user.role === "STUDENT" });
  } catch { return fail(500, "성장 기록을 불러오지 못했습니다"); }
}
export async function PUT(request: NextRequest) {
  const user = getSessionUser(await auth());
  if (!user.id) return fail(401, "로그인이 필요합니다");
  if (user.role !== "STUDENT") return fail(403, "학생 본인만 작성할 수 있습니다");
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "질문과 배운 점을 각각 5자 이상 작성해 주세요");
  const { questionId, revisedContent, reflection, revision } = parsed.data;
  try {
    const question = await prisma.question.findFirst({ where: { id: questionId, authorId: user.id, source: "STUDENT" }, select: { id: true, content: true } });
    if (!question) return fail(404, "질문을 찾을 수 없습니다");
    if (revision === 0) {
      const record = await prisma.questionGrowth.create({ data: { questionId, originalContent: question.content, revisedContent, reflection } });
      return NextResponse.json(record);
    }
    const updated = await prisma.questionGrowth.updateMany({ where: { questionId, revision }, data: { revisedContent, reflection, revision: { increment: 1 } } });
    if (updated.count === 0) return fail(409, "다른 화면에서 기록이 변경됐습니다. 다시 불러온 뒤 저장해 주세요");
    return NextResponse.json({ saved: true });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return fail(409, "이미 저장된 기록이 있습니다. 다시 불러와 주세요");
    return fail(500, "성장 기록을 저장하지 못했습니다");
  }
}

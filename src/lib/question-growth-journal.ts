import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const growthJournalQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  q: z.string().trim().max(200).default(""),
  status: z.enum(["all", "pending", "complete"]).default("all"),
  sessionId: z.string().min(1).max(150).optional(),
});

// 호출자가 학생 본인 또는 담당 교사 권한을 확인한 뒤 전달하는 학생 범위이다.
export async function readGrowthJournal(studentId: string, filters: z.infer<typeof growthJournalQuerySchema>) {
  const pageSize = 8;
  const base: Prisma.QuestionGrowthWhereInput = { question: {
    authorId: studentId, source: "STUDENT", ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
  } };
  const conditions: Prisma.QuestionGrowthWhereInput[] = [base];
  if (filters.status === "pending") conditions.push({ reflection: "" });
  if (filters.status === "complete") conditions.push({ reflection: { not: "" } });
  if (filters.q) {
    const contains = { contains: filters.q, mode: Prisma.QueryMode.insensitive };
    conditions.push({ OR: [
      { originalContent: contains }, { revisedContent: contains }, { changeNote: contains }, { reflection: contains },
      { question: { session: { OR: [{ subject: contains }, { topic: contains }, { date: contains }] } } },
    ] });
  }
  const where: Prisma.QuestionGrowthWhereInput = { AND: conditions };
  const [all, complete, total] = await Promise.all([
    prisma.questionGrowth.count({ where: base }),
    prisma.questionGrowth.count({ where: { AND: [base, { reflection: { not: "" } }] } }),
    prisma.questionGrowth.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(filters.page, totalPages);
  const records = await prisma.questionGrowth.findMany({
    where, orderBy: [{ updatedAt: "desc" }, { questionId: "desc" }], skip: (page - 1) * pageSize, take: pageSize,
    include: { question: { select: { session: { select: { id: true, date: true, subject: true, topic: true } } } } },
  });
  return { records, pageInfo: { page, pageSize, total, totalPages }, summary: { total: all, complete, pending: all - complete } };
}

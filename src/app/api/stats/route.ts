import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calcTrend, calcStartDate, aggregateByStudent, buildTimeline } from "@/lib/stats-calc";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 접근할 수 있습니다" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const className = searchParams.get("className");
  const period = searchParams.get("period") ?? "month";

  const now = new Date();
  const startDate = calcStartDate(period, now);

  const where: {
    createdAt: { gte: Date };
    author?: { className: string };
  } = {
    createdAt: { gte: startDate },
  };

  if (className) {
    where.author = { className };
  }

  const questions = await prisma.question.findMany({
    where,
    include: {
      author: {
        select: {
          id: true,
          name: true,
          className: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const total = questions.length;

  const byClosure = {
    closed: questions.filter((q) => q.closure === "closed").length,
    open: questions.filter((q) => q.closure === "open").length,
  };

  const byCognitive = {
    factual: questions.filter((q) => q.cognitive === "factual").length,
    interpretive: questions.filter((q) => q.cognitive === "interpretive").length,
    evaluative: questions.filter((q) => q.cognitive === "evaluative").length,
  };

  const midpoint = new Date(startDate.getTime() + (now.getTime() - startDate.getTime()) / 2);
  const firstHalf = questions.filter((q) => q.createdAt < midpoint);
  const secondHalf = questions.filter((q) => q.createdAt >= midpoint);

  const byStudentBase = aggregateByStudent(
    questions.map((q) => ({
      ...q,
      closure: q.closure as "closed" | "open",
      cognitive: q.cognitive as "factual" | "interpretive" | "evaluative",
      author: {
        id: q.author.id,
        name: q.author.name,
        className: q.author.className,
      },
    }))
  );

  const byStudent = byStudentBase.map((student) => {
    const s1 = firstHalf.filter((q) => q.author.id === student.studentId).length;
    const s2 = secondHalf.filter((q) => q.author.id === student.studentId).length;
    return { ...student, trend: calcTrend(s1, s2) };
  });

  const timeline = buildTimeline(
    questions.map((q) => ({
      ...q,
      closure: q.closure as "closed" | "open",
      cognitive: q.cognitive as "factual" | "interpretive" | "evaluative",
      author: {
        id: q.author.id,
        name: q.author.name,
        className: q.author.className,
      },
    }))
  );

  return NextResponse.json({
    total,
    byClosure,
    byCognitive,
    byStudent,
    timeline,
  });
}

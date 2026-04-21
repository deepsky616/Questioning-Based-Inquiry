import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userRole = (session.user as any).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 접근할 수 있습니다" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const className = searchParams.get("className");
  const period = searchParams.get("period") || "month";

  const now = new Date();
  let startDate = new Date();

  switch (period) {
    case "week":
      startDate.setDate(now.getDate() - 7);
      break;
    case "month":
      startDate.setMonth(now.getMonth() - 1);
      break;
    case "semester":
      startDate.setMonth(now.getMonth() - 6);
      break;
    default:
      startDate.setMonth(now.getMonth() - 1);
  }

  const where: any = {
    createdAt: {
      gte: startDate,
    },
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

  const studentMap = new Map<string, any>();
  questions.forEach((q) => {
    const sid = q.author.id;
    if (!studentMap.has(sid)) {
      studentMap.set(sid, {
        studentId: sid,
        name: q.author.name,
        className: q.author.className,
        total: 0,
        distribution: { closed: 0, open: 0 },
        cognitiveDistribution: { factual: 0, interpretive: 0, evaluative: 0 },
      });
    }
    const student = studentMap.get(sid);
    student.total++;
    student.distribution[q.closure]++;
    student.cognitiveDistribution[q.cognitive]++;
  });

  const byStudent = Array.from(studentMap.values());

  const timelineMap = new Map<string, number>();
  questions.forEach((q) => {
    const dateKey = q.createdAt.toISOString().split("T")[0];
    timelineMap.set(dateKey, (timelineMap.get(dateKey) || 0) + 1);
  });

  const timeline = Array.from(timelineMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const firstHalf = questions.filter((q) => q.createdAt < new Date(startDate.getTime() + (now.getTime() - startDate.getTime()) / 2));
  const secondHalf = questions.filter((q) => q.createdAt >= new Date(startDate.getTime() + (now.getTime() - startDate.getTime()) / 2));

  byStudent.forEach((student) => {
    const s1 = firstHalf.filter((q) => q.author.id === student.studentId).length;
    const s2 = secondHalf.filter((q) => q.author.id === student.studentId).length;
    student.trend = s1 > 0 ? Math.round(((s2 - s1) / s1) * 100) : 0;
  });

  return NextResponse.json({
    total,
    byClosure,
    byCognitive,
    byStudent,
    timeline,
  });
}
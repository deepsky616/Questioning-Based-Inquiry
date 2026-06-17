import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface StudentPlay { id: string; name: string; studentNumber: string | null; plays: number; completions: number; points: number }
interface GameStat {
  participants: number;
  plays: number;
  completions: number;
  lastPlayedAt: string | null;
  students: StudentPlay[];
}

// 담당 학생들의 질문놀이 참여 데이터를 게임별로 집계(요약 + 학생별 상세)
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as { role?: string }).role !== "TEACHER") {
    return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  }
  const teacherId = (session.user as { id: string }).id;

  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: { teacherClasses: { select: { grade: true, className: true } } },
  });
  const classes = teacher?.teacherClasses ?? [];
  if (classes.length === 0) return NextResponse.json({ byGame: {} });

  const students = await prisma.user.findMany({
    where: { role: "STUDENT", OR: classes.map((c) => ({ grade: c.grade, className: c.className })) },
    select: { id: true, name: true, studentNumber: true },
  });
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const ids = students.map((s) => s.id);
  if (ids.length === 0) return NextResponse.json({ byGame: {} });

  const logs = await prisma.pointLog.findMany({
    where: { studentId: { in: ids }, status: { not: "REJECTED" } },
    select: { gameId: true, studentId: true, bonusType: true, points: true, createdAt: true },
  });

  // gameId → { studentId → {plays, completions, points} } + lastPlayed
  const byGame: Record<string, GameStat> = {};
  const perStudent: Record<string, Map<string, StudentPlay>> = {};

  for (const log of logs) {
    const g = log.gameId;
    if (!g) continue;
    if (!byGame[g]) { byGame[g] = { participants: 0, plays: 0, completions: 0, lastPlayedAt: null, students: [] }; }
    if (!perStudent[g]) perStudent[g] = new Map();
    const meta = studentMap.get(log.studentId);
    if (!meta) continue;

    let row = perStudent[g].get(log.studentId);
    if (!row) { row = { id: meta.id, name: meta.name, studentNumber: meta.studentNumber, plays: 0, completions: 0, points: 0 }; perStudent[g].set(log.studentId, row); }
    row.points += log.points;
    if (log.bonusType === "PARTICIPATION") { row.plays += 1; byGame[g].plays += 1; }
    if (log.bonusType === "COMPLETION") { row.completions += 1; byGame[g].completions += 1; }

    const t = log.createdAt.toISOString();
    if (!byGame[g].lastPlayedAt || t > byGame[g].lastPlayedAt) byGame[g].lastPlayedAt = t;
  }

  for (const g of Object.keys(byGame)) {
    const rows = Array.from(perStudent[g].values()).filter((r) => r.plays > 0 || r.points > 0);
    byGame[g].participants = rows.filter((r) => r.plays > 0).length;
    byGame[g].students = rows.sort((a, b) => b.plays - a.plays || b.points - a.points);
  }

  return NextResponse.json({ byGame });
}

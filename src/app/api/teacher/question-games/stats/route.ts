import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BASE_POINTS } from "@/lib/points-policy";

interface StudentPlay { id: string; name: string; studentNumber: string | null; plays: number; completions: number; points: number; goodQuestions: number }
interface StudentLite { id: string; name: string; studentNumber: string | null }
interface GameStat {
  participants: number;
  plays: number;
  completions: number;
  goodQuestions: number;
  lastPlayedAt: string | null;
  students: StudentPlay[];
  nonParticipants: StudentLite[];
}

// 담당 학생들의 질문놀이 참여 데이터를 게임별로 집계(요약 + 학생별 상세)
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  if ((session.user as { role?: string }).role !== "TEACHER") {
    return NextResponse.json({ error: "교사만 가능" }, { status: 403 });
  }
  const teacherId = (session.user as { id: string }).id;

  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: {
      school: true,
      teacherClasses: { select: { grade: true, className: true } },
    },
  });
  if (!teacher?.school) {
    return NextResponse.json({ error: "담당 학교 정보가 없습니다" }, { status: 403 });
  }
  const classes = teacher.teacherClasses;

  const students = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      school: teacher.school,
      ...(classes.length > 0
        ? { OR: classes.map((c) => ({ grade: c.grade, className: c.className })) }
        : {}),
    },
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

  const perStudentValidPoints: Record<string, Map<string, number>> = {};

  for (const log of logs) {
    const g = log.gameId;
    if (!g) continue;
    if (!byGame[g]) { byGame[g] = { participants: 0, plays: 0, completions: 0, goodQuestions: 0, lastPlayedAt: null, students: [], nonParticipants: [] }; }
    if (!perStudent[g]) perStudent[g] = new Map();
    if (!perStudentValidPoints[g]) perStudentValidPoints[g] = new Map();
    const meta = studentMap.get(log.studentId);
    if (!meta) continue;

    let row = perStudent[g].get(log.studentId);
    if (!row) { row = { id: meta.id, name: meta.name, studentNumber: meta.studentNumber, plays: 0, completions: 0, points: 0, goodQuestions: 0 }; perStudent[g].set(log.studentId, row); }
    row.points += log.points;
    if (log.bonusType === "PARTICIPATION") { row.plays += 1; byGame[g].plays += 1; }
    if (log.bonusType === "COMPLETION") { row.completions += 1; byGame[g].completions += 1; }
    if (log.bonusType === "VALID_QUESTIONS") {
      perStudentValidPoints[g].set(log.studentId, (perStudentValidPoints[g].get(log.studentId) ?? 0) + log.points);
    }

    const t = log.createdAt.toISOString();
    if (!byGame[g].lastPlayedAt || t > byGame[g].lastPlayedAt) byGame[g].lastPlayedAt = t;
  }

  const perQ = BASE_POINTS.PER_VALID_QUESTION || 3;
  for (const g of Object.keys(byGame)) {
    const rows = Array.from(perStudent[g].values());
    // 좋은 질문 수 = VALID_QUESTIONS 포인트 ÷ 질문당 점수
    for (const r of rows) {
      r.goodQuestions = Math.round((perStudentValidPoints[g].get(r.id) ?? 0) / perQ);
    }
    const active = rows.filter((r) => r.plays > 0 || r.points > 0);
    byGame[g].participants = active.filter((r) => r.plays > 0).length;
    byGame[g].goodQuestions = active.reduce((sum, r) => sum + r.goodQuestions, 0);
    byGame[g].students = active.sort((a, b) => b.plays - a.plays || b.points - a.points);
    // 미참여 학생 = 담당 학생 전체 − 참여(플레이>0)
    const playedIds = new Set(active.filter((r) => r.plays > 0).map((r) => r.id));
    byGame[g].nonParticipants = students
      .filter((s) => !playedIds.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, studentNumber: s.studentNumber }));
  }

  return NextResponse.json({ byGame });
}

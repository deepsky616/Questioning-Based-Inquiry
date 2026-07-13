import { normalizeCognitiveType } from "@/lib/question-labels";
import { compareByClassAndNumber } from "@/lib/student-sort";
import { calcTrend, type StudentStat, type TimelineEntry } from "@/lib/stats-calc";

export interface TeacherStatsQuestion {
  createdAt: Date;
  closure: string;
  cognitive: string | null;
  author: {
    id: string;
    name: string;
    className: string | null;
    grade: string | null;
    studentNumber: string | null;
  };
}

export interface TeacherQuestionStats {
  total: number;
  byClosure: { closed: number; open: number };
  byCognitive: { factual: number; conceptual: number; controversial: number };
  byStudent: Array<StudentStat & { sparkline: number[] }>;
  timeline: TimelineEntry[];
}

interface StudentAccumulator extends Omit<StudentStat, "trend"> {
  firstHalf: number;
  secondHalf: number;
  sparkline: number[];
}

const BUCKETS = 6;

export function aggregateTeacherStats(
  questions: Iterable<TeacherStatsQuestion>,
  startDate: Date,
  now: Date,
): TeacherQuestionStats {
  const byClosure = { closed: 0, open: 0 };
  const byCognitive = { factual: 0, conceptual: 0, controversial: 0 };
  const students = new Map<string, StudentAccumulator>();
  const timeline = new Map<string, number>();
  const midpoint = new Date(
    startDate.getTime() + (now.getTime() - startDate.getTime()) / 2,
  );
  const spanMs = Math.max(1, now.getTime() - startDate.getTime());
  let total = 0;

  for (const question of questions) {
    total += 1;
    if (question.closure === "closed" || question.closure === "open") {
      byClosure[question.closure] += 1;
    }

    const cognitive = normalizeCognitiveType(question.cognitive);
    byCognitive[cognitive] += 1;

    const date = question.createdAt.toISOString().split("T")[0];
    timeline.set(date, (timeline.get(date) ?? 0) + 1);

    let student = students.get(question.author.id);
    if (!student) {
      student = {
        studentId: question.author.id,
        name: question.author.name,
        className: question.author.className,
        grade: question.author.grade,
        studentNumber: question.author.studentNumber,
        total: 0,
        distribution: { closed: 0, open: 0 },
        cognitiveDistribution: { factual: 0, conceptual: 0, controversial: 0 },
        firstHalf: 0,
        secondHalf: 0,
        sparkline: Array.from({ length: BUCKETS }, () => 0),
      };
      students.set(question.author.id, student);
    }

    student.total += 1;
    if (question.closure === "closed" || question.closure === "open") {
      student.distribution[question.closure] += 1;
    }
    student.cognitiveDistribution[cognitive] += 1;

    if (question.createdAt < midpoint) {
      student.firstHalf += 1;
    } else {
      student.secondHalf += 1;
    }

    const bucket = Math.min(
      BUCKETS - 1,
      Math.floor(((question.createdAt.getTime() - startDate.getTime()) / spanMs) * BUCKETS),
    );
    student.sparkline[bucket] += 1;
  }

  const byStudent = Array.from(students.values())
    .map(({ firstHalf, secondHalf, ...student }) => ({
      ...student,
      trend: calcTrend(firstHalf, secondHalf),
    }))
    .sort(compareByClassAndNumber);

  const timelineEntries = Array.from(timeline.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    total,
    byClosure,
    byCognitive,
    byStudent,
    timeline: timelineEntries,
  };
}

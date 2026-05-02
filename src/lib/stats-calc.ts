export type PeriodType = "week" | "month" | "semester" | string;

export interface QuestionForStats {
  createdAt: Date;
  closure: "closed" | "open";
  cognitive: string;
  author: {
    id: string;
    name: string;
    className: string | null;
  };
}

export interface StudentStat {
  studentId: string;
  name: string;
  className: string | null;
  total: number;
  distribution: { closed: number; open: number };
  cognitiveDistribution: { factual: number; conceptual: number; controversial: number };
  trend: number | null;
}

export interface TimelineEntry {
  date: string;
  count: number;
}

/**
 * 이전/이후 기간 질문 수를 기반으로 추세(%)를 계산한다.
 * s1=0이고 s2>0이면 null(측정 불가)을 반환한다.
 */
export function calcTrend(s1: number, s2: number): number | null {
  if (s1 === 0 && s2 === 0) return 0;
  if (s1 === 0) return null;
  return Math.round(((s2 - s1) / s1) * 100);
}

/**
 * 기준 시점(now)으로부터 period에 해당하는 시작 날짜를 반환한다.
 * now를 복사해 사용하므로 원본을 변경하지 않는다.
 */
export function calcStartDate(period: PeriodType, now: Date): Date {
  const startDate = new Date(now);
  switch (period) {
    case "week":
      startDate.setDate(now.getDate() - 7);
      break;
    case "semester":
      startDate.setMonth(now.getMonth() - 6);
      break;
    case "month":
    default:
      startDate.setMonth(now.getMonth() - 1);
  }
  return startDate;
}

/**
 * 질문 목록을 학생별로 집계한다.
 */
export function aggregateByStudent(questions: QuestionForStats[]): Omit<StudentStat, "trend">[] {
  const studentMap = new Map<string, Omit<StudentStat, "trend">>();

  for (const q of questions) {
    const sid = q.author.id;
    if (!studentMap.has(sid)) {
      studentMap.set(sid, {
        studentId: sid,
        name: q.author.name,
        className: q.author.className,
        total: 0,
        distribution: { closed: 0, open: 0 },
        cognitiveDistribution: { factual: 0, conceptual: 0, controversial: 0 },
      });
    }
    const student = studentMap.get(sid)!;
    student.total++;
    student.distribution[q.closure]++;
    if (q.cognitive === "conceptual" || q.cognitive === "interpretive") {
      student.cognitiveDistribution.conceptual++;
    } else if (q.cognitive === "controversial" || q.cognitive === "evaluative" || q.cognitive === "applicative") {
      student.cognitiveDistribution.controversial++;
    } else {
      student.cognitiveDistribution.factual++;
    }
  }

  return Array.from(studentMap.values());
}

/**
 * 질문 목록을 날짜별로 집계하여 타임라인을 생성한다.
 */
export function buildTimeline(questions: QuestionForStats[]): TimelineEntry[] {
  const timelineMap = new Map<string, number>();

  for (const q of questions) {
    const dateKey = q.createdAt.toISOString().split("T")[0];
    timelineMap.set(dateKey, (timelineMap.get(dateKey) ?? 0) + 1);
  }

  return Array.from(timelineMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

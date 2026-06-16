import { summarizeQuestionTypes, type QuestionTypeSummary } from "./stats-calc";

export type ReportRange = "week" | "month";

export interface SeriesPoint {
  key: string;
  label: string;
  questions: number;
  likesGiven: number;
  comments: number;
  likesReceived: number;
  commentsReceived: number;
}

export interface ReportTotals {
  questions: number;
  likesGiven: number;
  comments: number;
  likesReceived: number;
  commentsReceived: number;
}

export interface ActivityInput {
  questions: { createdAt: string | Date; closure?: string; cognitive?: string }[];
  likesGiven: { createdAt: string | Date }[];
  comments: { createdAt: string | Date }[];
  likesReceived: { createdAt: string | Date }[];
  commentsReceived: { createdAt: string | Date }[];
}

export interface ActivityReport {
  totals: ReportTotals;
  weekly: SeriesPoint[];
  monthly: SeriesPoint[];
  classification: QuestionTypeSummary;
}

interface Bucket { key: string; label: string; start: number; end: number }

const pad = (n: number) => String(n).padStart(2, "0");

/** 월요일 00:00로 정렬한다 */
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7; // 월=0 … 일=6
  x.setDate(x.getDate() - dow);
  return x;
}

/** 최근 count개의 주/월 버킷을 과거→현재 순으로 만든다 */
export function buildBuckets(range: ReportRange, count: number, now: Date = new Date()): Bucket[] {
  const buckets: Bucket[] = [];
  if (range === "month") {
    const y = now.getFullYear();
    const m = now.getMonth();
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(y, m - i, 1);
      const end = new Date(y, m - i + 1, 1);
      buckets.push({
        key: `${start.getFullYear()}-${pad(start.getMonth() + 1)}`,
        label: `${start.getMonth() + 1}월`,
        start: start.getTime(),
        end: end.getTime(),
      });
    }
  } else {
    const thisMon = startOfWeek(now);
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(thisMon);
      start.setDate(start.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      buckets.push({
        key: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
        label: `${start.getMonth() + 1}/${start.getDate()}`,
        start: start.getTime(),
        end: end.getTime(),
      });
    }
  }
  return buckets;
}

function countInto(buckets: Bucket[], dates: (string | Date)[]): number[] {
  const counts = new Array(buckets.length).fill(0);
  for (const raw of dates) {
    const t = new Date(raw).getTime();
    for (let i = 0; i < buckets.length; i++) {
      if (t >= buckets[i].start && t < buckets[i].end) { counts[i]++; break; }
    }
  }
  return counts;
}

function buildSeries(input: ActivityInput, range: ReportRange, count: number, now?: Date): SeriesPoint[] {
  const buckets = buildBuckets(range, count, now);
  const q = countInto(buckets, input.questions.map((x) => x.createdAt));
  const lg = countInto(buckets, input.likesGiven.map((x) => x.createdAt));
  const c = countInto(buckets, input.comments.map((x) => x.createdAt));
  const lr = countInto(buckets, input.likesReceived.map((x) => x.createdAt));
  const cr = countInto(buckets, input.commentsReceived.map((x) => x.createdAt));
  return buckets.map((b, i) => ({
    key: b.key,
    label: b.label,
    questions: q[i],
    likesGiven: lg[i],
    comments: c[i],
    likesReceived: lr[i],
    commentsReceived: cr[i],
  }));
}

/** 활동 데이터로 주별(최근 12주)·월별(최근 6개월) 리포트를 만든다 */
export function buildActivityReport(
  input: ActivityInput,
  opts: { weeks?: number; months?: number; now?: Date } = {},
): ActivityReport {
  const weeks = opts.weeks ?? 12;
  const months = opts.months ?? 6;
  return {
    totals: {
      questions: input.questions.length,
      likesGiven: input.likesGiven.length,
      comments: input.comments.length,
      likesReceived: input.likesReceived.length,
      commentsReceived: input.commentsReceived.length,
    },
    weekly: buildSeries(input, "week", weeks, opts.now),
    monthly: buildSeries(input, "month", months, opts.now),
    classification: summarizeQuestionTypes(
      input.questions.map((x) => ({ closure: x.closure ?? "", cognitive: x.cognitive ?? "" })),
    ),
  };
}

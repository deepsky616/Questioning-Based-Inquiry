const SESSION_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UNKNOWN_SESSION_MONTH_KEY = "unknown";
const UNKNOWN_SESSION_MONTH_LABEL = "날짜 미정";

export function isValidSessionDateString(value: string): boolean {
  if (!SESSION_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function normalizeSessionDate(value: string | null | undefined): string | null {
  const date = value?.trim();
  if (!date) return null;
  return isValidSessionDateString(date) ? date : null;
}

function sessionDateSortKey(value: string): string {
  return isValidSessionDateString(value) ? value : "";
}

function formatDateKr(dateStr: string): string {
  if (!isValidSessionDateString(dateStr)) return dateStr;
  const [year, month, day] = dateStr.split("-");
  return `${year}년 ${parseInt(month)}월 ${parseInt(day)}일`;
}

/**
 * "탐구질문 수업" 세션 여부.
 * 탐구설계(unitDesignId)에 연결됐지만 배포 질문(sharedQuestions)이 없으면,
 * 학생이 참고 자료를 보고 직접 질문을 작성하는 탐구질문 수업이다.
 */
export function isInquiryDesignSession(s: {
  unitDesignId?: string | null;
  sharedQuestions?: unknown[] | null;
}): boolean {
  return Boolean(s.unitDesignId) && (s.sharedQuestions?.length ?? 0) === 0;
}

export function buildSessionLabel(date: string, subject: string, topic: string): string {
  const parts = [formatDateKr(date), subject];
  if (topic.trim()) parts.push(topic.trim());
  return parts.join(" · ");
}

export function isSessionAvailable(sessionDate: string, now: Date = new Date()): boolean {
  if (!isValidSessionDateString(sessionDate)) return false;
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const today = `${y}-${m}-${d}`;
  return sessionDate >= today;
}

export type SortableSession = {
  date: string;
  createdAt?: string | Date | null;
};

function createdAtValue(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function compareSessionsDesc<T extends SortableSession>(a: T, b: T): number {
  const dateDiff = sessionDateSortKey(b.date).localeCompare(sessionDateSortKey(a.date));
  if (dateDiff !== 0) return dateDiff;
  return createdAtValue(b.createdAt) - createdAtValue(a.createdAt);
}

export function compareSessionsAsc<T extends SortableSession>(a: T, b: T): number {
  const dateDiff = sessionDateSortKey(a.date).localeCompare(sessionDateSortKey(b.date));
  if (dateDiff !== 0) return dateDiff;
  return createdAtValue(a.createdAt) - createdAtValue(b.createdAt);
}

export function sortSessionsDesc<T extends SortableSession>(sessions: T[]): T[] {
  return [...sessions].sort(compareSessionsDesc);
}

export function sortSessionsAsc<T extends SortableSession>(sessions: T[]): T[] {
  return [...sessions].sort(compareSessionsAsc);
}

export interface SessionMonthGroup<T extends SortableSession> {
  key: string;
  label: string;
  sessions: T[];
}

function getSessionMonthKey(dateStr: string): string | null {
  if (!isValidSessionDateString(dateStr)) return null;
  return dateStr.slice(0, 7);
}

function buildSessionMonthLabel(monthKey: string): string {
  if (monthKey === UNKNOWN_SESSION_MONTH_KEY) return UNKNOWN_SESSION_MONTH_LABEL;
  const [year, month] = monthKey.split("-");
  return `${year}년 ${parseInt(month, 10)}월`;
}

export function groupSessionsByMonth<T extends SortableSession>(
  sessions: T[],
  direction: "desc" | "asc" = "desc",
): SessionMonthGroup<T>[] {
  const grouped = new Map<string, T[]>();
  const sorted = direction === "asc" ? sortSessionsAsc(sessions) : sortSessionsDesc(sessions);

  for (const session of sorted) {
    const monthKey = getSessionMonthKey(session.date) ?? UNKNOWN_SESSION_MONTH_KEY;
    const group = grouped.get(monthKey) ?? [];
    group.push(session);
    grouped.set(monthKey, group);
  }

  return Array.from(grouped, ([key, groupSessions]) => ({
    key,
    label: buildSessionMonthLabel(key),
    sessions: groupSessions,
  }));
}

// 세션 선택 시 질문 맥락 자동완성용 힌트 문자열 생성
export function buildSessionContextHint(subject: string, topic: string, teacherName?: string): string {
  const parts: string[] = [];
  if (teacherName) parts.push(`${teacherName} 선생님의`);
  parts.push(subject);
  if (topic.trim()) parts.push(`'${topic.trim()}'`);
  parts.push("수업 중");
  return parts.join(" ");
}

interface SessionLike {
  date: string;
  subject: string;
  topic: string;
}

export interface SessionFilter {
  date?: string;
  subject?: string;
  topic?: string;
}

/** 세션 목록에서 날짜/교과/주제의 고유 옵션을 정렬해 추출한다(빈 값 제외). */
export function getSessionFilterOptions<T extends SessionLike>(sessions: T[]): {
  dates: string[];
  subjects: string[];
  topics: string[];
} {
  const uniqSorted = (values: string[]) =>
    Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).sort();
  const uniqDatesDesc = (values: string[]) =>
    Array.from(new Set(values.map((v) => v.trim()).filter(isValidSessionDateString))).sort((a, b) => b.localeCompare(a));
  return {
    dates: uniqDatesDesc(sessions.map((s) => s.date)),
    subjects: uniqSorted(sessions.map((s) => s.subject)),
    topics: uniqSorted(sessions.map((s) => s.topic)),
  };
}

/** 날짜/교과/주제 필터로 세션을 거른다(빈 필터는 무시). */
export function filterSessions<T extends SessionLike>(sessions: T[], filter: SessionFilter): T[] {
  const date = normalizeSessionDate(filter.date);
  return sessions.filter(
    (s) =>
      (!date || s.date === date) &&
      (!filter.subject || s.subject === filter.subject) &&
      (!filter.topic || s.topic === filter.topic),
  );
}

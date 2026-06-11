function formatDateKr(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;
  return `${year}년 ${parseInt(month)}월 ${parseInt(day)}일`;
}

export function buildSessionLabel(date: string, subject: string, topic: string): string {
  const parts = [formatDateKr(date), subject];
  if (topic.trim()) parts.push(topic.trim());
  return parts.join(" · ");
}

export function isSessionAvailable(sessionDate: string, now: Date = new Date()): boolean {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const today = `${y}-${m}-${d}`;
  return sessionDate >= today;
}

export function sortSessionsDesc<T extends { date: string }>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => b.date.localeCompare(a.date));
}

export function sortSessionsAsc<T extends { date: string }>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => a.date.localeCompare(b.date));
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
  return {
    dates: uniqSorted(sessions.map((s) => s.date)),
    subjects: uniqSorted(sessions.map((s) => s.subject)),
    topics: uniqSorted(sessions.map((s) => s.topic)),
  };
}

/** 날짜/교과/주제 필터로 세션을 거른다(빈 필터는 무시). */
export function filterSessions<T extends SessionLike>(sessions: T[], filter: SessionFilter): T[] {
  return sessions.filter(
    (s) =>
      (!filter.date || s.date === filter.date) &&
      (!filter.subject || s.subject === filter.subject) &&
      (!filter.topic || s.topic === filter.topic),
  );
}

export function buildSessionLabel(date: string, subject: string, topic: string): string {
  const parts = [date, subject];
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

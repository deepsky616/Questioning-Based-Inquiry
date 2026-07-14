function toDate(value: string | number | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" || typeof value === "number" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

const p = (n: number) => String(n).padStart(2, "0");

/** 날짜를 "YYYY-MM-DD" 형식으로 변환한다. */
export function formatDateOnly(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 날짜를 "YYYY-MM" 형식으로 변환한다. */
export function formatMonthOnly(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
}

/** ISO 문자열을 "YYYY-MM-DD HH:mm" 형식으로 변환한다 (질문·댓글 작성 일시 공용 표기). */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return `${formatDateOnly(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** ISO 문자열을 "HH:mm" 형식으로 변환한다 (같은 날짜 활동 시각 표기). */
export function formatClock(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** ISO 문자열을 "MM-DD HH:mm" 형식으로 변환한다 (다른 날짜 활동 시각 표기). */
export function formatShortDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 같은 달력 날짜인지 비교한다(연·월·일). */
export function isSameDay(a: string | Date | null | undefined, b: string | Date | null | undefined): boolean {
  if (!a || !b) return false;
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return false;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

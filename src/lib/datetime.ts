/** ISO 문자열을 "YYYY.MM.DD HH:mm" 형식으로 변환한다 (질문·댓글 작성 일시 공용 표기). */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" || typeof value === "number" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** ISO 문자열을 "HH:mm" 형식으로 변환한다 (같은 날짜 활동 시각 표기). */
export function formatClock(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" || typeof value === "number" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** ISO 문자열을 "MM.DD HH:mm" 형식으로 변환한다 (다른 날짜 활동 시각 표기). */
export function formatShortDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" || typeof value === "number" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 같은 달력 날짜인지 비교한다(연·월·일). */
export function isSameDay(a: string | Date | null | undefined, b: string | Date | null | undefined): boolean {
  if (!a || !b) return false;
  const da = typeof a === "string" || typeof a === "number" ? new Date(a) : a;
  const db = typeof b === "string" || typeof b === "number" ? new Date(b) : b;
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

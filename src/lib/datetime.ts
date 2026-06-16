/** ISO 문자열을 "YYYY.MM.DD HH:mm" 형식으로 변환한다 (질문·댓글 작성 일시 공용 표기). */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" || typeof value === "number" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

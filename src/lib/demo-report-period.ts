/** 조회 기준만 이동한다. 저장된 날짜나 포인트 기준은 바꾸지 않는다. */
export function demoReportReferenceDate(isDemo: boolean, period: string | null, rows: Array<{ createdAt: string | Date }>, now = new Date()): Date | undefined {
  if (!isDemo || period !== "latest") return undefined;
  let latest = 0;
  for (const row of rows) {
    const timestamp = new Date(row.createdAt).getTime();
    if (Number.isFinite(timestamp) && timestamp <= now.getTime()) latest = Math.max(latest, timestamp);
  }
  return latest ? new Date(latest) : undefined;
}

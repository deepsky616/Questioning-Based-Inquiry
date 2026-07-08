export const APP_DATA_REFETCH_MS = 12000;
export const APP_NOTIFICATION_POLL_MS = 25000;
export const APP_REPORT_REFETCH_MS = 60000;

type Visibility = DocumentVisibilityState | "server";

export function currentVisibility(): Visibility {
  if (typeof document === "undefined") return "server";
  return document.visibilityState;
}

export function visibleRefetchInterval(
  intervalMs: number,
  visibility: Visibility = currentVisibility(),
): number | false {
  return visibility === "hidden" ? false : intervalMs;
}

export function visibleDataRefetchInterval(): number | false {
  return visibleRefetchInterval(APP_DATA_REFETCH_MS);
}

export function visibleNotificationRefetchInterval(): number | false {
  return visibleRefetchInterval(APP_NOTIFICATION_POLL_MS);
}

export function visibleReportRefetchInterval(): number | false {
  return visibleRefetchInterval(APP_REPORT_REFETCH_MS);
}

/** 국제화용 번역 함수 — next-intl useTranslations 반환값과 호환 */
export type TranslateFn = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export type TeacherClassValidationKey =
  | "classesRequired"
  | "gradeRequired"
  | "classRequired"
  | "duplicateClass";

// 완성 문장이 아닌 common 네임스페이스의 메시지 키를 반환한다 —
// 호출부가 t(키)로 현재 로케일에 맞게 표시한다.
export function validateTeacherClasses(
  classes: Array<{ grade: string; className: string }>
): TeacherClassValidationKey | null {
  if (classes.length === 0) return "classesRequired";
  for (const c of classes) {
    if (!c.grade.trim()) return "gradeRequired";
    if (!c.className.trim()) return "classRequired";
  }
  const keys = classes.map((c) => `${c.grade.trim()}-${c.className.trim()}`);
  if (new Set(keys).size !== keys.length) return "duplicateClass";
  return null;
}

// t는 common 네임스페이스 번역 함수 (common.gradeClassLabel)
export function buildTeacherClassLabel(
  t: TranslateFn,
  grade: string,
  className: string,
): string {
  return t("gradeClassLabel", { grade, className });
}

export function parseTeacherClassKey(
  key: string
): { grade: string; className: string } | null {
  const idx = key.indexOf("-");
  if (idx <= 0 || idx === key.length - 1) return null;
  return { grade: key.slice(0, idx), className: key.slice(idx + 1) };
}

export function sortTeacherClasses<T extends { grade: string; className: string }>(
  classes: T[]
): T[] {
  return [...classes].sort((a, b) => {
    if (a.grade !== b.grade) return a.grade.localeCompare(b.grade, "ko-u-kn");
    return a.className.localeCompare(b.className, "ko-u-kn");
  });
}

export type ClassInputMode = "auto" | "select" | "manual";

export function resolveClassInputMode(
  classes: Array<{ grade: string; className: string }>
): ClassInputMode {
  if (classes.length === 0) return "manual";
  if (classes.length === 1) return "auto";
  return "select";
}

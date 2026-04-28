export function validateTeacherClasses(
  classes: Array<{ grade: string; className: string }>
): string | null {
  if (classes.length === 0) return "담당 학년·반을 1개 이상 추가해 주세요";
  for (const c of classes) {
    if (!c.grade.trim()) return "학년을 입력해 주세요";
    if (!c.className.trim()) return "반을 입력해 주세요";
  }
  const keys = classes.map((c) => `${c.grade.trim()}-${c.className.trim()}`);
  if (new Set(keys).size !== keys.length) return "중복된 학년·반이 있습니다";
  return null;
}

export function buildTeacherClassLabel(grade: string, className: string): string {
  return `${grade}학년 ${className}반`;
}

export function parseTeacherClassKey(
  key: string
): { grade: string; className: string } | null {
  const idx = key.indexOf("-");
  if (idx <= 0 || idx === key.length - 1) return null;
  return { grade: key.slice(0, idx), className: key.slice(idx + 1) };
}

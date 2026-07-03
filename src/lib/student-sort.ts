// 학생 정렬 공통 헬퍼 — 학급(학년·반) → 번호순.
// studentNumber는 문자열 컬럼이라 DB 사전순 정렬로는 "10"이 "2"보다 앞에 온다.
// 숫자로 해석해 비교하고, 숫자가 아니면 한국어 로케일 문자열 비교로 폴백한다.

export interface StudentSortable {
  grade?: string | null;
  className?: string | null;
  studentNumber?: string | null;
}

/** 번호 문자열을 숫자 우선으로 비교(숫자 아님 → 뒤로, 둘 다 아니면 문자열 비교) */
export function compareStudentNumber(a?: string | null, b?: string | null): number {
  const na = parseInt(a ?? "", 10);
  const nb = parseInt(b ?? "", 10);
  const aNaN = Number.isNaN(na);
  const bNaN = Number.isNaN(nb);
  if (aNaN && bNaN) return (a ?? "").localeCompare(b ?? "", "ko");
  if (aNaN) return 1;
  if (bNaN) return -1;
  return na - nb;
}

/** 학급(학년 → 반) 뒤 번호순 비교 — 학생 목록·통계 표 공용 */
export function compareByClassAndNumber(a: StudentSortable, b: StudentSortable): number {
  const gradeCmp = compareStudentNumber(a.grade, b.grade);
  if (gradeCmp !== 0) return gradeCmp;
  const classCmp = compareStudentNumber(a.className, b.className);
  if (classCmp !== 0) return classCmp;
  return compareStudentNumber(a.studentNumber, b.studentNumber);
}

export function buildStudentEmail(
  school: string,
  grade: string,
  className: string,
  studentNumber: string
): string {
  const cleanSchool = school.replace(/\s+/g, "").replace(/[^가-힣a-zA-Z0-9]/g, "");
  return `s_${cleanSchool}_${grade}_${className}_${studentNumber}@student.internal`;
}

export function parseStudentEmail(
  email: string
): { school: string; grade: string; className: string; studentNumber: string } | null {
  const match = email.match(/^s_(.+)_(\d+)_(\d+)_(\d+)@student\.internal$/);
  if (!match) return null;
  return {
    school: match[1],
    grade: match[2],
    className: match[3],
    studentNumber: match[4],
  };
}

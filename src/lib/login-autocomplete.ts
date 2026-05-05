export const STUDENT_LOGIN_FORM_PROPS = {
  autoComplete: "off",
} as const;

export const TEACHER_LOGIN_FORM_PROPS = {
  autoComplete: "on",
} as const;

export const STUDENT_LOGIN_AUTOCOMPLETE = {
  school: "off",
  grade: "off",
  className: "off",
  studentNumber: "off",
  password: "off",
} as const;

export const TEACHER_LOGIN_AUTOCOMPLETE = {
  email: "username",
  password: "current-password",
} as const;

export const STUDENT_NUMBER_INPUT_PROPS = {
  autoComplete: STUDENT_LOGIN_AUTOCOMPLETE.studentNumber,
  inputMode: "numeric",
  pattern: "[0-9]*",
} as const;

export function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function sanitizeStudentNumberInput(value: string): string {
  if (isLikelyEmail(value)) return "";
  return value.replace(/\D/g, "");
}

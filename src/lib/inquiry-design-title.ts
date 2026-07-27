import { isValidSessionDateString } from "@/lib/sessions";

const SAVED_DATE_PREFIX = /^\d{3,4}-\d{2}-\d{2}\s+/;
const SAVED_GRADE_PREFIX = /^\d{1,2}학년\s+/;

function cleanPart(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function gradeLabel(value: string | null | undefined): string {
  const grade = cleanPart(value).replace(/학년$/, "").trim();
  return grade ? `${grade}학년` : "";
}

export function extractInquiryDesignUnitTitle({
  title,
  grade,
  subject,
}: {
  title: string;
  grade?: string | null;
  subject?: string | null;
}): string {
  const original = cleanPart(title);
  const hadSavedDatePrefix = SAVED_DATE_PREFIX.test(original);
  if (!hadSavedDatePrefix) return original;

  let unitTitle = original.replace(SAVED_DATE_PREFIX, "");
  const expectedGrade = gradeLabel(grade);
  if (expectedGrade && unitTitle.startsWith(`${expectedGrade} `)) {
    unitTitle = unitTitle.slice(expectedGrade.length).trim();
  } else {
    unitTitle = unitTitle.replace(SAVED_GRADE_PREFIX, "");
  }

  const cleanSubject = cleanPart(subject);
  if (cleanSubject && unitTitle.startsWith(`${cleanSubject} `)) {
    unitTitle = unitTitle.slice(cleanSubject.length).trim();
  }
  return unitTitle || original;
}

export function buildInquiryDesignTitle({
  sessionDate,
  grade,
  subject,
  unitTitle,
}: {
  sessionDate?: string | null;
  grade?: string | null;
  subject?: string | null;
  unitTitle: string;
}): string {
  const cleanUnitTitle = extractInquiryDesignUnitTitle({
    title: unitTitle,
    grade,
    subject,
  });
  const cleanDate = cleanPart(sessionDate);
  const cleanGrade = gradeLabel(grade);
  const cleanSubject = cleanPart(subject);

  if (!isValidSessionDateString(cleanDate) || !cleanGrade || !cleanSubject || !cleanUnitTitle) {
    return cleanUnitTitle;
  }

  return `${cleanDate} ${cleanGrade} ${cleanSubject} ${cleanUnitTitle}`;
}

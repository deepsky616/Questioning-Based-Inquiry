/** 원문과 동일한 설명만 숨긴다. 학생/교사가 쓴 원본은 변경하지 않는다. */
export function hasDistinctExplanation(explanation?: string, source?: string): boolean {
  const normalize = (value = "") => value.trim().replace(/\s+/g, " ");
  return Boolean(normalize(explanation)) && normalize(explanation) !== normalize(source);
}

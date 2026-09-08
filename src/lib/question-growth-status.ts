export function isQuestionGrowthComplete(record?: { changeNote?: string | null; reflection?: string | null } | null): boolean {
  return Boolean(record?.changeNote?.trim() && record?.reflection?.trim());
}

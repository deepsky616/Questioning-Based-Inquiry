export interface Achievement {
  code: string;
  content: string;
}

export function extractUnitCode(code: string): string {
  const match = code.match(/\[[^\]]*[가-힣]+(\d+)-/);
  return match ? match[1] : "";
}

export function filterAchievementsByUnitCodes(
  achievements: Achievement[],
  selectedUnitCodes: string[],
  hasUnitGroups = false
) {
  if (hasUnitGroups && selectedUnitCodes.length === 0) return [];
  if (selectedUnitCodes.length === 0) return achievements;
  return achievements.filter((achievement) =>
    selectedUnitCodes.includes(extractUnitCode(achievement.code))
  );
}

export function selectAllAchievementCodes(achievements: Achievement[]) {
  return achievements.map((achievement) => achievement.code);
}

export function toggleAchievementCode(selectedCodes: string[], code: string) {
  return selectedCodes.includes(code)
    ? selectedCodes.filter((selectedCode) => selectedCode !== code)
    : [...selectedCodes, code];
}

export function getSelectedAchievementsForAnalysis(
  achievements: Achievement[],
  selectedCodes: string[]
) {
  return achievements.filter((achievement) => selectedCodes.includes(achievement.code));
}

export function pickAchievementExplanations(
  explanations: Record<string, string> | undefined,
  selectedCodes: string[]
) {
  if (!explanations) return {};
  const selected = new Set(selectedCodes);
  return Object.fromEntries(
    Object.entries(explanations).filter(([code]) => selected.has(code))
  );
}

import type { Achievement } from "@/lib/achievement-selection";
import { getCurriculumAchievementDetail } from "@/lib/curriculum-achievement-details";
import {
  EMPTY_STUDENT_LEARNING_GUIDES,
  type StudentAchievementGuide,
  type StudentLearningGuides,
} from "@/lib/student-learning-guide";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeCode = (value: string) =>
  value.trim().replace(/[\[\]\s]/g, "");

export function normalizeAchievements(value: unknown): Achievement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const code = typeof item.code === "string" ? item.code.trim().slice(0, 80) : "";
    const content = typeof item.content === "string" ? item.content.trim().slice(0, 1000) : "";
    return code && content ? [{ code, content }] : [];
  }).slice(0, 30);
}

export function withAchievementGuideFallback(
  guides: StudentLearningGuides | undefined,
  achievements: Achievement[],
  gradeRange: string,
  subject: string,
  area: string,
): StudentLearningGuides | undefined {
  if (achievements.length === 0) {
    return guides ? { ...guides, achievements: [] } : undefined;
  }

  const savedByIndex = new Map(
    (guides?.achievements ?? [])
      .filter((guide) => guide.index < achievements.length)
      .map((guide) => [guide.index, guide]),
  );
  const curriculumExplanations = getCurriculumAchievementDetail(
    gradeRange,
    subject,
    area,
  )?.explanations ?? {};
  const curriculumByCode = new Map(
    Object.entries(curriculumExplanations)
      .map(([code, explanation]) => [normalizeCode(code), explanation.trim()] as const)
      .filter(([, explanation]) => explanation),
  );

  const resolved = achievements.flatMap((achievement, index): StudentAchievementGuide[] => {
    const saved = savedByIndex.get(index);
    if (saved?.explanation.trim()) return [saved];
    const explanation = curriculumByCode.get(normalizeCode(achievement.code));
    return explanation ? [{ index, explanation }] : [];
  });

  if (!guides && resolved.length === 0) return undefined;
  return {
    ...(guides ?? EMPTY_STUDENT_LEARNING_GUIDES),
    achievements: resolved,
  };
}

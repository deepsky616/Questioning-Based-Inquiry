import achievementsData from "@/data/curriculum-achievements.json";

export type CurriculumAchievement = {
  code: string;
  content: string;
};

export type CurriculumAchievementGroup = {
  name: string;
  achievements: CurriculumAchievement[];
};

export type CurriculumAreaAchievementDetail = {
  achievements: CurriculumAchievement[];
  explanations: Record<string, string>;
  considerations: string[];
  achievementGroups?: CurriculumAchievementGroup[];
};

type SubjectData = Record<string, CurriculumAreaAchievementDetail>;
type GradeData = Record<string, SubjectData>;
type AchievementsJson = Record<string, GradeData>;

const curriculumAchievements = achievementsData as AchievementsJson;

export function getCurriculumAchievementDetail(
  gradeRange: string,
  subject: string,
  area: string
): CurriculumAreaAchievementDetail | null {
  return curriculumAchievements[gradeRange]?.[subject]?.[area] ?? null;
}

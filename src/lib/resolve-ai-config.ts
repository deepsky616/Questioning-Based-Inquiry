import { prisma } from "@/lib/db";
import { resolveGeminiModel } from "@/lib/api-config";

export interface ResolvedAiConfig {
  apiKey: string | null;
  model: string;
  isDemo: boolean;
}

/**
 * 작업을 수행하는 사용자 기준으로 AI 설정(키·모델)을 결정한다.
 * - 교사: 본인이 설정한 키/모델
 * - 학생: 본인 담당 학급(같은 학교·학년·반)의 교사 중 키를 설정한 교사의 키/모델
 * - 위에서 못 찾으면 레거시 전역 SystemConfig로 폴백(서비스 중단 방지)
 */
export async function resolveUserAiConfig(userId: string): Promise<ResolvedAiConfig> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      school: true,
      grade: true,
      className: true,
      aiApiKey: true,
      aiModel: true,
      isDemo: true,
    },
  });

  if (user?.isDemo) {
    const sourceEmail =
      process.env.DEMO_AI_SOURCE_EMAIL?.trim() || "climbing1126@gmail.com";
    const sourceTeacher = await prisma.user.findFirst({
      where: {
        email: sourceEmail,
        role: "TEACHER",
        isDemo: false,
        aiApiKey: { not: null },
      },
      select: { aiApiKey: true, aiModel: true },
    });
    return {
      apiKey: sourceTeacher?.aiApiKey ?? null,
      model: resolveGeminiModel(sourceTeacher?.aiModel),
      isDemo: true,
    };
  }

  // 1) 교사 본인 키
  if (user?.role === "TEACHER" && user.aiApiKey) {
    return {
      apiKey: user.aiApiKey,
      model: resolveGeminiModel(user.aiModel),
      isDemo: false,
    };
  }

  // 2) 학생 → 담당 학급 교사의 키
  if (user?.role === "STUDENT" && user.grade && user.className) {
    const teacher = await prisma.user.findFirst({
      where: {
        role: "TEACHER",
        aiApiKey: { not: null },
        ...(user.school ? { school: user.school } : {}),
        teacherClasses: { some: { grade: user.grade, className: user.className } },
      },
      select: { aiApiKey: true, aiModel: true },
      orderBy: { updatedAt: "desc" },
    });
    if (teacher?.aiApiKey) {
      return {
        apiKey: teacher.aiApiKey,
        model: resolveGeminiModel(teacher.aiModel),
        isDemo: false,
      };
    }
  }

  // 3) 레거시 전역 설정 폴백
  const [keyRecord, modelRecord] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { key: "gemini_api_key" } }),
    prisma.systemConfig.findUnique({ where: { key: "gemini_model" } }),
  ]);
  return {
    apiKey: keyRecord?.value ?? null,
    model: resolveGeminiModel(modelRecord?.value),
    isDemo: false,
  };
}

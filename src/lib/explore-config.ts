/**
 * 질문탐구 페이지 설정 — 교사가 좋아요·댓글 기능을 켜고 끌 수 있음.
 * SystemConfig 테이블에 교사 user id 기반 키로 저장.
 */

export interface ExploreConfig {
  likesEnabled: boolean;
  commentsEnabled: boolean;
}

export const EXPLORE_CONFIG_DEFAULT: ExploreConfig = {
  likesEnabled: true,
  commentsEnabled: true,
};

export const EXPLORE_CONFIG_KEY = (teacherId: string) => `explore_config_${teacherId}`;

export function parseExploreConfig(raw: string | null | undefined): ExploreConfig {
  if (!raw) return EXPLORE_CONFIG_DEFAULT;
  try {
    const v = JSON.parse(raw);
    return {
      likesEnabled: typeof v.likesEnabled === "boolean" ? v.likesEnabled : EXPLORE_CONFIG_DEFAULT.likesEnabled,
      commentsEnabled: typeof v.commentsEnabled === "boolean" ? v.commentsEnabled : EXPLORE_CONFIG_DEFAULT.commentsEnabled,
    };
  } catch {
    return EXPLORE_CONFIG_DEFAULT;
  }
}

import type { PrismaClient } from "@prisma/client";

/** 학생용: 본인 담당 교사들의 설정을 AND 결합 */
export async function resolveStudentExploreConfig(
  prisma: PrismaClient,
  studentId: string
): Promise<ExploreConfig> {
  const me = await prisma.user.findUnique({
    where: { id: studentId },
    select: { school: true, grade: true, className: true },
  });
  if (!me?.school || !me.grade || !me.className) return EXPLORE_CONFIG_DEFAULT;

  const teacherClasses = await prisma.teacherClass.findMany({
    where: { grade: me.grade, className: me.className },
    select: { teacherId: true, teacher: { select: { school: true } } },
  });
  const teacherIds = teacherClasses
    .filter((tc) => tc.teacher.school === me.school)
    .map((tc) => tc.teacherId);

  if (teacherIds.length === 0) return EXPLORE_CONFIG_DEFAULT;

  const recs = await prisma.systemConfig.findMany({
    where: { key: { in: teacherIds.map((id) => EXPLORE_CONFIG_KEY(id)) } },
  });
  let likesEnabled = true;
  let commentsEnabled = true;
  for (const tid of teacherIds) {
    const rec = recs.find((r) => r.key === EXPLORE_CONFIG_KEY(tid));
    const cfg = parseExploreConfig(rec?.value);
    if (!cfg.likesEnabled) likesEnabled = false;
    if (!cfg.commentsEnabled) commentsEnabled = false;
  }
  return { likesEnabled, commentsEnabled };
}

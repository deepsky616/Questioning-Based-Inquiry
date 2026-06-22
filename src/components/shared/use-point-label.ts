"use client";

import { useTranslations } from "next-intl";
import { GAME_LABEL, pointBonusSpec } from "@/lib/points-policy";

/**
 * 포인트 이력 라벨을 현재 로케일로 반환하는 훅(표시 시점 번역).
 * - 상(賞)·활동·게임 모드 라벨을 pointLabel 카탈로그로 해석.
 * - gameLabel(gameId): 게임 이름 단독 번역(없으면 null).
 */
export function usePointBonusLabel() {
  const t = useTranslations("pointLabel");

  const label = (bonusType: string): { label: string; emoji: string } => {
    const spec = pointBonusSpec(bonusType);
    if (spec.kind === "award") return { emoji: spec.emoji, label: t(`award_${spec.code}`) };
    if (spec.kind === "activity") return { emoji: spec.emoji, label: t(`act_${spec.code}`) };
    const mode = t(spec.mode === "solo" ? "modeSolo" : "modeAi");
    return {
      emoji: spec.emoji,
      label: spec.gameId in GAME_LABEL ? t("gameModeWithName", { mode, game: t(`game_${spec.gameId}`) }) : t("gameModeOnly", { mode }),
    };
  };

  const gameLabel = (gameId: string): string | null => (gameId in GAME_LABEL ? t(`game_${gameId}`) : null);

  return { label, gameLabel };
}

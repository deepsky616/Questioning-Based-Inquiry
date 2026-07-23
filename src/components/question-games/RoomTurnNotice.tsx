"use client";

import { useEffect, useRef } from "react";
import { BellRing } from "lucide-react";
import { useTranslations } from "next-intl";
import { LearningSoundToggle } from "@/components/shared/LearningSoundToggle";
import { useLearningSounds } from "@/lib/learning-sounds";

interface RoomTurnNoticeProps {
  active: boolean;
  turnKey: string;
}

export function RoomTurnNotice({ active, turnKey }: RoomTurnNoticeProps) {
  const t = useTranslations("gamePlay");
  const { play, ready } = useLearningSounds();
  const notifiedKeyRef = useRef<string | null>(null);
  const originalTitleRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active) {
      notifiedKeyRef.current = null;
      return;
    }
    if (!ready || notifiedKeyRef.current === turnKey) return;
    notifiedKeyRef.current = turnKey;
    play("turn");
  }, [active, play, ready, turnKey]);

  useEffect(() => {
    if (!active) return;
    if (originalTitleRef.current === null) {
      originalTitleRef.current = document.title;
    }
    document.title = `${t("myTurnTitle")} | ${originalTitleRef.current}`;
    return () => {
      if (originalTitleRef.current !== null) {
        document.title = originalTitleRef.current;
        originalTitleRef.current = null;
      }
    };
  }, [active, t]);

  if (!active) return null;

  return (
    <div
      aria-live="assertive"
      className="flex items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
      role="status"
    >
      <BellRing className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm font-semibold">{t("myTurnNotice")}</p>
      <LearningSoundToggle className="h-8 w-8 border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950" />
    </div>
  );
}

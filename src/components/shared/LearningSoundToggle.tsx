"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useLearningSounds } from "@/lib/learning-sounds";
import { cn } from "@/lib/utils";

type LearningSoundAudience = "student" | "teacher";

const GUIDE_SEEN_KEY = "question-learning-sound-guide-seen-v1";
const guideSeenWithoutStorage = new Set<LearningSoundAudience>();

function currentAudience(audience?: LearningSoundAudience): LearningSoundAudience {
  if (audience) return audience;
  return window.location.pathname.startsWith("/teacher") ? "teacher" : "student";
}

export function LearningSoundToggle({
  className,
  audience,
}: {
  className?: string;
  audience?: LearningSoundAudience;
}) {
  const t = useTranslations("learningSound");
  const { enabled, setSoundEnabled, toggle } = useLearningSounds();
  const [guideOpen, setGuideOpen] = useState(false);
  const label = enabled ? t("turnOff") : t("turnOn");

  useEffect(() => {
    const resolvedAudience = currentAudience(audience);
    const key = `${GUIDE_SEEN_KEY}:${resolvedAudience}`;

    try {
      if (window.localStorage.getItem(key) === "seen") return;
      window.localStorage.setItem(key, "seen");
    } catch {
      if (guideSeenWithoutStorage.has(resolvedAudience)) return;
      guideSeenWithoutStorage.add(resolvedAudience);
    }

    setGuideOpen(true);
  }, [audience]);

  function handleToggle() {
    toggle();
    setGuideOpen(false);
  }

  function handleGuideEnable() {
    if (!enabled) toggle();
    setGuideOpen(false);
  }

  function handleGuideDismiss() {
    setSoundEnabled(false);
    setGuideOpen(false);
  }

  return (
    <div className="relative shrink-0">
      <Button
        type="button"
        size="icon"
        variant="outline"
        className={cn("h-9 w-9 shrink-0 bg-background", className)}
        aria-label={label}
        title={label}
        aria-expanded={guideOpen}
        onClick={handleToggle}
      >
        {enabled ? (
          <Volume2 className="h-4 w-4" aria-hidden="true" />
        ) : (
          <VolumeX className="h-4 w-4" aria-hidden="true" />
        )}
      </Button>

      {guideOpen && (
        <aside
          role="region"
          aria-label={t("guideLabel")}
          className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-background p-3 text-foreground shadow-lg"
        >
          <p className="text-sm font-semibold">{t("guideTitle")}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t("guideDescription")}
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleGuideDismiss}
            >
              {t("guideDismiss")}
            </Button>
            <Button type="button" size="sm" onClick={handleGuideEnable}>
              {t("guideEnable")}
            </Button>
          </div>
        </aside>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useLearningSounds } from "@/lib/learning-sounds";
import { cn } from "@/lib/utils";
import { useCurrentUserIdentity } from "@/components/shared/current-user-identity";

type LearningSoundAudience = "student" | "teacher";

const GUIDE_SEEN_KEY = "question-learning-sound-guide-seen-v2";
const activeGuideKeys = new Set<string>();
const guideSeenWithoutStorage = new Set<string>();

function currentAudience(audience?: LearningSoundAudience): LearningSoundAudience {
  if (audience) return audience;
  return window.location.pathname.startsWith("/teacher") ? "teacher" : "student";
}

function guideKey(audience: LearningSoundAudience, userId: string | null): string {
  const identity = userId?.trim() || "browser";
  return `${GUIDE_SEEN_KEY}:${audience}:${encodeURIComponent(identity)}`;
}

export function LearningSoundToggle({
  className,
  audience,
}: {
  className?: string;
  audience?: LearningSoundAudience;
}) {
  const t = useTranslations("learningSound");
  const userId = useCurrentUserIdentity();
  const { enabled, setSoundEnabled, toggle } = useLearningSounds();
  const [guideOpen, setGuideOpen] = useState(false);
  const openGuideKeyRef = useRef<string | null>(null);
  const label = enabled ? t("turnOff") : t("turnOn");

  useEffect(() => {
    const resolvedAudience = currentAudience(audience);
    const key = guideKey(resolvedAudience, userId);
    let seen = false;

    try {
      seen = window.localStorage.getItem(key) === "seen";
    } catch {
      seen = guideSeenWithoutStorage.has(key);
    }
    if (seen || activeGuideKeys.has(key)) return;

    activeGuideKeys.add(key);
    openGuideKeyRef.current = key;
    setGuideOpen(true);

    return () => {
      activeGuideKeys.delete(key);
      if (openGuideKeyRef.current === key) openGuideKeyRef.current = null;
    };
  }, [audience, userId]);

  function confirmGuide() {
    const key = openGuideKeyRef.current;
    if (key) {
      try {
        window.localStorage.setItem(key, "seen");
      } catch {
        guideSeenWithoutStorage.add(key);
      }
      activeGuideKeys.delete(key);
      openGuideKeyRef.current = null;
    }
    setGuideOpen(false);
  }

  function handleToggle() {
    toggle();
    if (guideOpen) confirmGuide();
  }

  function handleGuideEnable() {
    if (!enabled) toggle();
    confirmGuide();
  }

  function handleGuideDismiss() {
    setSoundEnabled(false);
    confirmGuide();
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

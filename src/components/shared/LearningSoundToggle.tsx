"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useLearningSounds } from "@/lib/learning-sounds";
import { cn } from "@/lib/utils";

export function LearningSoundToggle({ className }: { className?: string }) {
  const t = useTranslations("learningSound");
  const { enabled, toggle } = useLearningSounds();
  const label = enabled ? t("turnOff") : t("turnOn");

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className={cn("h-9 w-9 shrink-0 bg-background", className)}
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      {enabled ? (
        <Volume2 className="h-4 w-4" aria-hidden="true" />
      ) : (
        <VolumeX className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}

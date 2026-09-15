"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MYSTERY_ITEMS, type BuiltInMysteryItemId, type MysteryLocale } from "@/lib/mystery-box-rules";
import { MYSTERY_COLOR_LABELS, MYSTERY_GAME_COLORS } from "@/lib/mystery-colors";

export function MysteryColorGuide({ locale }: { locale: MysteryLocale }) {
  const t = useTranslations("gamePlay");
  const [open, setOpen] = useState(false);
  return (
    <details className="rounded-lg border border-border bg-card text-sm text-card-foreground" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer rounded-lg px-4 py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        {t("mysteryColorGuideTitle")}
      </summary>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          <p className="leading-relaxed text-muted-foreground">{t("mysteryColorGuideDescription")}</p>
          <dl className="grid max-h-64 gap-x-5 gap-y-3 overflow-y-auto sm:grid-cols-2" tabIndex={0} aria-label={t("mysteryColorGuideTitle")}>
            {MYSTERY_ITEMS.map(item => (
              <div key={item.id}>
                <dt className="font-semibold">{item.names[locale]}</dt>
                <dd className="text-muted-foreground">{MYSTERY_GAME_COLORS[item.id as BuiltInMysteryItemId].map(color => MYSTERY_COLOR_LABELS[color][locale]).join(" · ")}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </details>
  );
}

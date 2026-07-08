"use client";

import { useTranslations } from "next-intl";

export type CurriculumMainTab = "create" | "saved";

interface CurriculumMainTabsProps {
  value: CurriculumMainTab;
  savedCount: number;
  onChange: (value: CurriculumMainTab) => void;
}

export function CurriculumMainTabs({ value, savedCount, onChange }: CurriculumMainTabsProps) {
  const t = useTranslations("curriculum");
  const tabClass = (tab: CurriculumMainTab, withDivider = false) =>
    `px-4 py-2 text-sm font-medium transition-colors ${withDivider ? "border-l " : ""}${
      value === tab ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"
    }`;

  return (
    <div className="flex rounded-md border overflow-hidden w-fit">
      <button type="button" onClick={() => onChange("create")} className={tabClass("create")}>
        {t("tabCreate")}
      </button>
      <button type="button" onClick={() => onChange("saved")} className={tabClass("saved", true)}>
        {t("tabSaved")}
        {savedCount > 0 ? ` (${savedCount})` : ""}
      </button>
    </div>
  );
}

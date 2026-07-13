"use client";

import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { StudentRankPanel, ClassRankingPanel } from "@/components/shared/RankingPanels";

export default function StudentPointsPage() {
  const tPages = useTranslations("pages");
  const t = useTranslations("studentPoints");

  return (
    <div className="space-y-6">
      <PageHeader title={tPages("studentPoints.title")} description={tPages("studentPoints.description")} />

      <div>
        <h2 className="text-lg font-semibold text-foreground">{t("rankingTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("rankingDesc")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StudentRankPanel highlightSelf />
        <ClassRankingPanel highlightSelf defaultScope="school" />
      </div>
    </div>
  );
}

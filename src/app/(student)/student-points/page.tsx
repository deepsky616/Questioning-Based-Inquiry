"use client";

import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { StudentRankPanel, ClassRankingPanel } from "@/components/shared/RankingPanels";

export default function StudentPointsPage() {
  const tPages = useTranslations("pages");

  return (
    <div className="space-y-6">
      <PageHeader title={tPages("studentPoints.title")} description={tPages("studentPoints.description")} />

      <div className="grid gap-4 lg:grid-cols-2">
        <StudentRankPanel highlightSelf scrollable={false} />
        <ClassRankingPanel highlightSelf defaultScope="school" scrollable={false} />
      </div>
    </div>
  );
}

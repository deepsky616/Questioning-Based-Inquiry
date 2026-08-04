"use client";

import { Suspense } from "react";
import { MyQuestionsView } from "@/components/student/MyQuestionsView";
import { ExploreQuestionsView } from "@/components/student/ExploreQuestionsView";
import { UnitDesignView } from "@/components/student/UnitDesignView";
import { PageHeader } from "@/components/shared/PageHeader";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";

type Tab = "mine" | "explore" | "design";

const TABS: { value: Tab; labelKey: "tabMine" | "tabExplore" | "tabDesign" }[] = [
  { value: "explore", labelKey: "tabExplore" },
  { value: "design", labelKey: "tabDesign" },
  { value: "mine", labelKey: "tabMine" },
];

export default function StudentQuestionsPage() {
  return (
    <Suspense fallback={null}>
      <StudentQuestionsContent />
    </Suspense>
  );
}

function StudentQuestionsContent() {
  const tPages = useTranslations("pages");
  const t = useTranslations("studentQ");
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: Tab = requestedTab === "mine" || requestedTab === "design" ? requestedTab : "explore";

  const setTab = (nextTab: Tab) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextTab === "explore") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", nextTab);
    }
    const query = nextParams.toString();
    router.push(query ? `/student-questions?${query}` : "/student-questions", { scroll: false });
  };

  return (
    <div className="space-y-5">
      <PageHeader title={tPages("studentQuestions.title")} description={tPages("studentQuestions.description")} />

      <div className="flex flex-wrap rounded-md border overflow-hidden w-fit">
        {TABS.map((tabItem, i) => (
          <button
            key={tabItem.value}
            type="button"
            onClick={() => setTab(tabItem.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${i > 0 ? "border-l" : ""} ${
              tab === tabItem.value ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {t(tabItem.labelKey)}
          </button>
        ))}
      </div>

      {tab === "mine" && <MyQuestionsView />}
      {tab === "explore" && <ExploreQuestionsView />}
      {tab === "design" && <UnitDesignView />}
    </div>
  );
}

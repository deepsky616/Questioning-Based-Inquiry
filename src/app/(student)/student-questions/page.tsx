"use client";

import { useState } from "react";
import { MyQuestionsView } from "@/components/student/MyQuestionsView";
import { ExploreQuestionsView } from "@/components/student/ExploreQuestionsView";
import { UnitDesignView } from "@/components/student/UnitDesignView";
import { PageHeader } from "@/components/shared/PageHeader";
import { useTranslations } from "next-intl";

type Tab = "mine" | "explore" | "design";

const TABS: { value: Tab; label: string }[] = [
  { value: "mine", label: "📝 내 질문" },
  { value: "explore", label: "🔎 전체 질문 탐구" },
  { value: "design", label: "🧩 수업 탐구 질문" },
];

export default function StudentQuestionsPage() {
  const tPages = useTranslations("pages");
  const [tab, setTab] = useState<Tab>("mine");

  return (
    <div className="space-y-5">
      <PageHeader title={tPages("studentQuestions.title")} description={tPages("studentQuestions.description")} />

      <div className="flex flex-wrap rounded-md border overflow-hidden w-fit">
        {TABS.map((t, i) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${i > 0 ? "border-l" : ""} ${
              tab === t.value ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "mine" && <MyQuestionsView />}
      {tab === "explore" && <ExploreQuestionsView />}
      {tab === "design" && <UnitDesignView />}
    </div>
  );
}

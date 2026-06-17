"use client";

import { useState } from "react";
import { MyQuestionsView } from "@/components/student/MyQuestionsView";
import { ExploreQuestionsView } from "@/components/student/ExploreQuestionsView";
import { UnitDesignView } from "@/components/student/UnitDesignView";

type Tab = "mine" | "explore" | "design";

const TABS: { value: Tab; label: string }[] = [
  { value: "mine", label: "📝 내 질문" },
  { value: "explore", label: "🔎 전체 질문 탐구" },
  { value: "design", label: "🧩 탐구설계" },
];

export default function StudentQuestionsPage() {
  const [tab, setTab] = useState<Tab>("mine");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">질문탐구</h2>
        <p className="text-gray-600">내 질문을 관리하고, 친구들의 질문을 탐구하고, 선생님이 배포한 탐구설계에 참여해 보세요</p>
      </div>

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

"use client";

import { useState } from "react";
import { MyQuestionsView } from "@/components/student/MyQuestionsView";
import { ExploreQuestionsView } from "@/components/student/ExploreQuestionsView";

type Tab = "mine" | "explore";

export default function StudentQuestionsPage() {
  const [tab, setTab] = useState<Tab>("mine");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">질문</h2>
        <p className="text-gray-600">내가 쓴 질문을 관리하고, 친구들의 질문을 탐구해 보세요</p>
      </div>

      <div className="flex rounded-md border overflow-hidden w-fit">
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            tab === "mine" ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          📝 내 질문
        </button>
        <button
          type="button"
          onClick={() => setTab("explore")}
          className={`px-4 py-2 text-sm font-medium border-l transition-colors ${
            tab === "explore" ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          🔎 전체 질문 탐구
        </button>
      </div>

      {tab === "mine" ? <MyQuestionsView /> : <ExploreQuestionsView />}
    </div>
  );
}

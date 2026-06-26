"use client";

import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { StudentReportView } from "@/components/reports/StudentReportView";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { StatBar } from "@/components/shared/StatBar";
import { ClassificationDonut } from "@/components/shared/ClassificationDonut";
import { DashboardSkeleton } from "@/components/shared/DashboardSkeleton";
import { getSessionUser } from "@/lib/auth-helpers";
import { CLOSURE_LABEL, CLOSURE_STYLE, COGNITIVE_LABEL, COGNITIVE_STYLE, matchesCognitiveCategory } from "@/lib/question-labels";
import PointsCard from "@/components/shared/PointsCard";
import { StudentRankPanel, ClassRankingPanel } from "@/components/shared/RankingPanels";
import { EmptyState } from "@/components/shared/EmptyState";

interface Question {
  id: string;
  content: string;
  closure: string;
  cognitive: string;
  createdAt: string;
}

interface Stats {
  total: number;
  byClosure: { closed: number; open: number };
  byCognitive: { factual: number; conceptual: number; controversial: number };
}

export default function StudentDashboardPage() {
  // useSearchParams(탭 쿼리)는 Suspense 경계가 필요하다
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <StudentDashboard />
    </Suspense>
  );
}

function StudentDashboard() {
  const { data: session } = useSession();
  const user = getSessionUser(session);
  const tCls = useTranslations("classification");
  const tc = useTranslations("common");
  const t = useTranslations("studentDash");
  const tDash = useTranslations("dashboard");
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") === "reports" ? "reports" : "overview";
  const setTab = (v: "overview" | "reports") =>
    router.replace(v === "reports" ? "/student-dashboard?tab=reports" : "/student-dashboard", { scroll: false });
  // 내 질문/통계는 react-query로 주기 폴링(12초)+포커스 재조회.
  const { data: allQuestions = [], isLoading } = useQuery<Question[]>({
    queryKey: ["student-dashboard-questions", user.id],
    queryFn: async () => {
      const r = await fetch(`/api/questions?authorId=${user.id}`);
      if (!r.ok) throw new Error("failed to load questions");
      return r.json();
    },
    enabled: Boolean(user.id),
    refetchInterval: 12000,
    refetchOnWindowFocus: true,
  });

  const questions = allQuestions.slice(0, 5);
  const stats: Stats = {
    total: allQuestions.length,
    byClosure: {
      closed: allQuestions.filter((q) => q.closure === "closed").length,
      open: allQuestions.filter((q) => q.closure === "open").length,
    },
    byCognitive: {
      factual: allQuestions.filter((q) => matchesCognitiveCategory(q.cognitive, "factual")).length,
      conceptual: allQuestions.filter((q) => matchesCognitiveCategory(q.cognitive, "conceptual")).length,
      controversial: allQuestions.filter((q) => matchesCognitiveCategory(q.cognitive, "controversial")).length,
    },
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">
          {t("greeting", { name: user.name ?? "" })}
        </h2>
        <p className="text-muted-foreground">{t("greetingSub")}</p>
      </div>

      {/* 개요 / 상세 리포트 탭 */}
      <div className="flex w-fit rounded-md border overflow-hidden">
        {(["overview", "reports"] as const).map((v, i) => (
          <button
            key={v}
            type="button"
            onClick={() => setTab(v)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${i > 0 ? "border-l" : ""} ${
              tab === v ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {v === "overview" ? tDash("tabOverview") : tDash("tabReports")}
          </button>
        ))}
      </div>

      {tab === "reports" ? (
        <StudentReportView />
      ) : (
      <>
      {/* 포인트 카드 */}
      <PointsCard />

      {isLoading ? (
        <DashboardSkeleton />
      ) : (
        <>
      {/* 총 질문 수 */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{t("totalQuestions")}</p>
          <p className="text-4xl font-bold mt-0.5">{stats.total}</p>
        </CardContent>
      </Card>

      {/* 분류 1 · 닫힌 질문 / 열린 질문 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{tCls("card1")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <ClassificationDonut
              slices={[
                { name: tCls("closed.label"), value: stats.byClosure.closed, fill: "#3b82f6" },
                { name: tCls("open.label"), value: stats.byClosure.open, fill: "#22c55e" },
              ]}
            />
            <div className="grid grid-cols-2 gap-6 flex-1 w-full">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                    <span className="text-sm font-medium break-keep text-center">{tCls("closed.label")}</span>
                  </div>
                  <span className="text-2xl font-bold text-blue-600">{stats.byClosure.closed}</span>
                </div>
                <StatBar value={stats.byClosure.closed} total={stats.total} color="bg-blue-500" />
                <p className="text-xs text-muted-foreground">{tCls("closed.desc")}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                    <span className="text-sm font-medium break-keep text-center">{tCls("open.label")}</span>
                  </div>
                  <span className="text-2xl font-bold text-green-600">{stats.byClosure.open}</span>
                </div>
                <StatBar value={stats.byClosure.open} total={stats.total} color="bg-green-500" />
                <p className="text-xs text-muted-foreground">{tCls("open.desc")}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 분류 2 · 사실적 / 개념적 / 논쟁적 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{tCls("card2")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <ClassificationDonut
              slices={[
                { name: tCls("factual.label"), value: stats.byCognitive.factual, fill: "#94a3b8" },
                { name: tCls("conceptual.label"), value: stats.byCognitive.conceptual, fill: "#a855f7" },
                { name: tCls("controversial.label"), value: stats.byCognitive.controversial, fill: "#f97316" },
              ]}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-1 w-full">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />
                    <span className="text-sm font-medium break-keep text-center">{tCls("factual.label")}</span>
                  </div>
                  <span className="text-2xl font-bold text-foreground">{stats.byCognitive.factual}</span>
                </div>
                <StatBar value={stats.byCognitive.factual} total={stats.total} color="bg-gray-400" />
                <p className="text-xs text-muted-foreground">{tCls("factual.desc")}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
                    <span className="text-sm font-medium break-keep text-center">{tCls("conceptual.label")}</span>
                  </div>
                  <span className="text-2xl font-bold text-purple-600">{stats.byCognitive.conceptual}</span>
                </div>
                <StatBar value={stats.byCognitive.conceptual} total={stats.total} color="bg-purple-500" />
                <p className="text-xs text-muted-foreground">{tCls("conceptual.desc")}</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                    <span className="text-sm font-medium break-keep text-center">{tCls("controversial.label")}</span>
                  </div>
                  <span className="text-2xl font-bold text-orange-600">{stats.byCognitive.controversial}</span>
                </div>
                <StatBar value={stats.byCognitive.controversial} total={stats.total} color="bg-orange-500" />
                <p className="text-xs text-muted-foreground">{tCls("controversial.desc")}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 최근 질문 */}
      <Card>
        <CardHeader>
          <CardTitle>{t("recentTitle")}</CardTitle>
          <CardDescription>{t("recentDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {questions.length === 0 ? (
            <EmptyState icon="✏️" title={t("empty")} description={t("emptyDesc")} />
          ) : (
            <div className="space-y-3">
              {questions.map((q) => (
                <div key={q.id} className="p-4 bg-muted/40 rounded-lg">
                  <p className="text-foreground line-clamp-1">{q.content}</p>
                  <div className="flex gap-2 mt-2">
                    <span className={`text-xs px-2 py-1 rounded break-keep text-center ${CLOSURE_STYLE[q.closure]}`}>
                      {CLOSURE_LABEL[q.closure]}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded break-keep text-center ${COGNITIVE_STYLE[q.cognitive]}`}>
                      {COGNITIVE_LABEL[q.cognitive]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4">
            <Link href="/student-questions">
              <Button variant="outline">{t("viewAll")}</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* 순위 (개인: 우리반/교내/전체 · 반: 교내/전체) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <StudentRankPanel highlightSelf />
        <ClassRankingPanel highlightSelf defaultScope="school" />
      </div>
        </>
      )}
      </>
      )}
    </div>
  );
}

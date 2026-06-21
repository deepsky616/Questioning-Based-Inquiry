"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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

export default function StudentDashboard() {
  const { data: session } = useSession();
  const user = getSessionUser(session);
  const tCls = useTranslations("classification");
  const tc = useTranslations("common");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    byClosure: { closed: 0, open: 0 },
    byCognitive: { factual: 0, conceptual: 0, controversial: 0 },
  });

  useEffect(() => {
    if (!user.id) return;
    setIsLoading(true);
    fetch(`/api/questions?authorId=${user.id}`)
      .then((r) => r.json())
      .then((data: Question[]) => {
        setQuestions(data.slice(0, 5));
        setStats({
          total: data.length,
          byClosure: {
            closed: data.filter((q) => q.closure === "closed").length,
            open: data.filter((q) => q.closure === "open").length,
          },
          byCognitive: {
            factual: data.filter((q) => matchesCognitiveCategory(q.cognitive, "factual")).length,
            conceptual: data.filter((q) => matchesCognitiveCategory(q.cognitive, "conceptual")).length,
            controversial: data.filter((q) => matchesCognitiveCategory(q.cognitive, "controversial")).length,
          },
        });
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [user.id]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">
          안녕하세요, {user.name} 학생!
        </h2>
        <p className="text-muted-foreground">오늘도 좋은 질문을 만들어 보세요</p>
      </div>

      {/* 포인트 카드 */}
      <PointsCard />

      {isLoading ? (
        <DashboardSkeleton />
      ) : (
        <>
      {/* 총 질문 수 */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">내가 작성한 총 질문 수</p>
          <p className="text-4xl font-bold mt-0.5">{stats.total}</p>
        </CardContent>
      </Card>

      {/* 분류 1 · 폐쇄형 / 개방형 */}
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
                    <span className="text-sm font-medium">{tCls("closed.label")} {tc("questionWord")}</span>
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
                    <span className="text-sm font-medium">{tCls("open.label")} {tc("questionWord")}</span>
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
                    <span className="text-sm font-medium">{tCls("factual.label")}</span>
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
                    <span className="text-sm font-medium">{tCls("conceptual.label")}</span>
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
                    <span className="text-sm font-medium">{tCls("controversial.label")}</span>
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
          <CardTitle>최근 질문</CardTitle>
          <CardDescription>내가 작성한 최근 질문 목록입니다</CardDescription>
        </CardHeader>
        <CardContent>
          {questions.length === 0 ? (
            <EmptyState icon="✏️" title="아직 질문이 없어요" description="첫 질문을 작성해 보세요!" />
          ) : (
            <div className="space-y-3">
              {questions.map((q) => (
                <div key={q.id} className="p-4 bg-muted/40 rounded-lg">
                  <p className="text-foreground line-clamp-1">{q.content}</p>
                  <div className="flex gap-2 mt-2">
                    <span className={`text-xs px-2 py-1 rounded ${CLOSURE_STYLE[q.closure]}`}>
                      {CLOSURE_LABEL[q.closure]}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${COGNITIVE_STYLE[q.cognitive]}`}>
                      {COGNITIVE_LABEL[q.cognitive]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4">
            <Link href="/student-questions">
              <Button variant="outline">전체 질문 보기</Button>
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
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { StatBar } from "@/components/shared/StatBar";
import { getSessionUser } from "@/lib/auth-helpers";
import { CLOSURE_LABEL, CLOSURE_STYLE, COGNITIVE_LABEL, COGNITIVE_STYLE } from "@/lib/question-labels";

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
  byCognitive: { factual: number; interpretive: number; evaluative: number };
}

export default function StudentDashboard() {
  const { data: session } = useSession();
  const user = getSessionUser(session);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    byClosure: { closed: 0, open: 0 },
    byCognitive: { factual: 0, interpretive: 0, evaluative: 0 },
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
            factual: data.filter((q) => q.cognitive === "factual").length,
            interpretive: data.filter((q) => q.cognitive === "interpretive").length,
            evaluative: data.filter((q) => q.cognitive === "evaluative").length,
          },
        });
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [user.id]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            안녕하세요, {user.name} 학생!
          </h2>
          <p className="text-gray-600">오늘도 좋은 질문을 만들어 보세요</p>
        </div>
        <Link href="/student-ask">
          <Button size="lg">질문하기</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">로딩 중...</div>
      ) : (
        <>
      {/* 총 질문 수 */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-gray-500">내가 작성한 총 질문 수</p>
          <p className="text-4xl font-bold mt-0.5">{stats.total}</p>
        </CardContent>
      </Card>

      {/* 분류 1 · 폐쇄형 / 개방형 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">분류 1 · 폐쇄형 / 개방형 질문</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                  <span className="text-sm font-medium">폐쇄형 질문</span>
                </div>
                <span className="text-2xl font-bold text-blue-600">{stats.byClosure.closed}</span>
              </div>
              <StatBar value={stats.byClosure.closed} total={stats.total} color="bg-blue-500" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                  <span className="text-sm font-medium">개방형 질문</span>
                </div>
                <span className="text-2xl font-bold text-green-600">{stats.byClosure.open}</span>
              </div>
              <StatBar value={stats.byClosure.open} total={stats.total} color="bg-green-500" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 분류 2 · 사실적 / 해석적 / 평가적 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">분류 2 · 사실적 / 해석적 / 평가적 질문</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />
                  <span className="text-sm font-medium">사실적 질문</span>
                </div>
                <span className="text-2xl font-bold text-gray-700">{stats.byCognitive.factual}</span>
              </div>
              <StatBar value={stats.byCognitive.factual} total={stats.total} color="bg-gray-400" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
                  <span className="text-sm font-medium">해석적 질문</span>
                </div>
                <span className="text-2xl font-bold text-purple-600">{stats.byCognitive.interpretive}</span>
              </div>
              <StatBar value={stats.byCognitive.interpretive} total={stats.total} color="bg-purple-500" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                  <span className="text-sm font-medium">평가적 질문</span>
                </div>
                <span className="text-2xl font-bold text-orange-600">{stats.byCognitive.evaluative}</span>
              </div>
              <StatBar value={stats.byCognitive.evaluative} total={stats.total} color="bg-orange-500" />
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
            <div className="text-center py-8 text-gray-500">
              아직 질문이 없습니다. 첫 질문을 작성해 보세요!
            </div>
          ) : (
            <div className="space-y-3">
              {questions.map((q) => (
                <div key={q.id} className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-gray-900 line-clamp-1">{q.content}</p>
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
            <Link href="/student-history">
              <Button variant="outline">전체 질문 보기</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}

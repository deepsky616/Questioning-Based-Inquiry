"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSession } from "next-auth/react";

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
  const [questions, setQuestions] = useState<Question[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, byClosure: { closed: 0, open: 0 }, byCognitive: { factual: 0, interpretive: 0, evaluative: 0 } });

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    const userId = (session?.user as any)?.id;
    const res = await fetch(`/api/questions?authorId=${userId}`);
    const data = await res.json();
    setQuestions(data.slice(0, 5));

    const total = data.length;
    const byClosure = {
      closed: data.filter((q: Question) => q.closure === "closed").length,
      open: data.filter((q: Question) => q.closure === "open").length,
    };
    const byCognitive = {
      factual: data.filter((q: Question) => q.cognitive === "factual").length,
      interpretive: data.filter((q: Question) => q.cognitive === "interpretive").length,
      evaluative: data.filter((q: Question) => q.cognitive === "evaluative").length,
    };
    setStats({ total, byClosure, byCognitive });
  };

  const getCognitiveLabel = (c: string) => {
    const map: Record<string, string> = { factual: "사실적", interpretive: "해석적", evaluative: "평가적" };
    return map[c] || c;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">안녕하세요, {(session?.user as any)?.name}同学!</h2>
          <p className="text-gray-600">오늘도 좋은 질문을 만들어 보세요</p>
        </div>
        <Link href="/ask">
          <Button size="lg">질문하기</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">총 질문 수</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">페쇄형</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.byClosure.closed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">개방형</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.byClosure.open}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">평가적 질문</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">{stats.byCognitive.evaluative}</div>
          </CardContent>
        </Card>
      </div>

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
            <div className="space-y-4">
              {questions.map((q) => (
                <div key={q.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-gray-900 line-clamp-1">{q.content}</p>
                    <div className="flex gap-2 mt-2">
                      <span className={`text-xs px-2 py-1 rounded ${q.closure === "closed" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                        {q.closure === "closed" ? "페쇄형" : "개방형"}
                      </span>
                      <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700">
                        {getCognitiveLabel(q.cognitive)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4">
            <Link href="/history">
              <Button variant="outline">전체 질문 보기</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
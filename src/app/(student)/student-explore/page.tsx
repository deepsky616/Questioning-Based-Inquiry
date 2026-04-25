"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface Question {
  id: string;
  content: string;
  closure: string;
  cognitive: string;
  author: { name: string; className?: string };
  createdAt: string;
}

const CLOSURE_STYLE: Record<string, string> = {
  closed: "bg-blue-100 text-blue-700",
  open: "bg-green-100 text-green-700",
};
const CLOSURE_LABEL: Record<string, string> = { closed: "폐쇄형", open: "개방형" };
const COGNITIVE_STYLE: Record<string, string> = {
  factual: "bg-gray-100 text-gray-700",
  interpretive: "bg-purple-100 text-purple-700",
  evaluative: "bg-orange-100 text-orange-700",
};
const COGNITIVE_LABEL: Record<string, string> = { factual: "사실적", interpretive: "해석적", evaluative: "평가적" };

function QuestionCard({ q }: { q: Question }) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg flex justify-between items-start gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-gray-900">{q.content}</p>
        <div className="flex gap-2 mt-2">
          <span className={`text-xs px-2 py-1 rounded ${CLOSURE_STYLE[q.closure]}`}>
            {CLOSURE_LABEL[q.closure]}
          </span>
          <span className={`text-xs px-2 py-1 rounded ${COGNITIVE_STYLE[q.cognitive]}`}>
            {COGNITIVE_LABEL[q.cognitive]}
          </span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm text-gray-600">{q.author.name}</div>
        {q.author.className && (
          <div className="text-xs text-gray-400">{q.author.className}</div>
        )}
      </div>
    </div>
  );
}

export default function ExplorePage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/questions?isPublic=true")
      .then((r) => r.json())
      .then(setQuestions)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = questions.filter(
    (q) =>
      q.content.toLowerCase().includes(search.toLowerCase()) ||
      q.author.name.toLowerCase().includes(search.toLowerCase())
  );

  const byType = (key: "closure" | "cognitive", value: string) =>
    filtered.filter((q) => q[key] === value);

  const Empty = () => (
    <div className="text-center py-8 text-gray-400 text-sm">
      {search ? "검색 결과가 없습니다" : "해당하는 질문이 없습니다"}
    </div>
  );

  if (isLoading) {
    return <div className="text-center py-16 text-gray-400">로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">질문 탐구</h2>
        <p className="text-gray-600">다른 학생들의 질문을 두 가지 분류로 살펴보세요 · 공개 {questions.length}개</p>
      </div>

      <Input
        placeholder="질문 또는 이름으로 검색..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* 분류 1: 폐쇄형 / 개방형 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">분류 1 · 폐쇄형 / 개방형 질문</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="closed">
            <TabsList>
              <TabsTrigger value="closed">
                폐쇄형 질문 <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{byType("closure", "closed").length}</span>
              </TabsTrigger>
              <TabsTrigger value="open">
                개방형 질문 <span className="ml-1.5 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{byType("closure", "open").length}</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="closed">
              {byType("closure", "closed").length === 0 ? <Empty /> : (
                <div className="space-y-3">
                  {byType("closure", "closed").map((q) => <QuestionCard key={q.id} q={q} />)}
                </div>
              )}
            </TabsContent>
            <TabsContent value="open">
              {byType("closure", "open").length === 0 ? <Empty /> : (
                <div className="space-y-3">
                  {byType("closure", "open").map((q) => <QuestionCard key={q.id} q={q} />)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 분류 2: 사실적 / 해석적 / 평가적 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">분류 2 · 사실적 / 해석적 / 평가적 질문</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="factual">
            <TabsList>
              <TabsTrigger value="factual">
                사실적 질문 <span className="ml-1.5 text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">{byType("cognitive", "factual").length}</span>
              </TabsTrigger>
              <TabsTrigger value="interpretive">
                해석적 질문 <span className="ml-1.5 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{byType("cognitive", "interpretive").length}</span>
              </TabsTrigger>
              <TabsTrigger value="evaluative">
                평가적 질문 <span className="ml-1.5 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">{byType("cognitive", "evaluative").length}</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="factual">
              {byType("cognitive", "factual").length === 0 ? <Empty /> : (
                <div className="space-y-3">
                  {byType("cognitive", "factual").map((q) => <QuestionCard key={q.id} q={q} />)}
                </div>
              )}
            </TabsContent>
            <TabsContent value="interpretive">
              {byType("cognitive", "interpretive").length === 0 ? <Empty /> : (
                <div className="space-y-3">
                  {byType("cognitive", "interpretive").map((q) => <QuestionCard key={q.id} q={q} />)}
                </div>
              )}
            </TabsContent>
            <TabsContent value="evaluative">
              {byType("cognitive", "evaluative").length === 0 ? <Empty /> : (
                <div className="space-y-3">
                  {byType("cognitive", "evaluative").map((q) => <QuestionCard key={q.id} q={q} />)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Question {
  id: string;
  content: string;
  closure: string;
  cognitive: string;
  author: {
    name: string;
    className?: string;
  };
  createdAt: string;
}

export default function ExplorePage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchPublicQuestions();
  }, []);

  const fetchPublicQuestions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/questions?isPublic=true");
      const data = await res.json();
      setQuestions(data);
    } finally {
      setIsLoading(false);
    }
  };

  const getCognitiveLabel = (c: string) => {
    const map: Record<string, string> = { factual: "사실적", interpretive: "해석적", evaluative: "평가적" };
    return map[c] || c;
  };

  const filteredQuestions = questions.filter((q) =>
    q.content.toLowerCase().includes(search.toLowerCase()) ||
    q.author.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">질문 탐구</h2>
        <p className="text-gray-600">다른 학생들이 작성한 질문을 살펴보세요</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>공개 질문 목록</CardTitle>
          <CardDescription>다른 학생들이 공개한 질문입니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="질문 또는 이름으로 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {isLoading ? (
            <div className="text-center py-8">로딩 중...</div>
          ) : filteredQuestions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {search ? "검색 결과가 없습니다" : "아직 공개된 질문이 없습니다"}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredQuestions.map((q) => (
                <div key={q.id} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-gray-900">{q.content}</p>
                      <div className="flex gap-2 mt-2">
                        <span className={`text-xs px-2 py-1 rounded ${q.closure === "closed" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                          {q.closure === "closed" ? "페쇄형" : "개방형"}
                        </span>
                        <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700">
                          {getCognitiveLabel(q.cognitive)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600">{q.author.name}</div>
                      {q.author.className && (
                        <div className="text-xs text-gray-400">{q.author.className}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
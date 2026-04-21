"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface Question {
  id: string;
  content: string;
  closure: string;
  cognitive: string;
  closureScore: number;
  cognitiveScore: number;
  isPublic: boolean;
  createdAt: string;
}

export default function HistoryPage() {
  const { data: session } = useSession();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    const userId = (session?.user as any)?.id;
    const res = await fetch(`/api/questions?authorId=${userId}`);
    const data = await res.json();
    setQuestions(data);
  };

  const togglePublic = async (id: string, currentPublic: boolean) => {
    await fetch(`/api/questions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic: !currentPublic }),
    });
    fetchQuestions();
  };

  const getCognitiveLabel = (c: string) => {
    const map: Record<string, string> = { factual: "사실적", interpretive: "해석적", evaluative: "평가적" };
    return map[c] || c;
  };

  const filteredQuestions = questions.filter((q) => {
    const matchesFilter = filter === "all" || q.cognitive === filter || q.closure === filter;
    const matchesSearch = q.content.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">내 질문</h2>
        <p className="text-gray-600">작성한 질문의 기록입니다</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>질문 기록</CardTitle>
          <CardDescription>총 {questions.length}개의 질문</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Input
              placeholder="질문 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="closed">페쇄형</SelectItem>
                <SelectItem value="open">개방형</SelectItem>
                <SelectItem value="factual">사실적</SelectItem>
                <SelectItem value="interpretive">해석적</SelectItem>
                <SelectItem value="evaluative">평가적</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredQuestions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">질문이 없습니다</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">번호</TableHead>
                  <TableHead>질문 내용</TableHead>
                  <TableHead className="w-24">유형</TableHead>
                  <TableHead className="w-24">인지 수준</TableHead>
                  <TableHead className="w-32">공개</TableHead>
                  <TableHead className="w-32">날짜</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuestions.map((q, index) => (
                  <TableRow key={q.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="max-w-md">
                      <p className="truncate">{q.content}</p>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded ${q.closure === "closed" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                        {q.closure === "closed" ? "페쇄" : "개방"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700">
                        {getCognitiveLabel(q.cognitive)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Switch checked={q.isPublic} onCheckedChange={() => togglePublic(q.id, q.isPublic)} />
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {new Date(q.createdAt).toLocaleDateString("ko-KR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
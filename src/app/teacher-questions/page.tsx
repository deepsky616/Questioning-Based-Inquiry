"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Question {
  id: string;
  content: string;
  closure: string;
  cognitive: string;
  closureScore: number;
  cognitiveScore: number;
  author: {
    id: string;
    name: string;
    className?: string;
  };
  isPublic: boolean;
  createdAt: string;
  comments?: Array<{
    id: string;
    content: string;
    author: { name: string };
    createdAt: string;
  }>;
}

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterClosure, setFilterClosure] = useState("all");
  const [filterCognitive, setFilterCognitive] = useState("all");
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [correctionClosure, setCorrectionClosure] = useState("");
  const [correctionCognitive, setCorrectionCognitive] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/questions?isPublic=true");
      const data = await res.json();
      setQuestions(data);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCorrection = async () => {
    if (!selectedQuestion) return;

    await fetch(`/api/questions/${selectedQuestion.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        closure: correctionClosure,
        cognitive: correctionCognitive,
      }),
    });

    setSelectedQuestion(null);
    fetchQuestions();
  };

  const getCognitiveLabel = (c: string) => {
    const map: Record<string, string> = { factual: "사실적 질문", interpretive: "해석적 질문", evaluative: "평가적 질문" };
    return map[c] || c;
  };

  const filteredQuestions = questions.filter((q) => {
    const matchesSearch = q.content.toLowerCase().includes(search.toLowerCase()) ||
      q.author.name.toLowerCase().includes(search.toLowerCase());
    const matchesClosure = filterClosure === "all" || q.closure === filterClosure;
    const matchesCognitive = filterCognitive === "all" || q.cognitive === filterCognitive;
    return matchesSearch && matchesClosure && matchesCognitive;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">질문 조회</h2>
        <p className="text-gray-600">학생들이 작성한 질문을 확인하고 수정하세요</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>전체 질문</CardTitle>
          <CardDescription>필터링하여 특정 유형의 질문을 확인할 수 있습니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <Input
              placeholder="검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={filterClosure} onValueChange={setFilterClosure}>
              <SelectTrigger className="w-28">
                <SelectValue placeholder="폐쇄형" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="closed">닫힌 질문</SelectItem>
                <SelectItem value="open">열린 질문</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCognitive} onValueChange={setFilterCognitive}>
              <SelectTrigger className="w-28">
                <SelectValue placeholder="인지 수준" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="factual">사실적 질문</SelectItem>
                <SelectItem value="interpretive">해석적 질문</SelectItem>
                <SelectItem value="evaluative">평가적 질문</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="text-center py-8">로딩 중...</div>
          ) : filteredQuestions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">질문이 없습니다</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>학생</TableHead>
                  <TableHead>질문 내용</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>인지 수준</TableHead>
                  <TableHead className="w-24">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuestions.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell>
                      <div>{q.author.name}</div>
                      {q.author.className && (
                        <div className="text-xs text-gray-400">{q.author.className}</div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="truncate">{q.content}</p>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded ${q.closure === "closed" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                        {q.closure === "closed" ? "닫힌 질문" : "열린 질문"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700">
                        {getCognitiveLabel(q.cognitive)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => {
                        setSelectedQuestion(q);
                        setCorrectionClosure(q.closure);
                        setCorrectionCognitive(q.cognitive);
                      }}>
                        수정
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedQuestion} onOpenChange={() => setSelectedQuestion(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>질문 수정</DialogTitle>
          </DialogHeader>
          {selectedQuestion && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="font-medium">질문 내용</p>
                <p className="mt-1">{selectedQuestion.content}</p>
                <p className="text-sm text-gray-500 mt-1">
                  작성자: {selectedQuestion.author.name} ({selectedQuestion.author.className || "반 정보 없음"})
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>폐쇄형/개방형</Label>
                  <Select value={correctionClosure} onValueChange={setCorrectionClosure}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="closed">닫힌 질문</SelectItem>
                      <SelectItem value="open">열린 질문</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>인지적 수준</Label>
                  <Select value={correctionCognitive} onValueChange={setCorrectionCognitive}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="factual">사실적 질문</SelectItem>
                      <SelectItem value="interpretive">해석적 질문</SelectItem>
                      <SelectItem value="evaluative">평가적 질문</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>코멘트 추가</Label>
                <Textarea
                  placeholder="학생에게 피드백을 남겨보세요..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedQuestion(null)}>취소</Button>
            <Button onClick={handleSaveCorrection}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  closureScore: number;
  cognitiveScore: number;
  isPublic: boolean;
  createdAt: string;
}

const CLOSURE_LABEL: Record<string, string> = { closed: "폐쇄형", open: "개방형" };
const COGNITIVE_LABEL: Record<string, string> = { factual: "사실적", interpretive: "해석적", evaluative: "평가적" };

const CLOSURE_STYLE: Record<string, string> = {
  closed: "bg-blue-100 text-blue-700",
  open: "bg-green-100 text-green-700",
};
const COGNITIVE_STYLE: Record<string, string> = {
  factual: "bg-gray-100 text-gray-700",
  interpretive: "bg-purple-100 text-purple-700",
  evaluative: "bg-orange-100 text-orange-700",
};

export default function HistoryPage() {
  const { data: session } = useSession();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const userId = (session?.user as { id?: string })?.id;
    if (!userId) return;
    fetch(`/api/questions?authorId=${userId}`)
      .then((r) => r.json())
      .then(setQuestions)
      .catch(() => {});
  }, [session]);

  const togglePublic = async (id: string, currentPublic: boolean) => {
    // 클릭 즉시 반영 (낙관적 업데이트)
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, isPublic: !currentPublic } : q))
    );

    try {
      const res = await fetch(`/api/questions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !currentPublic }),
      });
      if (!res.ok) throw new Error("업데이트 실패");
    } catch {
      // 실패 시 원래 상태로 복원
      setQuestions((prev) =>
        prev.map((q) => (q.id === id ? { ...q, isPublic: currentPublic } : q))
      );
    }
  };

  const filtered = questions.filter((q) =>
    q.content.toLowerCase().includes(search.toLowerCase())
  );

  const byType = (key: "closure" | "cognitive", value: string) =>
    filtered.filter((q) => q[key] === value);

  const QuestionRows = ({ list }: { list: Question[] }) =>
    list.length === 0 ? (
      <div className="text-center py-8 text-gray-400 text-sm">해당하는 질문이 없습니다</div>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>질문 내용</TableHead>
            <TableHead className="w-20">폐쇄/개방</TableHead>
            <TableHead className="w-24">인지 수준</TableHead>
            <TableHead className="w-24">공개</TableHead>
            <TableHead className="w-28">날짜</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((q, i) => (
            <TableRow key={q.id}>
              <TableCell className="text-gray-400">{i + 1}</TableCell>
              <TableCell className="max-w-xs">
                <p className="truncate">{q.content}</p>
              </TableCell>
              <TableCell>
                <span className={`text-xs px-2 py-1 rounded ${CLOSURE_STYLE[q.closure]}`}>
                  {CLOSURE_LABEL[q.closure]}
                </span>
              </TableCell>
              <TableCell>
                <span className={`text-xs px-2 py-1 rounded ${COGNITIVE_STYLE[q.cognitive]}`}>
                  {COGNITIVE_LABEL[q.cognitive]}
                </span>
              </TableCell>
              <TableCell>
                <Switch checked={q.isPublic} onCheckedChange={() => togglePublic(q.id, q.isPublic)} />
              </TableCell>
              <TableCell className="text-sm text-gray-400">
                {new Date(q.createdAt).toLocaleDateString("ko-KR")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">내 질문</h2>
        <p className="text-gray-600">작성한 질문을 두 가지 분류로 확인할 수 있습니다 · 총 {questions.length}개</p>
      </div>

      <Input
        placeholder="질문 검색..."
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
              <QuestionRows list={byType("closure", "closed")} />
            </TabsContent>
            <TabsContent value="open">
              <QuestionRows list={byType("closure", "open")} />
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
              <QuestionRows list={byType("cognitive", "factual")} />
            </TabsContent>
            <TabsContent value="interpretive">
              <QuestionRows list={byType("cognitive", "interpretive")} />
            </TabsContent>
            <TabsContent value="evaluative">
              <QuestionRows list={byType("cognitive", "evaluative")} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

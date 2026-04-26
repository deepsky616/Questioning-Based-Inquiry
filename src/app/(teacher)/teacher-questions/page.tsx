"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildSessionLabel, isSessionAvailable, sortSessionsDesc } from "@/lib/sessions";

interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  teacher: { name: string };
}

interface Question {
  id: string;
  content: string;
  closure: string;
  cognitive: string;
  closureScore: number;
  cognitiveScore: number;
  author: { id: string; name: string; className?: string };
  isPublic: boolean;
  createdAt: string;
  comments?: Array<{ id: string; content: string; author: { name: string }; createdAt: string }>;
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

export default function QuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [correctionClosure, setCorrectionClosure] = useState("");
  const [correctionCognitive, setCorrectionCognitive] = useState("");
  const [comment, setComment] = useState("");

  // 세션 관련 상태
  const [sessions, setSessions] = useState<QuestionSession[]>([]);
  const [sessForm, setSessForm] = useState({ date: "", subject: "", topic: "" });
  const [isSavingSess, setIsSavingSess] = useState(false);
  const [sessMsg, setSessMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/questions?isPublic=true")
      .then((r) => r.json())
      .then(setQuestions)
      .catch(() => {})
      .finally(() => setIsLoading(false));

    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: QuestionSession[]) => setSessions(sortSessionsDesc(data)))
      .catch(() => {});
  }, []);

  const handleCreateSession = async () => {
    if (!sessForm.date || !sessForm.subject) {
      setSessMsg({ type: "error", text: "날짜와 교과는 필수입니다" });
      return;
    }
    setIsSavingSess(true);
    setSessMsg(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessForm),
      });
      if (!res.ok) throw new Error();
      const created: QuestionSession = await res.json();
      setSessions((prev) => sortSessionsDesc([created, ...prev]));
      setSessForm({ date: "", subject: "", topic: "" });
      setSessMsg({ type: "success", text: "세션이 추가됐습니다" });
    } catch {
      setSessMsg({ type: "error", text: "세션 저장에 실패했습니다" });
    } finally {
      setIsSavingSess(false);
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm("이 세션을 삭제하시겠습니까?")) return;
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSaveCorrection = async () => {
    if (!selectedQuestion) return;
    await fetch(`/api/questions/${selectedQuestion.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closure: correctionClosure, cognitive: correctionCognitive }),
    });
    setSelectedQuestion(null);
    setComment("");
    fetch("/api/questions?isPublic=true")
      .then((r) => r.json())
      .then(setQuestions);
  };

  const filtered = questions.filter(
    (q) =>
      q.content.toLowerCase().includes(search.toLowerCase()) ||
      q.author.name.toLowerCase().includes(search.toLowerCase())
  );

  const byType = (key: "closure" | "cognitive", value: string) =>
    filtered.filter((q) => q[key] === value);

  const QuestionTable = ({ list }: { list: Question[] }) =>
    list.length === 0 ? (
      <div className="text-center py-8 text-gray-400 text-sm">
        {search ? "검색 결과가 없습니다" : "해당하는 질문이 없습니다"}
      </div>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>학생</TableHead>
            <TableHead>질문 내용</TableHead>
            <TableHead className="w-20">폐쇄/개방</TableHead>
            <TableHead className="w-24">인지 수준</TableHead>
            <TableHead className="w-20">작업</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((q) => (
            <TableRow key={q.id}>
              <TableCell>
                <div className="text-sm font-medium">{q.author.name}</div>
                {q.author.className && (
                  <div className="text-xs text-gray-400">{q.author.className}</div>
                )}
              </TableCell>
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedQuestion(q);
                    setCorrectionClosure(q.closure);
                    setCorrectionCognitive(q.cognitive);
                  }}
                >
                  수정
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );

  if (isLoading) {
    return <div className="text-center py-16 text-gray-400">로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">질문 조회</h2>
        <p className="text-gray-600">질문 세션을 설정하고 학생 질문을 확인하세요 · 공개 {questions.length}개</p>
      </div>

      {/* 질문 세션 설정 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">질문 세션 설정</CardTitle>
          <CardDescription>날짜·교과·주제를 설정하면 학생 질문하기 화면에서 선택할 수 있습니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sess-date">날짜</Label>
              <Input
                id="sess-date"
                type="date"
                value={sessForm.date}
                onChange={(e) => setSessForm((p) => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sess-subject">교과</Label>
              <Input
                id="sess-subject"
                placeholder="예: 과학"
                value={sessForm.subject}
                onChange={(e) => setSessForm((p) => ({ ...p, subject: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sess-topic">주제 (선택)</Label>
              <Input
                id="sess-topic"
                placeholder="예: 지구의 역사"
                value={sessForm.topic}
                onChange={(e) => setSessForm((p) => ({ ...p, topic: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleCreateSession} disabled={isSavingSess}>
              {isSavingSess ? "저장 중..." : "세션 추가"}
            </Button>
            {sessMsg && (
              <span className={`text-sm ${sessMsg.type === "success" ? "text-green-700" : "text-red-600"}`}>
                {sessMsg.text}
              </span>
            )}
          </div>

          {sessions.length > 0 && (
            <div className="divide-y rounded-lg border mt-2">
              {sessions.map((s) => {
                const active = isSessionAvailable(s.date);
                return (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${active ? "bg-green-500" : "bg-gray-300"}`} />
                      <span className="text-sm">{buildSessionLabel(s.date, s.subject, s.topic)}</span>
                      {active && (
                        <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">활성</span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 h-7 px-2 text-xs"
                      onClick={() => handleDeleteSession(s.id)}
                    >
                      삭제
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Input
        placeholder="질문 또는 학생 이름으로 검색..."
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
            <TabsContent value="closed"><QuestionTable list={byType("closure", "closed")} /></TabsContent>
            <TabsContent value="open"><QuestionTable list={byType("closure", "open")} /></TabsContent>
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
            <TabsContent value="factual"><QuestionTable list={byType("cognitive", "factual")} /></TabsContent>
            <TabsContent value="interpretive"><QuestionTable list={byType("cognitive", "interpretive")} /></TabsContent>
            <TabsContent value="evaluative"><QuestionTable list={byType("cognitive", "evaluative")} /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* 수정 다이얼로그 */}
      <Dialog open={!!selectedQuestion} onOpenChange={() => setSelectedQuestion(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>질문 분류 수정</DialogTitle>
          </DialogHeader>
          {selectedQuestion && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="font-medium">질문 내용</p>
                <p className="mt-1 text-gray-800">{selectedQuestion.content}</p>
                <p className="text-sm text-gray-500 mt-1">
                  작성자: {selectedQuestion.author.name}
                  {selectedQuestion.author.className && ` (${selectedQuestion.author.className})`}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>폐쇄형 / 개방형</Label>
                  <Select value={correctionClosure} onValueChange={setCorrectionClosure}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="closed">폐쇄형 질문</SelectItem>
                      <SelectItem value="open">개방형 질문</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>인지적 수준</Label>
                  <Select value={correctionCognitive} onValueChange={setCorrectionCognitive}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="factual">사실적 질문</SelectItem>
                      <SelectItem value="interpretive">해석적 질문</SelectItem>
                      <SelectItem value="evaluative">평가적 질문</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>코멘트 (선택)</Label>
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

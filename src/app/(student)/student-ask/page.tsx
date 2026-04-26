"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { buildSessionLabel, isSessionAvailable } from "@/lib/sessions";

interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
}

interface ClassificationResult {
  closure: string;
  cognitive: string;
  closureScore: number;
  cognitiveScore: number;
  reasoning: string;
  feedback?: string;
}

export default function AskPage() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [content, setContent] = useState("");
  const [context, setContext] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<QuestionSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("none");

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => setAiConfigured(data.configured))
      .catch(() => setAiConfigured(false));

    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data: QuestionSession[]) =>
        setSessions(data.filter((s) => isSessionAvailable(s.date)))
      )
      .catch(() => {});
  }, []);

  const handleSessionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedSessionId(e.target.value);
    // 세션 선택 직후 textarea로 포커스 이동해 바로 입력 가능하게
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleClassify = async () => {
    if (content.length < 10) {
      alert("질문을 10자 이상 입력해 주세요");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, context }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "분류 실패");
      }

      const data = await res.json();
      setResult(data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "분류 중 오류가 발생했습니다";
      alert(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          context,
          isPublic,
          closure: result.closure,
          cognitive: result.cognitive,
          closureScore: result.closureScore,
          cognitiveScore: result.cognitiveScore,
          ...(selectedSessionId !== "none" ? { sessionId: selectedSessionId } : {}),
        }),
      });

      if (!res.ok) throw new Error("저장 실패");
      router.push("/student-history");
    } catch {
      alert("저장 중 오류가 발생했습니다");
    } finally {
      setIsSaving(false);
    }
  };

  const getCognitiveLabel = (c: string) => {
    const map: Record<string, string> = {
      factual: "사실적 질문",
      interpretive: "해석적 질문",
      evaluative: "평가적 질문",
    };
    return map[c] || c;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">질문하기</h2>
        <p className="text-gray-600">질문을 입력하면 유형을 분석해 드립니다</p>
      </div>

      {aiConfigured === false && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4">
            <p className="text-yellow-800 text-sm">
              교사가 AI 설정을 아직 등록하지 않았습니다. AI 분류 대신 키워드 기반 분류가 사용됩니다.
            </p>
          </CardContent>
        </Card>
      )}

      {aiConfigured === true && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <p className="text-green-800 text-sm">AI 분류가 활성화됐습니다.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>질문 입력</CardTitle>
          <CardDescription>탐구하고 싶은 질문을 적어보세요</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sessions.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="session">수업 세션 선택 (선택)</Label>
              <select
                id="session"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={selectedSessionId}
                onChange={handleSessionChange}
              >
                <option value="none">세션 없이 질문하기</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {buildSessionLabel(s.date, s.subject, s.topic)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="content">질문</Label>
            <Textarea
              ref={textareaRef}
              id="content"
              placeholder="예: 왜 밤에는 별이 보이지 않을까?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
            />
            <p className="text-sm text-gray-500 text-right">{content.length}/500</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="context">맥락 (선택)</Label>
            <Input
              id="context"
              placeholder="예: 과학 시간에 우주에 대해 학습하다가..."
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
          </div>

          <Button
            onClick={handleClassify}
            disabled={isLoading || content.length < 10}
            className="w-full"
          >
            {isLoading ? "분석 중..." : "유형 분석하기"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>분석 결과</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="text-sm text-gray-600">폐쇄형/개방형</div>
                <div className="text-xl font-bold text-blue-700">
                  {result.closure === "closed" ? "닫힌 질문" : "열린 질문"}
                </div>
                <div className="text-sm text-gray-500">
                  신뢰도: {Math.round(result.closureScore * 100)}%
                </div>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <div className="text-sm text-gray-600">인지적 수준</div>
                <div className="text-xl font-bold text-purple-700">
                  {getCognitiveLabel(result.cognitive)}
                </div>
                <div className="text-sm text-gray-500">
                  신뢰도: {Math.round(result.cognitiveScore * 100)}%
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="text-sm font-medium text-gray-700">분류 근거</div>
              <p className="text-gray-600 mt-1">{result.reasoning}</p>
            </div>

            {result.feedback && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="text-sm font-medium text-amber-800 mb-1">
                  더 좋은 질문을 위한 제안
                </div>
                <p className="text-amber-700">{result.feedback}</p>
              </div>
            )}

            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex items-center space-x-2">
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                <span className="text-sm">다른 학생에게 질문 공개</span>
              </div>
            </div>

            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving ? "저장 중..." : "질문 저장하기"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { buildSessionLabel, buildSessionContextHint, isSessionAvailable } from "@/lib/sessions";

interface SharedQuestion {
  type: string;
  content: string;
}

interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  teacher: { name: string };
  sharedQuestions: SharedQuestion[];
}

interface ClassificationResult {
  closure: string;
  cognitive: string;
  closureScore: number;
  cognitiveScore: number;
  reasoning: string;
  feedback?: string;
}

const TYPE_LABEL: Record<string, string> = {
  factual: "사실적",
  conceptual: "개념적",
  controversial: "논쟁적",
};

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
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [sessionsError, setSessionsError] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => setAiConfigured(data.configured))
      .catch(() => setAiConfigured(false));

    fetch("/api/sessions")
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((data: QuestionSession[]) => {
        const available = data.filter((s) => isSessionAvailable(s.date));
        setSessions(available);
        if (available.length > 0) setSelectedSessionId(available[0].id);
        setSessionsLoaded(true);
      })
      .catch(() => {
        setSessionsError(true);
        setSessionsLoaded(true);
      });
  }, []);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null;

  const handleSessionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedSessionId(id);
    setResult(null); // issue #5: 세션 변경 시 분류 결과 초기화

    if (id && context.trim() === "") {
      const s = sessions.find((s) => s.id === id);
      if (s) setContext(buildSessionContextHint(s.subject, s.topic, s.teacher.name));
    }
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const canAsk = sessionsLoaded && !sessionsError && sessions.length > 0 && !!selectedSessionId;

  const handleClassify = async () => {
    // issue #3: handler 단에서도 세션 필수 검증
    if (!canAsk) return;
    if (content.trim().length === 0) {
      alert("질문을 입력해 주세요");
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
    // issue #3: handler 단에서도 세션 필수 검증
    if (!canAsk || !result) return;

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
          sessionId: selectedSessionId,
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
      applicative: "적용적 질문",
    };
    return map[c] || c;
  };

  // issue #1: 로딩 중에는 아무것도 표시하지 않음
  if (!sessionsLoaded) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">질문하기</h2>
        </div>
        <Card>
          <CardContent className="p-6 text-center text-gray-400 text-sm">수업 세션 확인 중...</CardContent>
        </Card>
      </div>
    );
  }

  // issue #1 & #2: 네트워크 오류
  if (sessionsError) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">질문하기</h2>
        </div>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 text-center text-red-700 text-sm">
            수업 세션 정보를 불러오지 못했습니다. 페이지를 새로고침해 주세요.
          </CardContent>
        </Card>
      </div>
    );
  }

  // issue #1 & #2: 세션 없음 — 폼 차단
  if (sessions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">질문하기</h2>
        </div>
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-6 text-center text-yellow-800">
            <p className="font-medium">아직 수업 세션이 없습니다</p>
            <p className="text-sm mt-1 text-yellow-700">
              담당 선생님이 수업 세션을 만들어야 질문할 수 있습니다.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          <CardDescription>수업 세션을 선택하고 탐구하고 싶은 질문을 적어보세요</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 세션 선택 — 필수 */}
          <div className="space-y-2">
            <Label htmlFor="session">수업 세션 선택 <span className="text-red-500">*</span></Label>
            <select
              id="session"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={selectedSessionId}
              onChange={handleSessionChange}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {buildSessionLabel(s.date, s.subject, s.topic)}
                </option>
              ))}
            </select>

            {selectedSession && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-1">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">현재 수업 세션</p>
                <p className="text-sm font-medium text-blue-900">
                  {selectedSession.subject}
                  {selectedSession.topic.trim() && (
                    <span className="text-blue-700"> · {selectedSession.topic.trim()}</span>
                  )}
                </p>
                <p className="text-xs text-blue-600">
                  {selectedSession.teacher.name} 선생님 &nbsp;·&nbsp; {selectedSession.date}
                </p>
              </div>
            )}
          </div>

          {/* 선생님의 탐구 질문 안내 패널 (issue #4: 런타임 안전 검증) */}
          {selectedSession &&
            Array.isArray(selectedSession.sharedQuestions) &&
            selectedSession.sharedQuestions.filter((q) => q.content?.trim()).length > 0 && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-2">
                <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
                  선생님의 탐구 질문
                </p>
                <p className="text-xs text-indigo-500 mb-2">
                  아래 질문을 참고해서 나만의 질문을 만들어보세요
                </p>
                <ul className="space-y-1.5">
                  {selectedSession.sharedQuestions
                    .filter((q) => q.content?.trim())
                    .map((q, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-indigo-800">
                        <span className="shrink-0 mt-0.5 text-xs font-medium text-indigo-500">
                          [{TYPE_LABEL[q.type] ?? q.type}]
                        </span>
                        <span>{q.content}</span>
                      </li>
                    ))}
                </ul>
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
            disabled={isLoading || !canAsk || content.trim().length === 0}
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

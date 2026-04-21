"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface ClassificationResult {
  closure: string;
  cognitive: string;
  closureScore: number;
  cognitiveScore: number;
  reasoning: string;
}

interface ApiConfig {
  apiKey: string;
  model: string;
}

export default function AskPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [content, setContent] = useState("");
  const [context, setContext] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [noConfigError, setNoConfigError] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("gemini-config");
    if (!saved) {
      setNoConfigError(true);
    }
  }, []);

  const handleClassify = async () => {
    if (content.length < 10) {
      alert("질문을 10자 이상 입력해 주세요");
      return;
    }

    const saved = localStorage.getItem("gemini-config");
    if (!saved) {
      setNoConfigError(true);
      return;
    }

    try {
      const config: ApiConfig = JSON.parse(saved);
      if (!config.apiKey || config.apiKey.length < 10) {
        setNoConfigError(true);
        return;
      }

      setNoConfigError(false);
      setIsLoading(true);

      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: config.apiKey,
          model: config.model || "gemini-2.5-flash",
          content,
          context,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "분류 실패");
      }

      const data = await res.json();
      setResult(data);
    } catch (error: any) {
      alert(error.message || "분류 중 오류가 발생했습니다");
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
        }),
      });

      if (!res.ok) throw new Error("저장 실패");
      router.push("/history");
    } catch (error) {
      alert("저장 중 오류가 발생했습니다");
    } finally {
      setIsSaving(false);
    }
  };

  const getCognitiveLabel = (c: string) => {
    const map: Record<string, string> = { factual: "사실적", interpretive: "해석적", evaluative: "평가적" };
    return map[c] || c;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">질문하기</h2>
        <p className="text-gray-600">질문을 입력하면 유형을 분석해 드립니다</p>
      </div>

      {noConfigError && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4">
            <p className="text-yellow-800">
              Gemini API 설정이 필요합니다.{" "}
              <a href="/settings" className="underline font-medium">설정 페이지</a>에서 API 키를 입력하고 저장해 주세요.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>질문 입력</CardTitle>
          <CardDescription>탐구하고 싶은 질문을 적어보세요</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="content">질문</Label>
            <Textarea
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
            disabled={isLoading || content.length < 10 || noConfigError}
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
                  {result.closure === "closed" ? "페쇄형" : "개방형"}
                </div>
                <div className="text-sm text-gray-500">신뢰도: {Math.round(result.closureScore * 100)}%</div>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <div className="text-sm text-gray-600">인지적 수준</div>
                <div className="text-xl font-bold text-purple-700">{getCognitiveLabel(result.cognitive)}</div>
                <div className="text-sm text-gray-500">신뢰도: {Math.round(result.cognitiveScore * 100)}%</div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="text-sm font-medium text-gray-700">분류 근거</div>
              <p className="text-gray-600 mt-1">{result.reasoning}</p>
            </div>

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
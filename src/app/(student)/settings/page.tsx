"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const GEMINI_MODELS = [
  { value: "gemini-2.0-flash-exp", label: "Gemini 2.0 Flash (experimental)" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  { value: "gemini-1.5-flash-002", label: "Gemini 1.5 Flash-002" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { value: "gemini-1.0-pro", label: "Gemini 1.0 Pro" },
];

interface ApiConfig {
  apiKey: string;
  model: string;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;

  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-2.0-flash-exp");
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("gemini-config");
    if (saved) {
      try {
        const config: ApiConfig = JSON.parse(saved);
        setApiKey(config.apiKey || "");
        setSelectedModel(config.model || "gemini-2.0-flash-exp");
      } catch {}
    }
  }, []);

  const handleTest = async () => {
    if (!apiKey || apiKey.length < 10) {
      setTestResult({ success: false, message: "API 키를 입력해 주세요 (10자 이상)" });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/gemini/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, model: selectedModel }),
      });

      const data = await res.json();

      if (data.success) {
        setTestResult({ success: true, message: `연결 성공! 모델: ${selectedModel}` });
      } else {
        setTestResult({ success: false, message: data.error || "연결 실패" });
      }
    } catch {
      setTestResult({ success: false, message: "테스트 중 오류가 발생했습니다" });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    const config: ApiConfig = { apiKey, model: selectedModel };
    localStorage.setItem("gemini-config", JSON.stringify(config));
    setTestResult({ success: true, message: "설정이 저장되었습니다!" });
  };

  const isValidApiKey = apiKey.length >= 10;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">설정</h2>
        <p className="text-gray-600">계정 및 Gemini API를 설정하세요</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>계정 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>이름</Label>
              <Input value={user?.name || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>이메일</Label>
              <Input value={user?.email || ""} disabled />
            </div>
          </div>
          <div className="space-y-2">
            <Label>역할</Label>
            <Input value={user?.role === "STUDENT" ? "학생" : "교사"} disabled />
          </div>
          {user?.className && (
            <div className="space-y-2">
              <Label>반</Label>
              <Input value={user.className} disabled />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gemini API 설정</CardTitle>
          <CardDescription>
            Google AI Studio에서 API 키를 발급받고 입력하세요
            <br />
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              https://aistudio.google.com/app/apikey
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey">API 키</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="AIza..."
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestResult(null);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">사용 모델</Label>
            <Select value={selectedModel} onValueChange={(v) => {
              setSelectedModel(v);
              setTestResult(null);
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GEMINI_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={!isValidApiKey || isTesting}
            >
              {isTesting ? "테스트 중..." : "연결 테스트"}
            </Button>
            <Button onClick={handleSave} disabled={!isValidApiKey}>
              저장
            </Button>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-lg text-sm ${
                testResult.success
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {testResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>공개 설정</CardTitle>
          <CardDescription>내가 작성한 질문의 공개 여부를 설정하세요</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            기본적으로 모든 질문은 비공개로 설정됩니다. 질문을 저장할 때 개별적으로 공개 여부를 선택할 수 있습니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
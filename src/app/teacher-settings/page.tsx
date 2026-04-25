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
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "gemini-2.5-flash-exp", label: "Gemini 2.5 Flash (experimental)" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
];

export default function TeacherSettingsPage() {
  const { data: session } = useSession();
  const user = session?.user as { name?: string; email?: string; school?: string };

  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-2.0-flash");
  const [currentConfig, setCurrentConfig] = useState<{
    configured: boolean;
    maskedApiKey: string | null;
    model: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setCurrentConfig(data);
        if (data.model) setSelectedModel(data.model);
      })
      .catch(() => {});
  }, []);

  const handleTest = async () => {
    if (!apiKey || apiKey.length < 10) {
      setMessage({ type: "error", text: "API 키를 입력해 주세요 (10자 이상)" });
      return;
    }

    setIsTesting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/gemini/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, model: selectedModel }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: "success", text: `연결 성공! 모델: ${selectedModel}` });
      } else {
        setMessage({ type: "error", text: data.error || "연결 실패" });
      }
    } catch {
      setMessage({ type: "error", text: "테스트 중 오류가 발생했습니다" });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey || apiKey.length < 10) {
      setMessage({ type: "error", text: "API 키를 입력해 주세요 (10자 이상)" });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, model: selectedModel }),
      });

      if (!res.ok) throw new Error("저장 실패");

      setCurrentConfig({ configured: true, maskedApiKey: `${apiKey.slice(0, 4)}****`, model: selectedModel });
      setApiKey("");
      setMessage({ type: "success", text: "API 설정이 저장됐습니다. 이제 모든 학생이 AI 분류를 사용할 수 있습니다." });
    } catch {
      setMessage({ type: "error", text: "설정 저장에 실패했습니다" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("AI 설정을 삭제하면 학생들이 AI 분류를 사용할 수 없습니다. 계속하시겠습니까?")) return;

    setIsDeleting(true);
    try {
      await fetch("/api/config", { method: "DELETE" });
      setCurrentConfig({ configured: false, maskedApiKey: null, model: "gemini-2.0-flash" });
      setMessage({ type: "success", text: "AI 설정이 삭제됐습니다" });
    } catch {
      setMessage({ type: "error", text: "삭제에 실패했습니다" });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">설정</h2>
        <p className="text-gray-600">교사 계정 정보 및 AI 설정을 관리하세요</p>
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
          {user?.school && (
            <div className="space-y-2">
              <Label>소속 학교</Label>
              <Input value={user.school} disabled />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gemini AI 설정</CardTitle>
          <CardDescription>
            여기서 설정한 API 키는 서버에 안전하게 저장되며, 모든 학생이 별도 설정 없이 AI 분류를 사용할 수 있습니다.
            <br />
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Google AI Studio에서 API 키 발급
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentConfig?.configured && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-800">AI 분류가 활성화됐습니다</p>
                <p className="text-xs text-green-600 mt-0.5">
                  현재 키: {currentConfig.maskedApiKey} · 모델: {currentConfig.model}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                {isDeleting ? "삭제 중..." : "삭제"}
              </Button>
            </div>
          )}

          {!currentConfig?.configured && (
            <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200">
              <p className="text-sm text-yellow-800">AI 설정이 없습니다. API 키를 입력해 학생들이 AI 분류를 사용할 수 있게 하세요.</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="apiKey">
              {currentConfig?.configured ? "새 API 키 (변경 시에만 입력)" : "API 키"}
            </Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="AIza..."
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setMessage(null);
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">사용 모델</Label>
            <Select value={selectedModel} onValueChange={(v) => {
              setSelectedModel(v);
              setMessage(null);
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
              disabled={!apiKey || apiKey.length < 10 || isTesting}
            >
              {isTesting ? "테스트 중..." : "연결 테스트"}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!apiKey || apiKey.length < 10 || isSaving}
            >
              {isSaving ? "저장 중..." : "저장"}
            </Button>
          </div>

          {message && (
            <div className={`p-3 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              {message.text}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { UserRole } from "@/types/user";

interface ExtendedUser {
  name?: string;
  role?: UserRole;
  school?: string | null;
  grade?: string | null;
  className?: string | null;
  studentNumber?: string | null;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const user = session?.user as ExtendedUser | undefined;

  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setAiConfigured(data.configured);
        setAiModel(data.model);
      })
      .catch(() => setAiConfigured(false));
  }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">설정</h2>
        <p className="text-gray-600">계정 정보를 확인하세요</p>
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
              <Label>역할</Label>
              <Input value="학생" disabled />
            </div>
          </div>
          {user?.school && (
            <div className="space-y-2">
              <Label>소속 학교</Label>
              <Input value={user.school} disabled />
            </div>
          )}
          <div className="grid grid-cols-3 gap-4">
            {user?.grade && (
              <div className="space-y-2">
                <Label>학년</Label>
                <Input value={`${user.grade}학년`} disabled />
              </div>
            )}
            {user?.className && (
              <div className="space-y-2">
                <Label>반</Label>
                <Input value={`${user.className}반`} disabled />
              </div>
            )}
            {user?.studentNumber && (
              <div className="space-y-2">
                <Label>번호</Label>
                <Input value={`${user.studentNumber}번`} disabled />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI 분류 상태</CardTitle>
          <CardDescription>교사가 설정한 AI를 사용합니다</CardDescription>
        </CardHeader>
        <CardContent>
          {aiConfigured === null && (
            <p className="text-sm text-gray-500">확인 중...</p>
          )}
          {aiConfigured === true && (
            <div className="p-3 rounded-lg bg-green-50 border border-green-200">
              <p className="text-sm font-medium text-green-800">AI 분류가 활성화됐습니다</p>
              {aiModel && (
                <p className="text-xs text-green-600 mt-0.5">사용 모델: {aiModel}</p>
              )}
            </div>
          )}
          {aiConfigured === false && (
            <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200">
              <p className="text-sm text-yellow-800">
                교사가 AI 설정을 아직 등록하지 않았습니다. AI 분류 대신 키워드 기반 분류가 사용됩니다.
              </p>
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

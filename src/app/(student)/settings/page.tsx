"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export default function SettingsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">설정</h2>
        <p className="text-gray-600">계정 정보를 관리하세요</p>
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
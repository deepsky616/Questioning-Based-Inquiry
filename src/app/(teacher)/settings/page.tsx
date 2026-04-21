"use client";

import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default function TeacherSettingsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">설정</h2>
        <p className="text-gray-600">교사 계정 정보를 확인하세요</p>
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
    </div>
  );
}
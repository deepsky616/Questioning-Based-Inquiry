"use client";

import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PasswordChangeCard } from "@/components/shared/PasswordChangeCard";
import type { UserRole } from "@/types/user";
import { PageHeader } from "@/components/shared/PageHeader";
import { useTranslations } from "next-intl";

interface ExtendedUser {
  name?: string;
  role?: UserRole;
  school?: string | null;
  grade?: string | null;
  className?: string | null;
  studentNumber?: string | null;
}

export default function SettingsPage() {
  const tPages = useTranslations("pages");
  const { data: session } = useSession();
  const user = session?.user as ExtendedUser | undefined;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader title={tPages("studentSettings.title")} description={tPages("studentSettings.description")} />

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

      <PasswordChangeCard />
    </div>
  );
}

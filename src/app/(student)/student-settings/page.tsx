"use client";

import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PasswordChangeCard } from "@/components/shared/PasswordChangeCard";
import { AccountWithdrawalCard } from "@/components/shared/AccountWithdrawalCard";
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
  const tSet = useTranslations("settings");
  const t = useTranslations("studentSettings");
  const { data: session } = useSession();
  const user = session?.user as ExtendedUser | undefined;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader title={tPages("studentSettings.title")} description={tPages("studentSettings.description")} />

      <Card>
        <CardHeader>
          <CardTitle>{tSet("accountInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{tSet("name")}</Label>
              <Input value={user?.name || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>{t("role")}</Label>
              <Input value={t("student")} disabled />
            </div>
          </div>
          {user?.school && (
            <div className="space-y-2">
              <Label>{tSet("school")}</Label>
              <Input value={user.school} disabled />
            </div>
          )}
          <div className="grid grid-cols-3 gap-4">
            {user?.grade && (
              <div className="space-y-2">
                <Label>{t("grade")}</Label>
                <Input value={t("gradeValue", { grade: user.grade })} disabled />
              </div>
            )}
            {user?.className && (
              <div className="space-y-2">
                <Label>{t("className")}</Label>
                <Input value={t("classValue", { className: user.className })} disabled />
              </div>
            )}
            {user?.studentNumber && (
              <div className="space-y-2">
                <Label>{t("number")}</Label>
                <Input value={t("numberValue", { n: user.studentNumber })} disabled />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <PasswordChangeCard />

      <AccountWithdrawalCard role="STUDENT" />
    </div>
  );
}

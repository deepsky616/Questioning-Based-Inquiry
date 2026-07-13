"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/shared/confirm-dialog";

export function AccountWithdrawalCard({ role }: { role: "TEACHER" | "STUDENT" }) {
  const t = useTranslations("accountWithdrawal");
  const tc = useTranslations("common");
  const { toast } = useToast();
  const confirm = useConfirm();
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isTeacher = role === "TEACHER";

  async function deleteAccount() {
    if (!isTeacher) return;
    if (!(await confirm({
      title: t("finalConfirmTitle"),
      description: t("finalConfirmDesc"),
      confirmText: t("finalButton"),
      destructive: true,
    }))) return;

    setIsDeleting(true);
    try {
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t("deleteFailed"));
      }
      await signOut({ callbackUrl: "/login" });
    } catch (error) {
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : t("deleteFailed"),
      });
      setIsDeleting(false);
    }
  }

  return (
    <Card id="account-withdrawal" className="border-red-200 dark:border-red-500/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
          <AlertTriangle className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{isTeacher ? t("teacherDesc") : t("studentDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!noticeOpen ? (
          <Button variant="destructive" onClick={() => setNoticeOpen(true)}>
            {t("openNotice")}
          </Button>
        ) : (
          <div className="space-y-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-100">
            <div>
              <p className="font-bold">{t("noticeTitle")}</p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>{t("noticeNoRestore")}</li>
                <li>{t("noticeStudentAskTeacher")}</li>
                {isTeacher && <li>{t("noticeTeacherSessions")}</li>}
              </ul>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setNoticeOpen(false)} disabled={isDeleting}>
                {tc("cancel")}
              </Button>
              {isTeacher ? (
                <Button variant="destructive" onClick={deleteAccount} disabled={isDeleting}>
                  {isDeleting ? t("deleting") : t("finalButton")}
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setNoticeOpen(false)}>
                  {tc("confirm")}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

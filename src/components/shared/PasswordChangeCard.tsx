"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { validatePasswordPolicy } from "@/lib/password-policy";

/** 비밀번호 변경 카드 (학생·교사 설정 공용). 회원가입과 동일한 비밀번호 규칙·안내를 따른다. */
export function PasswordChangeCard() {
  const t = useTranslations("account");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleChangePassword() {
    setMsg(null);
    if (!currentPassword || !newPassword) {
      setMsg({ type: "error", text: t("enterBoth") });
      return;
    }
    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      setMsg({ type: "error", text: policyError });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg({ type: "error", text: t("mismatch") });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("changeFailed"));
      setMsg({ type: "success", text: t("changed") });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : t("changeFailed") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("changeTitle")}</CardTitle>
        <CardDescription>{t("changeDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">{t("rulesTitle")}</p>
          <p>{t("rule")}</p>
          <p>{t("allowedChars")}<span className="font-mono">! @ # $ % ^ &amp; * ( ) _ +</span></p>
          <p>{t("exampleLabel")}<span className="font-mono">edunet0079!</span>{t("exampleNote1")}<span className="font-mono">@1544EDUNET</span>{t("exampleNote2")}</p>
          <p className="text-amber-600">{t("warning")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cur">{t("currentPassword")}</Label>
          <Input id="cur" type="password" value={currentPassword} autoComplete="current-password"
            onChange={(e) => setCurrentPassword(e.target.value)} placeholder={t("currentPassword")} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="new">{t("newPassword")}</Label>
            <Input id="new" type="password" value={newPassword} autoComplete="new-password"
              onChange={(e) => setNewPassword(e.target.value)} placeholder={t("newPasswordPlaceholder")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">{t("newPasswordConfirm")}</Label>
            <Input id="confirm" type="password" value={confirmPassword} autoComplete="new-password"
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleChangePassword(); }}
              placeholder={t("confirmPlaceholder")} />
          </div>
        </div>
        {msg && (
          <p className={`text-sm ${msg.type === "success" ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>
        )}
        <Button onClick={handleChangePassword} disabled={saving} className="font-semibold">
          {saving ? t("changing") : t("changeBtn")}
        </Button>
      </CardContent>
    </Card>
  );
}

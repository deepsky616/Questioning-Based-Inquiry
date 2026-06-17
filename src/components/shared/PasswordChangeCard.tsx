"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { validatePasswordPolicy } from "@/lib/password-policy";

/** 비밀번호 변경 카드 (학생·교사 설정 공용). 회원가입과 동일한 비밀번호 규칙·안내를 따른다. */
export function PasswordChangeCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleChangePassword() {
    setMsg(null);
    if (!currentPassword || !newPassword) {
      setMsg({ type: "error", text: "현재 비밀번호와 새 비밀번호를 입력하세요" });
      return;
    }
    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      setMsg({ type: "error", text: policyError });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg({ type: "error", text: "새 비밀번호와 확인이 일치하지 않습니다" });
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
      if (!res.ok) throw new Error(data.error || "변경에 실패했습니다");
      setMsg({ type: "success", text: "비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하세요." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "변경에 실패했습니다" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>비밀번호 변경</CardTitle>
        <CardDescription>현재 비밀번호를 확인한 뒤 새 비밀번호로 바꿔요</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">📋 비밀번호 규칙</p>
          <p>숫자 + 영문 대/소문자 + 특수문자, 3가지를 조합하여 8~16자로 입력해주세요.</p>
          <p>· 사용 가능한 특수문자: <span className="font-mono">! @ # $ % ^ &amp; * ( ) _ +</span></p>
          <p>· 예시: <span className="font-mono">edunet0079!</span> (영문소문자+숫자+특수문자), <span className="font-mono">@1544EDUNET</span> (특수문자+숫자+영문대문자)</p>
          <p className="text-amber-600">⚠ 아이디·생년월일·전화번호 등 개인정보 관련 숫자, 연속된 숫자, 반복된 문자처럼 남이 쉽게 알아낼 수 있는 비밀번호는 피해주세요.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cur">현재 비밀번호</Label>
          <Input id="cur" type="password" value={currentPassword} autoComplete="current-password"
            onChange={(e) => setCurrentPassword(e.target.value)} placeholder="현재 비밀번호" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="new">새 비밀번호</Label>
            <Input id="new" type="password" value={newPassword} autoComplete="new-password"
              onChange={(e) => setNewPassword(e.target.value)} placeholder="8~16자, 숫자+영문+특수문자" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">새 비밀번호 확인</Label>
            <Input id="confirm" type="password" value={confirmPassword} autoComplete="new-password"
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleChangePassword(); }}
              placeholder="새 비밀번호 다시 입력" />
          </div>
        </div>
        {msg && (
          <p className={`text-sm ${msg.type === "success" ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>
        )}
        <Button onClick={handleChangePassword} disabled={saving} className="font-semibold">
          {saving ? "변경 중..." : "비밀번호 변경"}
        </Button>
      </CardContent>
    </Card>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("올바른 이메일을 입력해 주세요");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await res.json();

      if (!res.ok) {
        setError(result.error || "요청을 처리하지 못했습니다");
        return;
      }

      setMessage(result.message || "가입된 교사 이메일이라면 비밀번호 재설정 링크를 보냈습니다.");
    } catch {
      setError("서버 오류가 발생했습니다");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">비밀번호 찾기</CardTitle>
          <CardDescription className="text-center">교사 계정 이메일로 재설정 링크를 보냅니다</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>}
            {message && <div className="bg-emerald-50 text-emerald-700 text-sm p-3 rounded-md">{message}</div>}
            <div className="space-y-2">
              <Label htmlFor="email">교사 이메일</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="teacher@school.kr"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                  setMessage(null);
                }}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "전송 중..." : "재설정 링크 받기"}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <div className="text-sm text-muted-foreground text-center w-full">
            <Link href="/login?type=teacher" className="text-primary hover:underline">
              로그인으로 돌아가기
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = searchParams.get("role") === "teacher" ? "TEACHER" : "STUDENT";
  const [role, setRole] = useState<"STUDENT" | "TEACHER">(initialRole);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: "",
    school: "",
    grade: "",
    className: "",
    studentNumber: "",
    name: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { email, school, grade, className, studentNumber, name, password, confirmPassword } = form;

    if (role === "STUDENT" && (!school || !grade || !className || !studentNumber || !name || !password)) {
      setError("모든 항목을 입력해 주세요");
      return;
    }
    if (role === "TEACHER" && (!email || !name || !password)) {
      setError("모든 항목을 입력해 주세요");
      return;
    }
    if (role === "TEACHER" && !email.includes("@")) {
      setError("올바른 이메일을 입력해 주세요");
      return;
    }
    if (password.length < (role === "TEACHER" ? 6 : 4)) {
      setError(role === "TEACHER" ? "비밀번호는 6자 이상이어야 합니다" : "비밀번호는 4자 이상이어야 합니다");
      return;
    }
    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          role === "TEACHER"
            ? { role, email, school, name, password }
            : { role, school, grade, className, studentNumber, name, password }
        ),
      });

      if (!res.ok) {
        const result = await res.json();
        setError(result.error || "회원가입에 실패했습니다");
        return;
      }

      router.push(`/login?registered=true&type=${role === "TEACHER" ? "teacher" : "student"}`);
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
          <CardTitle className="text-2xl text-center">Question Lab</CardTitle>
          <CardDescription className="text-center">
            {role === "TEACHER" ? "교사 계정 만들기" : "학생 계정 만들기"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>
            )}

            <Tabs value={role} onValueChange={(value) => { setRole(value as "STUDENT" | "TEACHER"); setError(null); }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="STUDENT">학생 회원가입</TabsTrigger>
                <TabsTrigger value="TEACHER">교사 회원가입</TabsTrigger>
              </TabsList>

              <TabsContent value="STUDENT" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="school">학교</Label>
                  <Input id="school" name="school" placeholder="한빛초등학교" value={form.school} onChange={handleChange} />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="grade">학년</Label>
                    <Input id="grade" name="grade" placeholder="3" value={form.grade} onChange={handleChange} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="className">반</Label>
                    <Input id="className" name="className" placeholder="2" value={form.className} onChange={handleChange} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="studentNumber">번호</Label>
                    <Input id="studentNumber" name="studentNumber" placeholder="15" value={form.studentNumber} onChange={handleChange} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="TEACHER" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">이메일</Label>
                  <Input id="email" name="email" type="email" placeholder="teacher@school.kr" value={form.email} onChange={handleChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="teacher-school">학교 (선택)</Label>
                  <Input id="teacher-school" name="school" placeholder="한빛초등학교" value={form.school} onChange={handleChange} />
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <Label htmlFor="name">이름</Label>
              <Input id="name" name="name" placeholder={role === "TEACHER" ? "김선생" : "홍길동"} value={form.name} onChange={handleChange} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input id="password" name="password" type="password" placeholder={role === "TEACHER" ? "6자 이상" : "4자 이상"} value={form.password} onChange={handleChange} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">비밀번호 확인</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" placeholder="••••" value={form.confirmPassword} onChange={handleChange} />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "처리 중..." : "회원가입"}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <div className="text-sm text-muted-foreground text-center w-full">
            이미 계정이 있으신가요?{" "}
            <Link href="/login" className="text-primary hover:underline">
              로그인
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">로딩 중...</div>}>
      <RegisterContent />
    </Suspense>
  );
}

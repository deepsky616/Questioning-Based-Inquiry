"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import Link from "next/link";

function StudentLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ school: "", grade: "", className: "", studentNumber: "", password: "" });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.school || !form.grade || !form.className || !form.studentNumber || !form.password) {
      setError("모든 항목을 입력해 주세요");
      return;
    }
    setIsSubmitting(true);
    setError(null);

    const result = await signIn("credentials", {
      loginType: "student",
      school: form.school,
      grade: form.grade,
      className: form.className,
      studentNumber: form.studentNumber,
      password: form.password,
      redirect: false,
    });

    setIsSubmitting(false);
    if (result?.error) {
      setError("학교·학년·반·번호 또는 비밀번호가 올바르지 않습니다");
      return;
    }
    router.push("/student-dashboard");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>}
      <div className="space-y-2">
        <Label htmlFor="s-school">학교</Label>
        <Input id="s-school" name="school" placeholder="한빛초등학교" value={form.school} onChange={handleChange} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="s-grade">학년</Label>
          <Input id="s-grade" name="grade" placeholder="3" value={form.grade} onChange={handleChange} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-class">반</Label>
          <Input id="s-class" name="className" placeholder="2" value={form.className} onChange={handleChange} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-number">번호</Label>
          <Input id="s-number" name="studentNumber" placeholder="15" value={form.studentNumber} onChange={handleChange} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="s-password">비밀번호</Label>
        <Input id="s-password" name="password" type="password" placeholder="••••" value={form.password} onChange={handleChange} />
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "로그인 중..." : "학생 로그인"}
      </Button>
    </form>
  );
}

function TeacherLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError("이메일과 비밀번호를 입력해 주세요");
      return;
    }
    setIsSubmitting(true);
    setError(null);

    const result = await signIn("credentials", {
      loginType: "teacher",
      email: form.email,
      password: form.password,
      redirect: false,
    });

    setIsSubmitting(false);
    if (result?.error) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다");
      return;
    }
    router.push("/teacher-dashboard");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>}
      <div className="space-y-2">
        <Label htmlFor="t-email">이메일</Label>
        <Input id="t-email" name="email" type="email" placeholder="teacher@school.kr" value={form.email} onChange={handleChange} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="t-password">비밀번호</Label>
        <Input id="t-password" name="password" type="password" placeholder="••••••" value={form.password} onChange={handleChange} />
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "로그인 중..." : "교사 로그인"}
      </Button>
    </form>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const initialLoginType = searchParams.get("type") === "teacher" ? "teacher" : "student";
  const [loginType, setLoginType] = useState<"student" | "teacher">(initialLoginType);

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">Question Lab</CardTitle>
        <CardDescription className="text-center">질문기반 탐구수업 웹앱</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={loginType} onValueChange={(value) => setLoginType(value as "student" | "teacher")}>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="student">학생 로그인</TabsTrigger>
            <TabsTrigger value="teacher">교사 로그인</TabsTrigger>
          </TabsList>
          <TabsContent value="student">
            <StudentLoginForm />
          </TabsContent>
          <TabsContent value="teacher">
            <TeacherLoginForm />
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex flex-col space-y-2">
        <div className="text-sm text-muted-foreground text-center">
          {loginType === "teacher" ? "교사 계정이 없으신가요?" : "학생 계정이 없으신가요?"}{" "}
          <Link
            href={loginType === "teacher" ? "/register?role=teacher" : "/register?role=student"}
            className="text-primary hover:underline"
          >
            {loginType === "teacher" ? "교사 회원가입" : "학생 회원가입"}
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Suspense fallback={<div className="text-muted-foreground">로딩 중...</div>}>
        <LoginContent />
      </Suspense>
    </div>
  );
}

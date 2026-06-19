"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  sanitizeStudentNumberInput,
  STUDENT_LOGIN_AUTOCOMPLETE,
  STUDENT_LOGIN_FORM_PROPS,
  STUDENT_NUMBER_INPUT_PROPS,
  TEACHER_LOGIN_AUTOCOMPLETE,
  TEACHER_LOGIN_FORM_PROPS,
} from "@/lib/login-autocomplete";

const STUDENT_SAVE_KEY = "ql_saved_student_id";
const TEACHER_SAVE_KEY = "ql_saved_teacher_id";

function SaveIdCheckbox({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 cursor-pointer select-none w-fit">
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded cursor-pointer accent-primary"
      />
      <span className="text-sm text-muted-foreground">아이디 저장</span>
    </label>
  );
}

function StudentLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveId, setSaveId] = useState(false);
  const [form, setForm] = useState({
    school: "", grade: "", className: "", studentNumber: "", password: "",
  });

  // 저장된 아이디 복원
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STUDENT_SAVE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        school: string; grade: string; className: string; studentNumber: string;
      };
      setSaveId(true);
      setForm((prev) => ({
        ...prev,
        school: saved.school ?? "",
        grade: saved.grade ?? "",
        className: saved.className ?? "",
        studentNumber: saved.studentNumber ?? "",
      }));
    } catch {}
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value =
      e.target.name === "studentNumber"
        ? sanitizeStudentNumberInput(e.target.value)
        : e.target.value;
    setForm((prev) => ({ ...prev, [e.target.name]: value }));
    setError(null);
  };

  const handleSaveIdChange = (checked: boolean) => {
    setSaveId(checked);
    if (!checked) localStorage.removeItem(STUDENT_SAVE_KEY);
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

    // 로그인 성공 시 아이디 저장/삭제
    if (saveId) {
      localStorage.setItem(
        STUDENT_SAVE_KEY,
        JSON.stringify({
          school: form.school,
          grade: form.grade,
          className: form.className,
          studentNumber: form.studentNumber,
        })
      );
    } else {
      localStorage.removeItem(STUDENT_SAVE_KEY);
    }

    router.push("/student-dashboard");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" {...STUDENT_LOGIN_FORM_PROPS}>
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>
      )}
      <div className="space-y-2">
        <Label htmlFor="s-school">학교</Label>
        <Input
          id="s-school" name="school" placeholder="한빛초등학교"
          value={form.school} onChange={handleChange}
          autoComplete={STUDENT_LOGIN_AUTOCOMPLETE.school}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="s-grade">학년</Label>
          <Input
            id="s-grade" name="grade" placeholder="3"
            value={form.grade} onChange={handleChange}
            autoComplete={STUDENT_LOGIN_AUTOCOMPLETE.grade}
            inputMode="numeric" pattern="[0-9]*"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-class">반</Label>
          <Input
            id="s-class" name="className" placeholder="2"
            value={form.className} onChange={handleChange}
            autoComplete={STUDENT_LOGIN_AUTOCOMPLETE.className}
            inputMode="numeric" pattern="[0-9]*"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="s-number">번호</Label>
          <Input
            id="s-number" name="studentNumber" placeholder="15"
            value={form.studentNumber} onChange={handleChange}
            {...STUDENT_NUMBER_INPUT_PROPS}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="s-password">비밀번호</Label>
        <Input
          id="s-password" name="password" type="password" placeholder="••••"
          value={form.password} onChange={handleChange}
          autoComplete={STUDENT_LOGIN_AUTOCOMPLETE.password}
        />
      </div>

      {/* 아이디 저장 */}
      <SaveIdCheckbox id="s-save-id" checked={saveId} onChange={handleSaveIdChange} />

      <Button type="submit" variant="gradient" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "로그인 중..." : "학생 로그인"}
      </Button>
    </form>
  );
}

function TeacherLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveId, setSaveId] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  // 저장된 이메일 복원
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TEACHER_SAVE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { email: string };
      setSaveId(true);
      setForm((prev) => ({ ...prev, email: saved.email ?? "" }));
    } catch {}
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
  };

  const handleSaveIdChange = (checked: boolean) => {
    setSaveId(checked);
    if (!checked) localStorage.removeItem(TEACHER_SAVE_KEY);
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

    // 로그인 성공 시 이메일 저장/삭제
    if (saveId) {
      localStorage.setItem(TEACHER_SAVE_KEY, JSON.stringify({ email: form.email }));
    } else {
      localStorage.removeItem(TEACHER_SAVE_KEY);
    }

    router.push("/teacher-dashboard");
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" {...TEACHER_LOGIN_FORM_PROPS}>
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>
      )}
      <div className="space-y-2">
        <Label htmlFor="t-email">이메일</Label>
        <Input
          id="t-email" name="email" type="email" placeholder="teacher@school.kr"
          value={form.email} onChange={handleChange}
          autoComplete={TEACHER_LOGIN_AUTOCOMPLETE.email}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="t-password">비밀번호</Label>
        <Input
          id="t-password" name="password" type="password" placeholder="••••••"
          value={form.password} onChange={handleChange}
          autoComplete={TEACHER_LOGIN_AUTOCOMPLETE.password}
        />
      </div>

      {/* 아이디 저장 + 비밀번호 찾기 */}
      <div className="flex items-center justify-between">
        <SaveIdCheckbox id="t-save-id" checked={saveId} onChange={handleSaveIdChange} />
        <Link href="/forgot-password" className="text-sm text-primary hover:underline">
          비밀번호 찾기
        </Link>
      </div>

      <Button type="submit" variant="gradient" className="w-full" disabled={isSubmitting}>
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-100 dark:bg-none dark:bg-background p-4">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-6xl items-center gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="overflow-hidden rounded-2xl border border-white/70 bg-white/80 p-3 shadow-xl shadow-blue-100/70 sm:p-4">
          <div className="relative aspect-[3/2] rounded-xl bg-white">
            <Image
              src="/login-inquiry-hero.png"
              alt="질문에서 탐구로 이어지는 학습 여정 일러스트"
              fill
              sizes="(max-width: 1024px) 100vw, 60vw"
              className="object-contain"
              priority
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent p-5 text-white">
              <p className="text-sm font-medium opacity-90">Question Lab</p>
              <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">
                질문에서 시작해 탐구로 이어지는 수업
              </h1>
            </div>
          </div>
        </section>

        <div className="flex justify-center">
          <Suspense fallback={<div className="text-muted-foreground">로딩 중...</div>}>
            <LoginContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

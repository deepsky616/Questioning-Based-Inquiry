"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";
import { validateTeacherClasses, buildTeacherClassLabel } from "@/lib/teacher";
import { validatePasswordPolicy } from "@/lib/password-policy";

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
  const [teacherClasses, setTeacherClasses] = useState<Array<{ grade: string; className: string }>>([
    { grade: "", className: "" },
  ]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { email, school, grade, className, studentNumber, name, password, confirmPassword } = form;

    // 항목별로 무엇이 비었는지 구체적으로 안내
    const missing = (label: string) => { setError(`${label}을(를) 입력해 주세요`); };
    if (!name) { missing("이름"); return; }
    if (!school) { missing("학교"); return; }
    if (role === "STUDENT") {
      if (!grade) { missing("학년"); return; }
      if (!className) { missing("반"); return; }
      if (!studentNumber) { missing("번호"); return; }
    }
    if (role === "TEACHER" && !email) { missing("이메일"); return; }
    if (!password) { missing("비밀번호"); return; }
    if (role === "TEACHER" && !email.includes("@")) {
      setError("올바른 이메일을 입력해 주세요");
      return;
    }
    if (role === "TEACHER") {
      const classError = validateTeacherClasses(teacherClasses);
      if (classError) { setError(classError); return; }
    }
    const passwordError = validatePasswordPolicy(password);
    if (passwordError) {
      setError(passwordError);
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
            ? { role, email, school, name, password, teacherClasses }
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
                  <Label htmlFor="teacher-school">학교</Label>
                  <Input id="teacher-school" name="school" placeholder="한빛초등학교" value={form.school} onChange={handleChange} />
                </div>

                {/* 담당 학년·반 다중 선택 */}
                <div className="space-y-2">
                  <Label>담당 학년·반 <span className="text-red-500">*</span></Label>
                  <div className="space-y-2">
                    {teacherClasses.map((tc, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          placeholder="학년 (예: 3)"
                          value={tc.grade}
                          onChange={(e) => {
                            const updated = [...teacherClasses];
                            updated[idx] = { ...tc, grade: e.target.value };
                            setTeacherClasses(updated);
                            setError(null);
                          }}
                          className="w-24"
                        />
                        <span className="text-sm text-gray-500">학년</span>
                        <Input
                          placeholder="반 (예: 2)"
                          value={tc.className}
                          onChange={(e) => {
                            const updated = [...teacherClasses];
                            updated[idx] = { ...tc, className: e.target.value };
                            setTeacherClasses(updated);
                            setError(null);
                          }}
                          className="w-24"
                        />
                        <span className="text-sm text-gray-500">반</span>
                        {teacherClasses.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setTeacherClasses(teacherClasses.filter((_, i) => i !== idx))}
                            className="text-gray-400 hover:text-red-500 text-lg leading-none"
                          >
                            ×
                          </button>
                        )}
                        {tc.grade && tc.className && (
                          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                            {buildTeacherClassLabel(tc.grade, tc.className)}
                          </span>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setTeacherClasses([...teacherClasses, { grade: "", className: "" }])}
                      className="text-sm text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      + 학년·반 추가
                    </button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <Label htmlFor="name">이름</Label>
              <Input id="name" name="name" placeholder={role === "TEACHER" ? "김선생" : "홍길동"} value={form.name} onChange={handleChange} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input id="password" name="password" type="password" placeholder="8~16자, 숫자+영문+특수문자" value={form.password} onChange={handleChange} />
              <div className="rounded-md border bg-muted/40 p-2.5 text-[11px] leading-5 text-muted-foreground space-y-0.5">
                <p>숫자 + 영문 대/소문자 + 특수문자, 3가지를 조합하여 8~16자로 입력해주세요.</p>
                <p>· 사용 가능한 특수문자: <span className="font-mono">! @ # $ % ^ &amp; * ( ) _ +</span></p>
                <p>· 예시: <span className="font-mono">edunet0079!</span>, <span className="font-mono">@1544EDUNET</span></p>
                <p className="text-amber-600">⚠ 생년월일·전화번호 등 개인정보, 연속·반복된 문자는 피해주세요.</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">비밀번호 확인</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" placeholder="비밀번호 다시 입력" value={form.confirmPassword} onChange={handleChange} />
            </div>

            <Button type="submit" variant="gradient" className="w-full" disabled={isSubmitting}>
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

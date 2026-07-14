"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";
import { validateTeacherClasses, buildTeacherClassLabel } from "@/lib/teacher";
import { validatePasswordPolicy } from "@/lib/password-policy";
import { useTranslations } from "next-intl";

function RegisterContent() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: "",
    school: "",
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
    const { email, school, name, password, confirmPassword } = form;

    // 항목별로 무엇이 비었는지 구체적으로 안내
    const missing = (label: string) => { setError(t("fieldRequired", { field: label })); };
    if (!name) { missing(t("name")); return; }
    if (!school) { missing(t("school")); return; }
    if (!email) { missing(t("email")); return; }
    if (!password) { missing(t("password")); return; }
    if (!email.includes("@")) {
      setError(t("invalidEmail"));
      return;
    }
    const classError = validateTeacherClasses(teacherClasses);
    if (classError) { setError(classError); return; }
    const passwordError = validatePasswordPolicy(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "TEACHER",
          email,
          school,
          name,
          password,
          teacherClasses,
        }),
      });

      if (!res.ok) {
        const result = await res.json();
        setError(result.error || t("signupFailed"));
        return;
      }

      router.push("/login?registered=true&type=teacher");
    } catch {
      setError(t("serverError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-register-surface min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">Question Lab</CardTitle>
          <CardDescription className="text-center">
            {t("createTeacherAccount")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" name="email" type="email" placeholder="teacher@gmail.com" value={form.email} onChange={handleChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="teacher-school">{t("school")}</Label>
              <Input id="teacher-school" name="school" placeholder={t("schoolPlaceholder")} value={form.school} onChange={handleChange} />
            </div>

            <div className="space-y-2">
              <Label>{t("teacherClassLabel")} <span className="text-red-500">*</span></Label>
              <div className="space-y-2">
                {teacherClasses.map((tc, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      placeholder={t("gradePlaceholderShort")}
                      value={tc.grade}
                      onChange={(e) => {
                        const updated = [...teacherClasses];
                        updated[idx] = { ...tc, grade: e.target.value };
                        setTeacherClasses(updated);
                        setError(null);
                      }}
                      className="w-24"
                    />
                    <span className="text-sm text-gray-500">{t("grade")}</span>
                    <Input
                      placeholder={t("classPlaceholderShort")}
                      value={tc.className}
                      onChange={(e) => {
                        const updated = [...teacherClasses];
                        updated[idx] = { ...tc, className: e.target.value };
                        setTeacherClasses(updated);
                        setError(null);
                      }}
                      className="w-24"
                    />
                    <span className="text-sm text-gray-500">{t("className")}</span>
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
                  {t("addClass")}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">{t("name")}</Label>
              <Input id="name" name="name" placeholder={t("namePlaceholderTeacher")} value={form.name} onChange={handleChange} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input id="password" name="password" type="password" placeholder={t("passwordHint")} value={form.password} onChange={handleChange} />
              <div className="rounded-md border bg-muted/40 p-2.5 text-[11px] leading-5 text-muted-foreground space-y-0.5">
                <p>{t("passwordRule")}</p>
                <p>{t("passwordAllowed")}<span className="font-mono">! @ # $ % ^ &amp; * ( ) _ +</span></p>
                <p>{t("passwordExample")}<span className="font-mono">edunet0079!</span>, <span className="font-mono">@1544EDUNET</span></p>
                <p className="text-amber-600">{t("passwordWarning")}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("passwordConfirm")}</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" placeholder={t("passwordConfirmPlaceholder")} value={form.confirmPassword} onChange={handleChange} />
            </div>

            <Button type="submit" variant="gradient" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t("processing") : t("signup")}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <div className="text-sm text-muted-foreground text-center w-full">
            {t("alreadyHaveAccount")}{" "}
            <Link href="/login" className="text-primary hover:underline">
              {t("login")}
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function RegisterPage() {
  const t = useTranslations("auth");
  return (
    <Suspense fallback={<div className="auth-register-surface min-h-screen flex items-center justify-center text-muted-foreground">{t("loading")}</div>}>
      <RegisterContent />
    </Suspense>
  );
}

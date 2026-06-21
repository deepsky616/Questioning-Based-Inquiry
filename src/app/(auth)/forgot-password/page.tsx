"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setError(t("invalidEmail"));
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
        setError(result.error || t("requestFailed"));
        return;
      }

      setMessage(result.message || t("resetLinkSent"));
    } catch {
      setError(t("serverError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl text-center">{t("forgotPassword")}</CardTitle>
          <CardDescription className="text-center">{t("forgotPasswordDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>}
            {message && <div className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-sm p-3 rounded-md">{message}</div>}
            <div className="space-y-2">
              <Label htmlFor="email">{t("teacherEmail")}</Label>
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
              {isSubmitting ? t("sending") : t("getResetLink")}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <div className="text-sm text-muted-foreground text-center w-full">
            <Link href="/login?type=teacher" className="text-primary hover:underline">
              {t("backToLogin")}
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

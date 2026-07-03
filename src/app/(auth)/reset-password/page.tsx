"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";

function ResetPasswordContent() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError(t("invalidResetLink"));
      return;
    }
    if (password.length < 6) {
      setError(t("passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await res.json();

      if (!res.ok) {
        setError(result.error || t("changeFailed"));
        return;
      }

      setMessage(result.message || t("passwordChanged"));
      setPassword("");
      setConfirmPassword("");
    } catch {
      setError(t("serverError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">{t("setNewPassword")}</CardTitle>
        <CardDescription className="text-center">{t("setNewPasswordDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">{error}</div>}
          {message && <div className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-sm p-3 rounded-md">{message}</div>}
          <div className="space-y-2">
            <Label htmlFor="password">{t("newPassword")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder={t("min6")}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t("newPasswordConfirm")}</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder={t("min6")}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError(null);
              }}
            />
          </div>
          <Button type="submit" variant="gradient" className="w-full" disabled={isSubmitting || Boolean(message)}>
            {isSubmitting ? t("changing") : t("changePassword")}
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
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Suspense fallback={<div className="text-muted-foreground">{t("loading")}</div>}>
        <ResetPasswordContent />
      </Suspense>
    </div>
  );
}

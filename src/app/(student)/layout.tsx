"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { PageNav } from "@/components/shared/PageNav";
import { AppNav } from "@/components/shared/AppNav";
import { getSessionUser } from "@/lib/auth-helpers";

const STUDENT_PAGES = [
  { href: "/student-dashboard", key: "dashboard" },
  { href: "/student-question-play", key: "questionPlay" },
  { href: "/student-ask", key: "ask" },
  { href: "/student-questions", key: "explore" },
  { href: "/student-report", key: "reports" },
  { href: "/student-settings", key: "settings" },
] as const;

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const user = getSessionUser(session);
  const router = useRouter();
  const t = useTranslations("nav");
  const pages = STUDENT_PAGES.map((p) => ({ href: p.href, label: t(p.key) }));

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated" && user.role !== "STUDENT") {
      router.push("/teacher-dashboard");
    }
  }, [status, user.role, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">로딩 중...</div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-background">
      <AppNav
        pages={pages}
        userName={user.name ?? ""}
        roleSuffix={t("studentSuffix")}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
        <PageNav pages={pages} />
      </main>
    </div>
  );
}

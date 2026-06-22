"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageNav } from "@/components/shared/PageNav";
import { AppNav } from "@/components/shared/AppNav";
import { NotificationBell } from "@/components/teacher/NotificationBell";
import { getSessionUser } from "@/lib/auth-helpers";

// 수업 사이클 순서: 홈 → 준비(탐구질문 설계 → 수업세션 배포) → 검토(질문조회) → 활동(질문놀이) → 분석(리포트) → 관리(학생) → 설정
const TEACHER_PAGES = [
  { href: "/teacher-dashboard", key: "dashboard" },
  { href: "/teacher-curriculum", key: "curriculum" },
  { href: "/teacher-sessions", key: "sessions" },
  { href: "/teacher-questions", key: "questions" },
  { href: "/teacher-question-play", key: "questionPlay" },
  { href: "/teacher-reports", key: "reports" },
  { href: "/teacher-students", key: "students" },
  { href: "/teacher-settings", key: "settings" },
] as const;

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const user = getSessionUser(session);
  const router = useRouter();
  const t = useTranslations("nav");
  const pages = TEACHER_PAGES.map((p) => ({ href: p.href, label: t(p.key) }));

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated" && user.role !== "TEACHER") {
      router.push("/student-dashboard");
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
        roleSuffix={t("teacherSuffix")}
        extra={<NotificationBell />}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
        <PageNav pages={pages} />
      </main>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { PageNav } from "@/components/shared/PageNav";
import { AppNav } from "@/components/shared/AppNav";
import { NotificationBell } from "@/components/teacher/NotificationBell";
import { getSessionUser } from "@/lib/auth-helpers";

const TEACHER_PAGES = [
  { href: "/teacher-dashboard", label: "대시보드" },
  { href: "/teacher-students", label: "학생관리" },
  { href: "/teacher-question-play", label: "질문놀이" },
  { href: "/teacher-sessions", label: "수업세션" },
  { href: "/teacher-questions", label: "질문조회" },
  { href: "/teacher-curriculum", label: "탐구질문" },
  { href: "/teacher-reports", label: "활동 리포트" },
  { href: "/teacher-settings", label: "설정" },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const user = getSessionUser(session);
  const router = useRouter();

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
        pages={TEACHER_PAGES}
        userName={user.name ?? ""}
        roleSuffix="선생님"
        extra={<NotificationBell />}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
        <PageNav pages={TEACHER_PAGES} />
      </main>
    </div>
  );
}

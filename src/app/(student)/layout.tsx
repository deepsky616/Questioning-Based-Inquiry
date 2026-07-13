"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { PageNav } from "@/components/shared/PageNav";
import { AppNav } from "@/components/shared/AppNav";
import { StudentNotificationBell } from "@/components/student/StudentNotificationBell";
import { getSessionUser } from "@/lib/auth-helpers";

// 학습 흐름 순서: 홈(대시보드+상세 리포트 탭) → 질문학습 → 질문연습 → 질문하기 → 질문탐구 → 질문놀이
// 활동 리포트는 대시보드의 '상세 리포트' 탭으로 통합되어 별도 메뉴에서 제외.
// 개인 정보 수정은 상단 계정 메뉴에서 접근한다.
const STUDENT_PAGES = [
  { href: "/student-dashboard", key: "dashboard" },
  { href: "/student-question-learning", key: "questionLearning" },
  { href: "/student-practice", key: "practice" },
  { href: "/student-ask", key: "ask" },
  { href: "/student-questions", key: "explore" },
  { href: "/student-question-play", key: "questionPlay" },
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
        extra={<StudentNotificationBell />}
        accountProfile={{
          school: user.school,
          grade: user.grade,
          className: user.className,
          studentNumber: user.studentNumber,
        }}
        accountLinks={{
          settingsHref: "/student-settings",
          rankingsHref: "/student-points",
        }}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
        <PageNav pages={pages} />
      </main>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageNav } from "@/components/shared/PageNav";
import { AppNav } from "@/components/shared/AppNav";
import { NotificationBell } from "@/components/teacher/NotificationBell";
import { getSessionUser } from "@/lib/auth-helpers";

// 수업 사이클 순서: 홈(대시보드+상세 리포트 탭) → 질문학습 → 질문연습 → 준비(탐구질문 설계 → 수업세션 배포) → 검토(질문탐구) → 활동(질문놀이)
// 활동 리포트는 대시보드의 '상세 리포트' 탭으로 통합되어 별도 메뉴에서 제외.
// 학생관리와 개인 정보 수정은 상단 계정 메뉴에서 접근한다.
const TEACHER_PAGES = [
  { href: "/teacher-dashboard", key: "dashboard" },
  { href: "/teacher-question-learning", key: "questionLearning" },
  { href: "/teacher-practice", key: "practice" },
  { href: "/teacher-sessions", key: "sessions" },
  { href: "/teacher-questions", key: "questions" },
  { href: "/teacher-question-play", key: "questionPlay" },
] as const;

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const user = getSessionUser(session);
  const router = useRouter();
  const t = useTranslations("nav");
  const pages = TEACHER_PAGES.map((p) => ({
    href: p.href,
    label: t(p.key),
    ...(p.href === "/teacher-sessions" ? { aliases: ["/teacher-curriculum"] } : {}),
  }));

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
        accountProfile={{
          school: user.school,
          grade: user.grade,
          className: user.className,
          studentNumber: user.studentNumber,
        }}
        accountLinks={{
          settingsHref: "/teacher-settings",
          studentManagementHref: "/teacher-students",
          rankingsHref: "/teacher-points",
          detailedReportHref: "/teacher-dashboard?tab=reports",
        }}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
        <PageNav pages={pages} />
      </main>
    </div>
  );
}

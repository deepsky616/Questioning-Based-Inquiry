"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageNav } from "@/components/shared/PageNav";
import { AppNav } from "@/components/shared/AppNav";
import { getSessionUser } from "@/lib/auth-helpers";

const STUDENT_PAGES = [
  { href: "/student-dashboard", label: "대시보드" },
  { href: "/student-question-play", label: "질문놀이" },
  { href: "/student-ask", label: "질문하기" },
  { href: "/student-questions", label: "질문탐구" },
  { href: "/student-report", label: "활동 리포트" },
  { href: "/student-settings", label: "설정" },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const user = getSessionUser(session);
  const router = useRouter();

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
        pages={STUDENT_PAGES}
        userName={user.name ?? ""}
        roleSuffix="학생"
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
        <PageNav pages={STUDENT_PAGES} />
      </main>
    </div>
  );
}

"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageNav } from "@/components/shared/PageNav";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { getSessionUser } from "@/lib/auth-helpers";

const STUDENT_PAGES = [
  { href: "/student-dashboard", label: "대시보드" },
  { href: "/student-question-play", label: "질문놀이" },
  { href: "/student-unit-design", label: "탐구설계" },
  { href: "/student-ask", label: "질문하기" },
  { href: "/student-questions", label: "질문" },
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
      <header className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold text-primary">Question Lab</h1>
              <nav className="flex space-x-1">
                {STUDENT_PAGES.map((p) => (
                  <Link
                    key={p.href}
                    href={p.href}
                    className="text-muted-foreground hover:text-primary px-3 py-2 rounded-md text-sm font-medium"
                  >
                    {p.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <span className="text-sm text-muted-foreground">{user.name} 학생</span>
              <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
                로그아웃
              </Button>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
        <PageNav pages={STUDENT_PAGES} />
      </main>
    </div>
  );
}

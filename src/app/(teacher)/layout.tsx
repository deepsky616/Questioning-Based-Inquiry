"use client";

import { useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageNav } from "@/components/shared/PageNav";
import { getSessionUser } from "@/lib/auth-helpers";

const TEACHER_PAGES = [
  { href: "/teacher-dashboard", label: "대시보드" },
  { href: "/teacher-students", label: "학생관리" },
  { href: "/teacher-questions", label: "질문조회" },
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold text-primary">Question Lab</h1>
              <nav className="flex space-x-1">
                {TEACHER_PAGES.map((p) => (
                  <Link
                    key={p.href}
                    href={p.href}
                    className="text-gray-700 hover:text-primary px-3 py-2 rounded-md text-sm font-medium"
                  >
                    {p.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{user.name} 선생님</span>
              <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
                로그아웃
              </Button>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
        <PageNav pages={TEACHER_PAGES} />
      </main>
    </div>
  );
}

"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    } else if (status === "authenticated" && (session?.user as any)?.role !== "STUDENT") {
      router.push("/teacher-dashboard");
    }
  }, [session, status, router]);

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
              <nav className="flex space-x-4">
                <Link href="/student-dashboard" className="text-gray-700 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">
                  대시보드
                </Link>
                <Link href="/student-ask" className="text-gray-700 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">
                  질문하기
                </Link>
                <Link href="/student-history" className="text-gray-700 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">
                  내 질문
                </Link>
                <Link href="/student-explore" className="text-gray-700 hover:text-primary px-3 py-2 rounded-md text-sm font-medium">
                  탐구
                </Link>
              </nav>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{(session?.user as any)?.name}학생</span>
              <Link href="/student-settings">
                <Button variant="outline" size="sm">설정</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </div>
  );
}
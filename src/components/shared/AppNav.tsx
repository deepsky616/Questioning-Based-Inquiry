"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { LanguageToggle } from "@/components/shared/LanguageToggle";
import { cn } from "@/lib/utils";

export interface NavPage {
  href: string;
  label: string;
}

/**
 * 교사·학생 공용 반응형 헤더.
 * - md 이상: 브랜드 + 인라인 네비(활성 링크 강조) + 우측 도구
 * - md 미만: 브랜드 + 우측 도구 + 햄버거, 메뉴는 펼침 패널로 표시
 */
export function AppNav({
  pages,
  userName,
  roleSuffix,
  extra,
}: {
  pages: NavPage[];
  userName: string;
  roleSuffix: string;
  extra?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const t = useTranslations("nav");

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="bg-card shadow-sm border-b sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center gap-3 h-16">
          {/* 왼쪽: 브랜드 + 인라인 네비(남는 공간 내에서만, 길면 가로 스크롤) */}
          <div className="flex items-center gap-4 xl:gap-6 min-w-0 flex-1">
            <h1 className="text-xl font-bold text-primary shrink-0">Question Lab</h1>
            <nav className="hidden lg:flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
              {pages.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  className={cn(
                    "shrink-0 whitespace-nowrap px-2.5 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive(p.href)
                      ? "bg-muted text-primary"
                      : "text-muted-foreground hover:text-primary hover:bg-muted/60",
                  )}
                >
                  {p.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* 오른쪽: 도구 — 항상 고정폭(네비에 절대 안 가려짐) */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {extra}
            <LanguageToggle />
            <ThemeToggle />
            <span className="hidden xl:inline text-sm text-muted-foreground truncate max-w-[8rem]">
              {userName} {roleSuffix}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="hidden lg:inline-flex"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              {t("logout")}
            </Button>
            {/* 햄버거: 인라인 네비가 숨는 lg 미만에서 표시 */}
            <button
              type="button"
              aria-label={open ? t("closeMenu") : t("openMenu")}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="lg:hidden inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-muted"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* 펼침 메뉴 (lg 미만) */}
      {open && (
        <div className="lg:hidden border-t bg-card">
          <nav className="max-w-7xl mx-auto px-4 py-2 space-y-1">
            {pages.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "block px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive(p.href)
                    ? "bg-muted text-primary"
                    : "text-muted-foreground hover:text-primary hover:bg-muted/60",
                )}
              >
                {p.label}
              </Link>
            ))}
            <div className="flex items-center justify-between pt-2 mt-1 border-t">
              <span className="text-sm text-muted-foreground truncate">{userName} {roleSuffix}</span>
              <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
                {t("logout")}
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

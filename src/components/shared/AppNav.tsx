"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { ChevronDown, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { LanguageToggle } from "@/components/shared/LanguageToggle";
import { cn } from "@/lib/utils";

export interface NavPage {
  href: string;
  label: string;
}

const ITEM_GAP = 4; // gap-1
const MORE_RESERVE = 104; // "더보기/More ▾" 버튼 + 여유 폭

/**
 * 인라인 네비(lg 이상). 남는 폭에 맞춰 들어가는 항목만 보이고,
 * 넘치는 항목은 "더보기" 드롭다운으로 모은다(priority-plus).
 * 언어·화면폭이 바뀌어도 항목이 잘리거나 우측 도구와 겹치지 않는다.
 */
function InlineNav({
  pages,
  isActive,
  moreLabel,
}: {
  pages: NavPage[];
  isActive: (href: string) => boolean;
  moreLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(pages.length);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const recompute = () => {
      const container = containerRef.current;
      const measure = measureRef.current;
      if (!container || !measure) return;
      const avail = container.clientWidth;
      const widths = Array.from(measure.children).map((el) => (el as HTMLElement).getBoundingClientRect().width);

      const totalAll = widths.reduce((sum, w, i) => sum + w + (i > 0 ? ITEM_GAP : 0), 0);
      if (totalAll <= avail) {
        setVisibleCount(pages.length);
        return;
      }
      // 전부 안 들어가면 "더보기" 버튼 폭을 확보하고 들어가는 만큼만 노출
      let used = 0;
      let count = 0;
      for (let i = 0; i < widths.length; i++) {
        const add = widths[i] + (i > 0 ? ITEM_GAP : 0);
        if (used + add + MORE_RESERVE <= avail) {
          used += add;
          count++;
        } else {
          break;
        }
      }
      setVisibleCount(count);
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [pages]);

  const visible = pages.slice(0, visibleCount);
  const overflow = pages.slice(visibleCount);
  const overflowActive = overflow.some((p) => isActive(p.href));

  const linkClass = (href: string) =>
    cn(
      "shrink-0 whitespace-nowrap px-2.5 py-2 rounded-md text-sm font-medium transition-colors",
      isActive(href)
        ? "bg-muted text-primary"
        : "text-muted-foreground hover:text-primary hover:bg-muted/60",
    );

  return (
    <div ref={containerRef} className="relative hidden lg:flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
      {/* 폭 측정용(보이지 않음, 레이아웃 영향 없음) */}
      <div ref={measureRef} aria-hidden className="invisible pointer-events-none absolute left-0 top-0 flex gap-1">
        {pages.map((p) => (
          <span key={p.href} className="px-2.5 py-2 text-sm font-medium whitespace-nowrap">
            {p.label}
          </span>
        ))}
      </div>

      {visible.map((p) => (
        <Link key={p.href} href={p.href} className={linkClass(p.href)}>
          {p.label}
        </Link>
      ))}

      {overflow.length > 0 && (
        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "shrink-0 inline-flex items-center gap-0.5 whitespace-nowrap px-2.5 py-2 rounded-md text-sm font-medium transition-colors",
                overflowActive
                  ? "bg-muted text-primary"
                  : "text-muted-foreground hover:text-primary hover:bg-muted/60",
              )}
            >
              {moreLabel}
              <ChevronDown className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52 p-1">
            {overflow.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                onClick={() => setMoreOpen(false)}
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
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

/**
 * 교사·학생 공용 반응형 헤더.
 * - lg 이상: 브랜드 + 인라인 네비(넘치면 "더보기" 드롭다운) + 우측 도구
 * - lg 미만: 브랜드 + 우측 도구 + 햄버거(펼침 메뉴)
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
          {/* 왼쪽: 브랜드 + 인라인 네비(남는 공간 내에서 priority-plus) */}
          <div className="flex items-center gap-4 xl:gap-6 min-w-0 flex-1">
            <h1 className="text-xl font-bold text-primary shrink-0">Question Lab</h1>
            <InlineNav pages={pages} isActive={isActive} moreLabel={t("more")} />
          </div>

          {/* 오른쪽: 도구 — 항상 고정폭(네비에 절대 안 가려짐) */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2 xl:gap-3 [&_button]:min-h-11 [&_button]:min-w-11">
            {extra}
            <div className="hidden min-[360px]:block">
              <LanguageToggle />
            </div>
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
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted lg:hidden"
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
            <div className="mt-1 hidden border-t pt-2 max-[359px]:block">
              <LanguageToggle id="mobile-lang-select" compactOnMobile={false} />
            </div>
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

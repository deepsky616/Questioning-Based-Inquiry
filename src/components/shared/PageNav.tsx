"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { isNavPageActive, type NavPage } from "@/components/shared/AppNav";

interface PageNavProps {
  pages: NavPage[];
}

export function PageNav({ pages }: PageNavProps) {
  const t = useTranslations("chrome");
  const pathname = usePathname();
  const currentIndex = pages.findIndex((page) => isNavPageActive(pathname, page));
  if (currentIndex < 0) return null;
  const home = pages[0];
  const prev = currentIndex > 0 ? pages[currentIndex - 1] : null;
  const next = currentIndex < pages.length - 1 ? pages[currentIndex + 1] : null;
  const isHome = currentIndex === 0;

  return (
    <div className="mt-8 pt-4 border-t border-border flex items-center justify-between">
      <div className="flex gap-2">
        {!isHome && (
          <Button asChild variant="outline" size="sm">
            <Link href={home.href}>{t("navHome")}</Link>
          </Button>
        )}
        {prev && (
          <Button asChild variant="outline" size="sm">
            <Link href={prev.href}>← {prev.label}</Link>
          </Button>
        )}
      </div>

      <span className="text-xs text-muted-foreground">
        {currentIndex + 1} / {pages.length}
      </span>

      <div>
        {next && (
          <Button asChild variant="outline" size="sm">
            <Link href={next.href}>{next.label} →</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

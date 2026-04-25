"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

interface PageNavProps {
  pages: { href: string; label: string }[];
}

export function PageNav({ pages }: PageNavProps) {
  const pathname = usePathname();
  const currentIndex = pages.findIndex((p) => p.href === pathname);
  const home = pages[0];
  const prev = currentIndex > 0 ? pages[currentIndex - 1] : null;
  const next = currentIndex < pages.length - 1 ? pages[currentIndex + 1] : null;
  const isHome = currentIndex === 0;

  return (
    <div className="mt-8 pt-4 border-t border-gray-200 flex items-center justify-between">
      <div className="flex gap-2">
        {!isHome && (
          <Link href={home.href}>
            <Button variant="outline" size="sm">
              🏠 홈
            </Button>
          </Link>
        )}
        {prev && (
          <Link href={prev.href}>
            <Button variant="outline" size="sm">
              ← {prev.label}
            </Button>
          </Link>
        )}
      </div>

      <span className="text-xs text-gray-400">
        {currentIndex + 1} / {pages.length}
      </span>

      <div>
        {next && (
          <Link href={next.href}>
            <Button variant="outline" size="sm">
              {next.label} →
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

"use client";

import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

// 지원 언어(메시지 카탈로그가 있는 언어). 추가 시 messages/<code>.json + 여기 항목 추가.
const LANGS: { code: string; label: string }[] = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
];

/**
 * 언어 전환 — NEXT_LOCALE 쿠키를 설정하고 새로고침한다.
 * (라우팅 없는 next-intl 설정이라 서버가 쿠키로 카탈로그를 고른다)
 */
export function LanguageToggle({
  id = "lang-select",
  compactOnMobile = true,
}: {
  id?: string;
  compactOnMobile?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("common");

  function change(code: string) {
    if (code === locale) return;
    // 1년 유효 쿠키
    document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.reload();
  }

  return (
    <div className="relative">
      <label className="sr-only" htmlFor={id}>{t("language")}</label>
      <div
        title={t("language")}
        className={cn(
          "relative inline-flex h-11 items-center rounded-md text-sm text-muted-foreground hover:bg-muted",
          compactOnMobile
            ? "w-11 justify-center sm:w-auto sm:gap-1 sm:px-2"
            : "w-auto gap-1 px-2",
        )}
      >
        <Globe className="pointer-events-none h-4 w-4 shrink-0" />
        <select
          id={id}
          value={locale}
          onChange={(e) => change(e.target.value)}
          className={cn(
            "cursor-pointer bg-transparent pr-1 text-sm outline-none",
            compactOnMobile && "absolute inset-0 h-full w-full opacity-0 sm:static sm:h-auto sm:w-auto sm:opacity-100",
          )}
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

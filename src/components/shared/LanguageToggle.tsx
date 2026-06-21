"use client";

import { useLocale } from "next-intl";
import { Globe } from "lucide-react";

// 지원 언어(메시지 카탈로그가 있는 언어). 추가 시 messages/<code>.json + 여기 항목 추가.
const LANGS: { code: string; label: string }[] = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
];

/**
 * 언어 전환 — NEXT_LOCALE 쿠키를 설정하고 새로고침한다.
 * (라우팅 없는 next-intl 설정이라 서버가 쿠키로 카탈로그를 고른다)
 */
export function LanguageToggle() {
  const locale = useLocale();

  function change(code: string) {
    if (code === locale) return;
    // 1년 유효 쿠키
    document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.reload();
  }

  return (
    <div className="relative">
      <label className="sr-only" htmlFor="lang-select">Language</label>
      <div className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted">
        <Globe className="h-4 w-4 shrink-0" />
        <select
          id="lang-select"
          value={locale}
          onChange={(e) => change(e.target.value)}
          className="cursor-pointer bg-transparent pr-1 text-sm outline-none"
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

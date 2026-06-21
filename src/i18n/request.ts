import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { parseAcceptLanguage, DEFAULT_LOCALE } from "@/lib/locale";

// 메시지 카탈로그가 존재하는 언어(없는 언어는 ko로 폴백)
export const SUPPORTED_LOCALES = ["ko", "en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

function resolveLocale(cookieLocale: string | undefined, acceptLanguage: string | null): AppLocale {
  if (cookieLocale && (SUPPORTED_LOCALES as readonly string[]).includes(cookieLocale)) {
    return cookieLocale as AppLocale;
  }
  const fromHeader = parseAcceptLanguage(acceptLanguage);
  return (SUPPORTED_LOCALES as readonly string[]).includes(fromHeader)
    ? (fromHeader as AppLocale)
    : (DEFAULT_LOCALE as AppLocale);
}

// 라우팅 없는 next-intl 설정: 쿠키(NEXT_LOCALE) → Accept-Language → ko 순으로 언어 결정
export default getRequestConfig(async () => {
  const cookieStore = cookies();
  const headerStore = headers();
  const locale = resolveLocale(
    cookieStore.get("NEXT_LOCALE")?.value,
    headerStore.get("accept-language"),
  );
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});

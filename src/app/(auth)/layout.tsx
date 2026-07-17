import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AUTH_CLIENT_NAMESPACES, pickMessages } from "@/i18n/client-namespaces";

// 로그인·가입·비밀번호 재설정 화면에는 auth 번역만 보낸다.
// 새 namespace를 쓰면 AUTH_CLIENT_NAMESPACES에 추가해야 하며,
// 누락 시 i18n-client-payload.test.ts 가드가 실패한다.
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(messages, AUTH_CLIENT_NAMESPACES)}
    >
      {children}
    </NextIntlClientProvider>
  );
}

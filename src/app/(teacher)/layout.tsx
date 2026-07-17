import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { TEACHER_CLIENT_NAMESPACES, pickMessages } from "@/i18n/client-namespaces";
import { TeacherShell } from "./TeacherShell";

// 교사 영역 전용 번역만 클라이언트로 보낸다(전체 카탈로그 인라인 방지).
// 새 namespace를 쓰면 TEACHER_CLIENT_NAMESPACES에 추가해야 하며,
// 누락 시 i18n-client-payload.test.ts 가드가 실패한다.
export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={pickMessages(messages, TEACHER_CLIENT_NAMESPACES)}
    >
      <TeacherShell>{children}</TeacherShell>
    </NextIntlClientProvider>
  );
}

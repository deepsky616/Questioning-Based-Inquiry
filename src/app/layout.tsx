import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { Providers } from "@/components/shared/providers";
import { ROOT_CLIENT_NAMESPACES, pickMessages } from "@/i18n/client-namespaces";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Question Lab - 질문기반 탐구수업",
  description: "학생들의 질문을 분석하고 효과적인 질문 작성 능력을 길러주는 웹앱",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Question Lab",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#7C3AED" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={inter.className}>
        {/* 전역에는 공통 namespace만 — 영역별 번역은 각 그룹 레이아웃이 보낸다 */}
        <NextIntlClientProvider
          locale={locale}
          messages={pickMessages(messages, ROOT_CLIENT_NAMESPACES)}
        >
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

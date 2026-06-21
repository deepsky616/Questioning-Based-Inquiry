"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function Home() {
  const router = useRouter();
  const t = useTranslations("appShell");

  useEffect(() => {
    router.push("/login");
  }, [router]);

  // 로그인으로 넘어가기 전 짧게 보이는 브랜드 스플래시
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-3xl text-4xl font-black text-white shadow-lg"
          style={{ background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)" }}
        >
          ?
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-foreground">Question Lab</p>
          <p className="text-xs text-muted-foreground">{t("tagline")}</p>
        </div>
        <span className="mt-1 h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// 라우트 세그먼트 에러 경계 — 페이지 렌더/데이터 예외를 잡아 빈 화면 대신 안내를 보여준다.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("appShell");
  const tc = useTranslations("common");
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-5xl">😵</div>
      <div>
        <h2 className="text-xl font-bold text-foreground">{t("errorTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("errorDesc")}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>{tc("retry")}</Button>
        <Button variant="outline" onClick={() => (window.location.href = "/")}>
          {tc("home")}
        </Button>
      </div>
    </div>
  );
}

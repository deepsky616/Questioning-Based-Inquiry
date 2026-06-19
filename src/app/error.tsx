"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// 라우트 세그먼트 에러 경계 — 페이지 렌더/데이터 예외를 잡아 빈 화면 대신 안내를 보여준다.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-5xl">😵</div>
      <div>
        <h2 className="text-xl font-bold text-foreground">문제가 발생했어요</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          잠시 후 다시 시도해 주세요. 계속되면 새로고침하거나 선생님께 알려 주세요.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>다시 시도</Button>
        <Button variant="outline" onClick={() => (window.location.href = "/")}>
          처음으로
        </Button>
      </div>
    </div>
  );
}

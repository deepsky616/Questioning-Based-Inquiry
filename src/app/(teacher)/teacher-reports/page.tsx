"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

// 활동 리포트는 대시보드의 '상세 리포트' 탭으로 통합됨. 기존 경로/북마크는 그쪽으로 보낸다.
export default function TeacherReportsRedirect() {
  const router = useRouter();
  const tc = useTranslations("common");
  useEffect(() => {
    router.replace("/teacher-dashboard?tab=reports");
  }, [router]);

  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <p className="text-muted-foreground text-sm">{tc("redirecting")}</p>
    </div>
  );
}

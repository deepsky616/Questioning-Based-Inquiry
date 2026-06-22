"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export default function TeacherPointsRedirect() {
  const router = useRouter();
  const tc = useTranslations("common");
  useEffect(() => {
    router.replace("/teacher-students");
  }, [router]);

  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <p className="text-muted-foreground text-sm">{tc("redirecting")}</p>
    </div>
  );
}

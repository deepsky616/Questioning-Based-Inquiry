"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TeacherPointsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/teacher-students");
  }, [router]);

  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <p className="text-muted-foreground text-sm">학생관리로 이동 중...</p>
    </div>
  );
}

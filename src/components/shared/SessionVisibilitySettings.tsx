"use client";

import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export interface SessionVisibilityValue {
  isActive: boolean;
  defaultQuestionPublic: boolean;
  likesVisibleToPeers: boolean;
  commentsVisibleToPeers: boolean;
}

/**
 * 배포 탐구설계의 공개 설정 토글(학생 활성화·질문 공개·좋아요 공개·댓글 공개) 공통 UI.
 * 문구는 sequencePanel 네임스페이스(배포 맥락) 기준. 2×2 그리드 카드로 통일.
 * (일반 수업세션 생성 폼은 "학생 활성화" 의미가 달라 이 컴포넌트를 쓰지 않는다.)
 */
export function SessionVisibilitySettings({
  value,
  onChange,
  className,
}: {
  value: SessionVisibilityValue;
  onChange: (next: SessionVisibilityValue) => void;
  className?: string;
}) {
  const t = useTranslations("sequencePanel");
  const rows: [keyof SessionVisibilityValue, string, string][] = [
    ["isActive", t("activeLabel"), t("activeDesc")],
    ["defaultQuestionPublic", t("publicLabel"), t("publicDesc")],
    ["likesVisibleToPeers", t("likesLabel"), t("likesDesc")],
    ["commentsVisibleToPeers", t("commentsLabel"), t("commentsDesc")],
  ];
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {rows.map(([key, label, desc]) => (
        <div key={key} className="rounded-md border border-border bg-background p-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground">{label}</p>
            <Switch checked={value[key]} onCheckedChange={(checked) => onChange({ ...value, [key]: checked })} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{desc}</p>
        </div>
      ))}
    </div>
  );
}

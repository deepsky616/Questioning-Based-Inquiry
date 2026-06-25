"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionToggleProps {
  /** 섹션 제목(텍스트 또는 노드) */
  title: ReactNode;
  /** 펼침 여부 */
  open: boolean;
  /** 토글 핸들러 */
  onToggle: () => void;
  /** 제목 앞 아이콘(이모지 등) */
  icon?: ReactNode;
  /** 제목 뒤 보조 노드(개수 배지 등) */
  suffix?: ReactNode;
  className?: string;
}

/**
 * 교사·학생 페이지의 섹션 접기/펼치기 토글 공통 구현.
 * 펼침 ▾ / 접힘 ▸ 셰브론 패턴으로 통일한다.
 */
export function SectionToggle({ title, open, onToggle, icon, suffix, className }: SectionToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "flex items-center gap-1.5 text-base font-semibold leading-none tracking-tight text-foreground transition-colors hover:text-primary",
        className,
      )}
    >
      {icon}
      {title}
      {suffix}
      <span className="text-sm text-muted-foreground">{open ? "▾" : "▸"}</span>
    </button>
  );
}

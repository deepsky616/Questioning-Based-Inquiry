"use client";

// 월별 그룹 세션 목록 — 진행 중(항상 펼침)과 지난 세션(접이식) 공용.
// 세션이 쌓여도 목록이 길어지지 않게 지난 세션은 기본으로 가장 최근 달만 펼친다.
import { CollapseChevron } from "@/components/shared/SectionToggle";
import type { SessionMonthGroup } from "@/lib/sessions";
import { TeacherSessionRow } from "./TeacherSessionRow";
import type { QuestionSession } from "./types";

interface RowHandlers {
  onDelete: (id: string) => void;
  onToggleActive: (id: string, currentValue: boolean) => void;
  onTogglePublic: (id: string, currentValue: boolean) => void;
  onToggleLikes: (id: string, currentValue: boolean) => void;
  onToggleCommentsVisible: (id: string, currentValue: boolean) => void;
  onEditSave: (id: string, patch: { date: string; subject?: string; topic: string }) => Promise<boolean>;
}

interface TeacherSessionMonthListProps extends RowHandlers {
  groups: SessionMonthGroup<QuestionSession>[];
  /** 접이식 여부 — 지난 세션 목록만 true */
  collapsible?: boolean;
  /** 검색·필터 중에는 결과가 가려지지 않게 모두 펼친다 */
  forceOpen?: boolean;
  /** 펼침 상태(null이면 기본값: 전부 접힘) */
  expandedKeys?: Set<string> | null;
  onToggleGroup?: (key: string) => void;
}

export function TeacherSessionMonthList({
  groups,
  collapsible = false,
  forceOpen = false,
  expandedKeys = null,
  onToggleGroup,
  ...rowHandlers
}: TeacherSessionMonthListProps) {

  return (
    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
      {groups.map((group) => {
        const open =
          !collapsible || forceOpen || (expandedKeys?.has(group.key) ?? false);
        const header = (
          <>
            {group.label} <span className="font-normal">({group.sessions.length})</span>
          </>
        );
        return (
          <section key={group.key} className="divide-y divide-border">
            {collapsible ? (
              <button
                type="button"
                onClick={() => onToggleGroup?.(group.key)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 bg-muted/40 px-4 py-2 text-left text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/70"
              >
                <CollapseChevron open={open} />
                {header}
              </button>
            ) : (
              <div className="bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground">{header}</div>
            )}
            {open &&
              group.sessions.map((s) => (
                <TeacherSessionRow key={s.id} session={s} {...rowHandlers} />
              ))}
          </section>
        );
      })}
    </div>
  );
}

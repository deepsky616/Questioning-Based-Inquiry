"use client";

import { ChevronRight } from "lucide-react";

export interface PriorityTaskListItem {
  key: string;
  label: string;
  countLabel: string;
  detail?: string;
}

interface PriorityTaskListProps<TItem extends PriorityTaskListItem> {
  items: TItem[];
  onSelect: (item: TItem) => void;
}

export function PriorityTaskList<TItem extends PriorityTaskListItem>({
  items,
  onSelect,
}: PriorityTaskListProps<TItem>) {
  return (
    <div className="divide-y divide-border">
      {items.slice(0, 3).map((item) => (
        <button
          key={item.key}
          type="button"
          aria-label={`${item.label} ${item.countLabel}`}
          onClick={() => onSelect(item)}
          className="grid w-full grid-cols-[minmax(0,1fr)_auto_20px] items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">{item.label}</span>
            {item.detail && (
              <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                {item.detail}
              </span>
            )}
          </span>
          <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
            {item.countLabel}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

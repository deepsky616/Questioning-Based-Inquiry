"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type NotificationTone = "default" | "danger" | "warning";

export interface NotificationMenuItem {
  id: string;
  href?: string | null;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
  meta?: ReactNode;
  unread?: boolean;
  tone?: NotificationTone;
  onClick?: () => void | Promise<void>;
}

const badgeClass: Record<NotificationTone, string> = {
  default: "bg-indigo-500",
  danger: "bg-red-500",
  warning: "bg-amber-500",
};

const dotClass: Record<NotificationTone, string> = {
  default: "bg-indigo-500",
  danger: "bg-red-500",
  warning: "bg-amber-500",
};

const countClass: Record<NotificationTone, string> = {
  default: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
  danger: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
};

export function NotificationBellMenu({
  title,
  emptyText,
  unreadText,
  count,
  badgeTone = "default",
  items,
  open,
  onOpenChange,
  className,
  actionText,
  onAction,
  actionDisabled,
}: {
  title: string;
  emptyText: string;
  unreadText?: string;
  count: number;
  badgeTone?: NotificationTone;
  items: NotificationMenuItem[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  actionText?: string;
  onAction?: () => void | Promise<void>;
  actionDisabled?: boolean;
}) {
  const renderItem = (item: NotificationMenuItem) => {
    const tone = item.tone ?? "default";
    const content = (
      <>
        {item.icon ? (
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center text-muted-foreground">
            {item.icon}
          </span>
        ) : (
          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dotClass[tone])} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{item.label}</span>
          {item.meta && <span className="mt-0.5 block text-xs text-muted-foreground">{item.meta}</span>}
        </span>
        {typeof item.count === "number" && item.count > 0 && (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", countClass[tone])}>
            {item.count}
          </span>
        )}
        {item.unread && unreadText && (
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", countClass[tone])}>
            {unreadText}
          </span>
        )}
      </>
    );
    const itemClass = cn(
      "flex w-full gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted",
      item.unread === false && "opacity-75",
    );
    const handleClick = () => {
      onOpenChange?.(false);
      void item.onClick?.();
    };

    return item.href ? (
      <Link key={item.id} href={item.href} onClick={handleClick} className={itemClass}>
        {content}
      </Link>
    ) : (
      <button key={item.id} type="button" onClick={handleClick} className={itemClass}>
        {content}
      </button>
    );
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={title}
          className={cn("relative inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted", className)}
        >
          <Bell className="h-5 w-5 text-muted-foreground" />
          {count > 0 && (
            <span className={cn("absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full px-1 text-center text-[10px] font-bold leading-[18px] text-white", badgeClass[badgeTone])}>
              {count > 99 ? "99+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {actionText && onAction && (
            <button
              type="button"
              disabled={actionDisabled}
              onClick={() => void onAction()}
              className="rounded-md px-2 py-1 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
            >
              {actionText}
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="max-h-96 overflow-y-auto py-1">
            {items.map(renderItem)}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

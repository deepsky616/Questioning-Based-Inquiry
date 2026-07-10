"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface TeacherTaskItem {
  key: string;
  title: string;
  description: string;
  count: number;
  action: string;
  href: string;
  activeClass: string;
}

interface TeacherTodayTasksCardProps {
  taskItems: TeacherTaskItem[];
  hasOpenTasks: boolean;
  onTaskClick: (item: TeacherTaskItem) => void;
  labels: {
    title: string;
    description: string;
    done: string;
  };
}

export function TeacherTodayTasksCard({
  taskItems,
  hasOpenTasks,
  onTaskClick,
  labels,
}: TeacherTodayTasksCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{labels.title}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{labels.description}</p>
          </div>
          {!hasOpenTasks && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
              {labels.done}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 md:grid-cols-2">
          {taskItems.map((item) => {
            const active = item.count > 0;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onTaskClick(item)}
                className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                  active
                    ? item.activeClass
                    : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-5">{item.description}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-sm font-bold ${
                      active
                        ? "bg-white/80 text-foreground dark:bg-background/70"
                        : "bg-background text-muted-foreground"
                    }`}
                  >
                    {item.count}
                  </span>
                </div>
                <p className="mt-2 text-xs font-semibold">{item.action}</p>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

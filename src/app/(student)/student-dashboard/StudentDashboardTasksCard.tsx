"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppNotification } from "@/lib/app-notifications";
import { notificationMetadataText } from "@/lib/app-notifications";
import { useTranslations } from "next-intl";

export interface StudentDashboardTaskItem {
  key: string;
  title: string;
  description: string;
  count: number;
  progress?: {
    total: number;
    completed: number;
    remaining: number;
  };
  action: string;
  href: string;
  activeClass: string;
}

interface StudentDashboardTasksCardProps {
  hasStudentTasks: boolean;
  visibleTeacherRequests: AppNotification[];
  teacherRequestCount: number;
  taskItems: StudentDashboardTaskItem[];
  onTeacherRequestClick: (item: AppNotification, href: string) => void | Promise<void>;
  onTaskClick: (item: StudentDashboardTaskItem) => void;
}

export function StudentDashboardTasksCard({
  hasStudentTasks,
  visibleTeacherRequests,
  teacherRequestCount,
  taskItems,
  onTeacherRequestClick,
  onTaskClick,
}: StudentDashboardTasksCardProps) {
  const t = useTranslations("studentDash");

  return (
    <Card className="student-dashboard-task-panel md:h-full">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{t("todayTasksTitle")}</CardTitle>
            <CardDescription>{t("todayTasksDesc")}</CardDescription>
          </div>
          {!hasStudentTasks && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
              {t("taskDone")}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {visibleTeacherRequests.length > 0 && (
          <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/80 p-3 dark:border-indigo-500/30 dark:bg-indigo-950/30">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-indigo-700 dark:text-indigo-200">{t("taskTeacherRequestTitle")}</p>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-background/70 dark:text-indigo-200">
                {teacherRequestCount}
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {visibleTeacherRequests.map((item) => {
                const sessionTitle = notificationMetadataText(item.metadata, "sessionTitle");
                const teacherName = notificationMetadataText(item.metadata, "teacherName");
                const label = sessionTitle
                  ? t("taskTeacherRequestDescWithSession", { teacherName, sessionTitle })
                  : item.message || item.title;
                const href = item.href ?? "/student-ask";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onTeacherRequestClick(item, href)}
                    className="min-h-[92px] rounded-md border border-indigo-200 bg-white px-3 py-2 text-left text-sm transition-colors hover:bg-indigo-100 dark:border-indigo-800 dark:bg-background/80 dark:hover:bg-indigo-950/50"
                  >
                    <p className="font-semibold text-foreground">{label}</p>
                    <p className="mt-1 text-xs font-semibold text-indigo-700 dark:text-indigo-200">{t("taskAsk")}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="student-dashboard-task-grid grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {taskItems.map((item) => {
            const active = item.count > 0;
            const progressPercent = item.progress && item.progress.total > 0
              ? Math.round((item.progress.completed / item.progress.total) * 100)
              : 0;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onTaskClick(item)}
                className={`min-h-[116px] rounded-lg border px-4 py-3 text-left transition-colors ${
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
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-sm font-bold ${
                    active ? "bg-white/80 text-foreground dark:bg-background/70" : "bg-background text-muted-foreground"
                  }`}>
                    {item.count}
                  </span>
                </div>
                {item.progress && item.progress.total > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs font-medium">
                      <span>
                        {t("taskSessionProgress", {
                          total: item.progress.total,
                          completed: item.progress.completed,
                          remaining: item.progress.remaining,
                        })}
                      </span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/70 dark:bg-background/50">
                      <div
                        className="h-full rounded-full bg-current opacity-70 transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                )}
                <p className="mt-2 text-xs font-semibold">{item.action}</p>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

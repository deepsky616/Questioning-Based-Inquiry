"use client";

import { RefreshCw } from "lucide-react";
import {
  PriorityTaskList,
  type PriorityTaskListItem,
} from "@/components/shared/PriorityTaskList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from "next-intl";
import {
  DashboardQuestionClassRow,
  type DashboardQuestionClassRowProps,
} from "@/components/shared/DashboardQuestionClassRow";

export interface StudentDashboardTaskItem extends PriorityTaskListItem {
  href: string;
}

interface StudentDashboardTasksCardProps {
  status: "loading" | "ready" | "error";
  taskItems: StudentDashboardTaskItem[];
  onTaskClick: (item: StudentDashboardTaskItem) => void;
  onRetry: () => void;
  schedule: DashboardQuestionClassRowProps;
}

export function StudentDashboardTasksCard({
  status,
  taskItems,
  onTaskClick,
  onRetry,
  schedule,
}: StudentDashboardTasksCardProps) {
  const t = useTranslations("studentDash");

  return (
    <Card className="student-dashboard-task-panel md:h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("todayTasksTitle")}</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">{t("todayTasksDesc")}</p>
      </CardHeader>
      <CardContent>
        {!(status === "error" && schedule.status === "error") && (
          <DashboardQuestionClassRow {...schedule} />
        )}

        {status === "loading" && (
          <div role="status" aria-label={t("taskLoading")} className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">{t("taskLoading")}</p>
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        )}

        {status === "error" && (
          <div role="alert" className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">{t("taskLoadError")}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("taskRetry")}
            </Button>
          </div>
        )}

        {status === "ready" && taskItems.length === 0 && (
          <p className="py-3 text-sm text-muted-foreground">{t("taskDone")}</p>
        )}

        {status === "ready" && taskItems.length > 0 && (
          <PriorityTaskList items={taskItems} onSelect={onTaskClick} />
        )}
      </CardContent>
    </Card>
  );
}

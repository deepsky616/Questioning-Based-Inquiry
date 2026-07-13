"use client";

import { RefreshCw } from "lucide-react";
import {
  PriorityTaskList,
  type PriorityTaskListItem,
} from "@/components/shared/PriorityTaskList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DashboardQuestionClassRow,
  type DashboardQuestionClassRowProps,
} from "@/components/shared/DashboardQuestionClassRow";

export interface TeacherTaskItem extends PriorityTaskListItem {
  href: string;
}

interface TeacherTodayTasksCardProps {
  taskItems: TeacherTaskItem[];
  status: "loading" | "ready" | "error";
  onTaskClick: (item: TeacherTaskItem) => void;
  onRetry: () => void;
  schedule: DashboardQuestionClassRowProps;
  labels: {
    title: string;
    description: string;
    done: string;
    loading: string;
    error: string;
    retry: string;
  };
}

export function TeacherTodayTasksCard({
  taskItems,
  status,
  onTaskClick,
  onRetry,
  schedule,
  labels,
}: TeacherTodayTasksCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{labels.title}</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">{labels.description}</p>
      </CardHeader>
      <CardContent>
        <DashboardQuestionClassRow {...schedule} />

        {status === "loading" && (
          <div role="status" aria-label={labels.loading} className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">{labels.loading}</p>
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        )}

        {status === "error" && (
          <div role="alert" className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-destructive">{labels.error}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              {labels.retry}
            </Button>
          </div>
        )}

        {status === "ready" && taskItems.length === 0 && (
          <p className="py-3 text-sm text-muted-foreground">{labels.done}</p>
        )}

        {status === "ready" && taskItems.length > 0 && (
          <PriorityTaskList items={taskItems} onSelect={onTaskClick} />
        )}
      </CardContent>
    </Card>
  );
}

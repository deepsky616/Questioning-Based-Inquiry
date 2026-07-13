"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClassificationDonut } from "@/components/shared/ClassificationDonut";
import type { QuestionClassificationSummary } from "./types";

interface TeacherQuestionStatsCardProps {
  stats: QuestionClassificationSummary;
  labels: {
    title: string;
    countSuffix: string;
    category1: string;
    category2: string;
    closure: string;
    cognitive: string;
    closedLabel: string;
    closedDesc: string;
    openLabel: string;
    openDesc: string;
    factualLabel: string;
    factualDesc: string;
    conceptualLabel: string;
    conceptualDesc: string;
    controversialLabel: string;
    controversialDesc: string;
  };
}

export function TeacherQuestionStatsCard({ stats, labels }: TeacherQuestionStatsCardProps) {
  const pct = (count: number) => (stats.total ? Math.round((count / stats.total) * 100) : 0);
  const bar = (name: string, value: number, color: string, desc: string) => (
    <div key={name} className="mb-2 w-full px-1.5">
      <div className="flex items-center gap-2 py-0.5">
        <span className="w-20 shrink-0 whitespace-nowrap text-center text-xs text-muted-foreground">{name}</span>
        <div className="flex-1 h-3.5 rounded bg-muted overflow-hidden">
          <div style={{ width: `${pct(value)}%`, background: color, height: "100%" }} />
        </div>
        <span className="w-16 shrink-0 text-right text-xs font-semibold text-foreground">
          {value} ({pct(value)}%)
        </span>
      </div>
      <p className="pl-[5.5rem] text-[11px] leading-tight text-muted-foreground">{desc}</p>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {labels.title} <span className="text-xs font-normal text-muted-foreground">{labels.countSuffix}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <p className="text-xs text-muted-foreground font-semibold mb-2">
              {labels.category1} — {labels.closure}
            </p>
            <div className="flex items-center gap-3">
              <ClassificationDonut
                size={108}
                slices={[
                  { name: labels.closedLabel, value: stats.closure.closed, fill: "#3b82f6" },
                  { name: labels.openLabel, value: stats.closure.open, fill: "#10b981" },
                ]}
              />
              <div className="flex-1 min-w-0">
                {bar(labels.closedLabel, stats.closure.closed, "#3b82f6", labels.closedDesc)}
                {bar(labels.openLabel, stats.closure.open, "#10b981", labels.openDesc)}
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold mb-2">
              {labels.category2} — {labels.cognitive}
            </p>
            <div className="flex items-center gap-3">
              <ClassificationDonut
                size={108}
                slices={[
                  { name: labels.factualLabel, value: stats.cognitive.factual, fill: "#94a3b8" },
                  { name: labels.conceptualLabel, value: stats.cognitive.conceptual, fill: "#a855f7" },
                  { name: labels.controversialLabel, value: stats.cognitive.controversial, fill: "#f97316" },
                ]}
              />
              <div className="flex-1 min-w-0">
                {bar(labels.factualLabel, stats.cognitive.factual, "#94a3b8", labels.factualDesc)}
                {bar(labels.conceptualLabel, stats.cognitive.conceptual, "#a855f7", labels.conceptualDesc)}
                {bar(labels.controversialLabel, stats.cognitive.controversial, "#f97316", labels.controversialDesc)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

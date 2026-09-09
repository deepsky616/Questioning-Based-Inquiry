"use client";

import { useTranslations } from "next-intl";
import type { GrowthRecord } from "./question-growth-types";

export function QuestionGrowthReportContent({ record, print = false }: {
  record: Pick<GrowthRecord, "originalContent" | "revisedContent" | "changeNote" | "reflection">;
  print?: boolean;
}) {
  const t = useTranslations("growth");
  const changed = record.originalContent.trim() !== record.revisedContent.trim();
  const fields = [
    { key: "original", label: print && !changed ? "myQuestion" : "original", value: record.originalContent, row: 1, column: print && !changed ? "1 / -1" : "1" },
    { key: "revised", label: "revised", value: changed ? record.revisedContent : "", row: 1, column: "2" },
    { key: "changeNote", label: "changeNote", value: record.changeNote ?? "", row: 2, column: "1" },
    { key: "reflection", label: "reflection", value: record.reflection, row: 2, column: "2" },
  ];

  return <dl className={print ? "rdoc-growth-grid" : "grid min-w-0 gap-4 sm:grid-cols-2"}>
    {fields.filter(field => !print || field.value.trim()).map(field => {
      const written = Boolean(field.value.trim());
      return <div key={field.key}
        className={print ? "rdoc-growth-field" : `min-w-0 rounded-xl border p-3 sm:p-4 ${written ? "bg-background" : "border-dashed bg-muted/30"}`}
        style={print ? { gridRow: field.row, gridColumn: field.column } : undefined}>
        <dt className={print ? "rdoc-fb-h" : "text-base font-semibold text-emerald-800 dark:text-emerald-200"}>{t(field.label)}</dt>
        <dd className={print ? "rdoc-fb-b" : "mt-2 whitespace-pre-wrap break-words text-base leading-relaxed"}>
          {written ? field.value : <span className="text-sm text-muted-foreground">{t(field.key === "revised" ? "notRevisedReadOnly" : "notWritten")}</span>}
        </dd>
      </div>;
    })}
  </dl>;
}

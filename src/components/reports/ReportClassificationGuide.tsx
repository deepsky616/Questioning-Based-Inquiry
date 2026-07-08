"use client";

import { useTranslations } from "next-intl";

export function ReportClassificationGuide() {
  const tCls = useTranslations("classification");

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-3 text-sm font-bold text-foreground">📚 {tCls("guideTitle")}</p>
      <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{tCls("category1")} · {tCls("category1Sub")}</p>
          <ul className="space-y-1 text-xs text-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: "#3b82f6" }} />
              <span><b className="font-semibold">{tCls("closed.label")}</b> <span className="text-muted-foreground">{tCls("closed.desc")}</span></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: "#10b981" }} />
              <span><b className="font-semibold">{tCls("open.label")}</b> <span className="text-muted-foreground">{tCls("open.desc")}</span></span>
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{tCls("category2")} · {tCls("category2Sub")}</p>
          <ul className="space-y-1 text-xs text-foreground">
            <li className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: "#94a3b8" }} />
              <span><b className="font-semibold">{tCls("factual.label")}</b> <span className="text-muted-foreground">{tCls("factual.desc")}</span></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: "#a855f7" }} />
              <span><b className="font-semibold">{tCls("conceptual.label")}</b> <span className="text-muted-foreground">{tCls("conceptual.desc")}</span></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: "#f97316" }} />
              <span><b className="font-semibold">{tCls("controversial.label")}</b> <span className="text-muted-foreground">{tCls("controversial.desc")}</span></span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

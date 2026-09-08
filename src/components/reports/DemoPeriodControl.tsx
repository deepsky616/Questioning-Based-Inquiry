"use client";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { getSessionUser } from "@/lib/auth-helpers";
export function DemoPeriodControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { data: session } = useSession();
  const t = useTranslations("demoPeriod");
  if (!getSessionUser(session).isDemo) return null;
  return <div className="no-print my-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/50 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/20">
    <label className="flex flex-wrap items-center gap-3 font-semibold">{t("title")}<select className="min-h-11 rounded-lg border border-input bg-background px-3 font-normal" value={value} onChange={(event) => onChange(event.target.value)}><option value="current">{t("current")}</option><option value="latest">{t("latest")}</option></select></label>
    <p className="text-muted-foreground">{t("description")}</p>
  </div>;
}

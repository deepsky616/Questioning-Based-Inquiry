"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { validatePasswordPolicy } from "@/lib/password-policy";
import { EmptyState } from "@/components/shared/EmptyState";
import { useTeacherStudents } from "@/lib/app-queries";

interface StudentRow {
  id: string;
  name: string;
  grade: string;
  className: string;
  studentNumber: string;
}

export function StudentPasswordResetCard({ embedded = false }: { embedded?: boolean } = {}) {
  const t = useTranslations("account");
  const studentQuery = useTeacherStudents<StudentRow, { grade: string; className: string }>();
  const { data } = studentQuery;
  const students = useMemo(() => data?.students ?? [], [data]);
  const [classKey, setClassKey] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // 학급 옵션(학생 데이터에서 추출, 학년·반 순)
  const classOptions = useMemo(() => {
    const map = new Map<string, { grade: string; className: string }>();
    for (const s of students) {
      const key = `${s.grade}|${s.className}`;
      if (!map.has(key)) map.set(key, { grade: s.grade, className: s.className });
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => (a.grade + a.className < b.grade + b.className ? -1 : 1));
  }, [students]);

  useEffect(() => {
    if (classOptions.length > 0 && !classOptions.some((c) => c.key === classKey)) {
      setClassKey(classOptions[0].key);
    }
  }, [classOptions, classKey]);

  const classStudents = useMemo(
    () =>
      students
        .filter((s) => `${s.grade}|${s.className}` === classKey)
        .sort((a, b) => (parseInt(a.studentNumber || "0", 10) - parseInt(b.studentNumber || "0", 10))),
    [students, classKey],
  );

  // 학급이 바뀌면 선택 초기화
  useEffect(() => { setChecked(new Set()); }, [classKey]);

  const allChecked = classStudents.length > 0 && classStudents.every((s) => checked.has(s.id));
  const someChecked = checked.size > 0 && !allChecked;
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someChecked;
  }, [someChecked]);
  const toggleAll = () =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (allChecked) classStudents.forEach((s) => next.delete(s.id));
      else classStudents.forEach((s) => next.add(s.id));
      return next;
    });
  const toggleOne = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  async function handleReset() {
    setMsg(null);
    const ids = Array.from(checked);
    if (ids.length === 0) {
      setMsg({ type: "error", text: t("selectStudent") });
      return;
    }
    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      setMsg({ type: "error", text: policyError });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/teacher/students/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentIds: ids, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(t("resetFailed"));
      setMsg({ type: "success", text: t("resetDone", { count: data.count }) });
      setChecked(new Set());
      setNewPassword("");
    } catch {
      setMsg({ type: "error", text: t("resetFailed") });
    } finally {
      setSaving(false);
    }
  }

  const body = (
    <div className="space-y-4">
        {studentQuery.isLoading ? (
          <p role="status" className="py-8 text-center text-sm text-muted-foreground">
            {t("studentListLoading")}
          </p>
        ) : studentQuery.isError ? (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="font-medium">{t("studentListLoadError")}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void studentQuery.refetch()}>
              {t("retry")}
            </Button>
          </div>
        ) : students.length === 0 ? (
          <EmptyState icon="🧑‍🏫" title={t("noStudents")} />
        ) : (
          <>
            {classOptions.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="resetStudentClass">{t("selectClass")}</Label>
                <Select value={classKey} onValueChange={setClassKey}>
                  <SelectTrigger id="resetStudentClass" className="bg-background"><SelectValue placeholder={t("selectClass")} /></SelectTrigger>
                  <SelectContent>
                    {classOptions.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{t("gradeClass", { grade: c.grade, className: c.className })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="rounded-lg border">
              <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allChecked}
                    aria-checked={someChecked ? "mixed" : allChecked}
                    onChange={toggleAll}
                  />
                  {t("selectAll")}
                </label>
                <span className="text-xs text-muted-foreground">{t("selectedCount", { count: checked.size })}</span>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y">
                {classStudents.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/40 cursor-pointer">
                    <input type="checkbox" checked={checked.has(s.id)} onChange={() => toggleOne(s.id)} />
                    <span className="w-10 text-muted-foreground">{s.studentNumber ? t("numberSuffix", { n: s.studentNumber }) : "-"}</span>
                    <span className="font-medium text-foreground">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resetPw">{t("newPassword")}</Label>
              <Input id="resetPw" type="text" value={newPassword} placeholder={t("resetPlaceholder")}
                onChange={(e) => setNewPassword(e.target.value)} />
              <div className="rounded-md border bg-muted/40 p-2.5 text-xs leading-5 text-muted-foreground space-y-0.5">
                <p>{t("resetRulePrefix")}<span className="font-mono">! @ # $ % ^ &amp; * ( ) _ +</span>{t("resetRuleSuffix")}</p>
                <p className="text-amber-600">{t("resetWarning")}</p>
              </div>
            </div>

            {msg && (
              <p
                role={msg.type === "success" ? "status" : "alert"}
                aria-live={msg.type === "success" ? "polite" : undefined}
                className={`text-sm ${msg.type === "success" ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}
              >
                {msg.text}
              </p>
            )}
            <div className="flex justify-end border-t pt-4">
              <Button
                onClick={handleReset}
                disabled={saving || checked.size === 0 || !newPassword}
                variant="gradient"
                className="h-11 w-full text-base font-semibold sm:flex-1"
              >
                {saving ? t("resetting") : checked.size === 0 ? t("resetBtnEmpty") : t("resetBtn", { count: checked.size })}
              </Button>
            </div>
          </>
        )}
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{t("resetCardDesc")}</p>
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("resetCardTitle")}</CardTitle>
        <CardDescription>{t("resetCardDesc")}</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

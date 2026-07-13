"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { validatePasswordPolicy } from "@/lib/password-policy";
import { buildTeacherClassLabel, resolveClassInputMode } from "@/lib/teacher";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { appQueryKeys } from "@/lib/app-queries";

interface BulkStudent {
  studentNumber: string;
  name: string;
}

interface TeacherClass {
  grade: string;
  className: string;
}

/** 학생 일괄 등록 폼 (교사 학생관리 '일괄 등록' 탭). 자체적으로 담당 학급 정보를 로드한다. */
export function StudentBulkRegisterCard() {
  const t = useTranslations("settings");
  const tAcc = useTranslations("account");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([]);
  const [bulkSchool, setBulkSchool] = useState("");
  const [bulkGrade, setBulkGrade] = useState("");
  const [bulkClass, setBulkClass] = useState("");
  const [bulkPassword, setBulkPassword] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  useEffect(() => {
    fetch("/api/teacher/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.teacherClasses) {
          setTeacherClasses(data.teacherClasses);
          if (data.school) setBulkSchool(data.school);
          if (data.teacherClasses.length === 1) {
            setBulkGrade(data.teacherClasses[0].grade);
            setBulkClass(data.teacherClasses[0].className);
          }
        }
      })
      .catch(() => {});
  }, []);

  const parseBulkText = (): BulkStudent[] => {
    return bulkText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[\t,\s]+/);
        if (parts.length >= 2) {
          return { studentNumber: parts[0], name: parts[1] };
        }
        return null;
      })
      .filter((s): s is BulkStudent => s !== null);
  };

  const handleBulkRegister = async () => {
    if (!bulkSchool || !bulkGrade || !bulkClass) {
      toast({ variant: "destructive", description: t("schoolGradeClassRequired") });
      return;
    }
    const passwordError = validatePasswordPolicy(bulkPassword);
    if (passwordError) {
      toast({ variant: "destructive", description: t("defaultPwError", { error: passwordError }) });
      return;
    }
    const students = parseBulkText();
    if (students.length === 0) {
      toast({ variant: "destructive", description: t("studentListRequired") });
      return;
    }

    setIsBulkSaving(true);
    try {
      const res = await fetch("/api/students/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school: bulkSchool,
          grade: bulkGrade,
          className: bulkClass,
          defaultPassword: bulkPassword,
          students,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", description: data.error || t("registerFailed") });
      } else {
        toast({ variant: "success", description: t("registerDone", { created: data.created, skipped: data.skipped, errors: data.errors?.length ? t("errorsSuffix", { count: data.errors.length }) : "" }) });
        void queryClient.invalidateQueries({ queryKey: appQueryKeys.teacherStudents });
        if (data.created > 0) setBulkText("");
      }
    } catch {
      toast({ variant: "destructive", description: t("serverError") });
    } finally {
      setIsBulkSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
            <p className="text-sm text-muted-foreground">{t("bulkDesc")}</p>
            {(() => {
              const mode = resolveClassInputMode(teacherClasses);
              return (
                <div className="space-y-3">
                  {/* 학교 */}
                  <div className="space-y-2">
                    <Label htmlFor="bulkSchool">{t("schoolLabel")}</Label>
                    <Input
                      id="bulkSchool"
                      placeholder={t("schoolPlaceholder")}
                      value={bulkSchool}
                      disabled={mode !== "manual"}
                      onChange={(e) => setBulkSchool(e.target.value)}
                    />
                  </div>

                  {/* 학년·반 — 모드별 분기 */}
                  {mode === "manual" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="bulkGrade">{t("gradeLabel")}</Label>
                        <Input id="bulkGrade" placeholder="3" value={bulkGrade} onChange={(e) => setBulkGrade(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bulkClass">{t("classLabel")}</Label>
                        <Input id="bulkClass" placeholder="2" value={bulkClass} onChange={(e) => setBulkClass(e.target.value)} />
                      </div>
                    </div>
                  )}

                  {mode === "auto" && (
                    <div className="space-y-2">
                      <Label>{t("gradeClassLabel")}</Label>
                      <Input value={buildTeacherClassLabel(bulkGrade, bulkClass)} disabled />
                    </div>
                  )}

                  {mode === "select" && (
                    <div className="space-y-2">
                      <Label htmlFor="bulkClassSelect">{t("gradeClassSelect")}</Label>
                      <Select
                        value={bulkGrade && bulkClass ? `${bulkGrade}-${bulkClass}` : ""}
                        onValueChange={(val) => {
                          const [g, c] = val.split("-");
                          setBulkGrade(g);
                          setBulkClass(c);
                        }}
                      >
                        <SelectTrigger id="bulkClassSelect">
                          <SelectValue placeholder={t("selectClassPlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          {teacherClasses.map((c) => (
                            <SelectItem key={`${c.grade}-${c.className}`} value={`${c.grade}-${c.className}`}>
                              {buildTeacherClassLabel(c.grade, c.className)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="space-y-2">
              <Label htmlFor="bulkPassword">{t("defaultPassword")}</Label>
              <Input
                id="bulkPassword"
                placeholder={t("pwPlaceholder")}
                value={bulkPassword}
                onChange={(e) => setBulkPassword(e.target.value)}
              />
              <div className="rounded-md border bg-muted/40 p-2.5 text-xs leading-5 text-muted-foreground space-y-0.5">
                <p>{t("pwHint")}</p>
                <p>{tAcc("resetRulePrefix")}<span className="font-mono">! @ # $ % ^ &amp; * ( ) _ +</span>{tAcc("resetRuleSuffix")}</p>
                <p className="text-amber-600">{t("pwWarning")}</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulkText">{t("studentList")}</Label>
              <textarea
                id="bulkText"
                className="w-full min-h-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder={t("bulkPlaceholder")}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("formatLabel")}<code className="bg-muted px-1 rounded">{t("formatCode")}</code>{t("formatHint")}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              {bulkText ? (
                <span className="text-sm text-muted-foreground">{t("enteredCount", { count: parseBulkText().length })}</span>
              ) : (
                <span />
              )}
              <Button
                onClick={handleBulkRegister}
                disabled={isBulkSaving || parseBulkText().length === 0}
                variant="gradient"
                className="h-11 w-full text-base font-semibold sm:flex-1"
              >
                {isBulkSaving ? t("registering") : t("bulkRegisterBtn", { count: parseBulkText().length })}
              </Button>
            </div>
      </CardContent>
    </Card>
  );
}

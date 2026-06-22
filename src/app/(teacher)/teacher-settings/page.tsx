"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PasswordChangeCard } from "@/components/shared/PasswordChangeCard";
import { StudentPasswordResetCard } from "@/components/teacher/StudentPasswordResetCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { useToast } from "@/components/ui/use-toast";
import { validatePasswordPolicy } from "@/lib/password-policy";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_GEMINI_MODEL, GEMINI_MODELS } from "@/lib/api-config";
import { buildTeacherClassLabel, resolveClassInputMode } from "@/lib/teacher";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useTranslations } from "next-intl";

interface BulkStudent {
  studentNumber: string;
  name: string;
}

interface TeacherClass {
  grade: string;
  className: string;
}

export default function TeacherSettingsPage() {
  const tPages = useTranslations("pages");
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const tAcc = useTranslations("account");
  const { data: session } = useSession();
  const { toast } = useToast();
  const user = session?.user as { name?: string; email?: string; school?: string };
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([]);

  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState(DEFAULT_GEMINI_MODEL);
  const [currentConfig, setCurrentConfig] = useState<{
    configured: boolean;
    maskedApiKey: string | null;
    model: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);


  // 일괄 학생 등록 상태
  const [bulkSchool, setBulkSchool] = useState("");
  const [bulkGrade, setBulkGrade] = useState("");
  const [bulkClass, setBulkClass] = useState("");
  const [bulkPassword, setBulkPassword] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setCurrentConfig(data);
        if (data.model) setSelectedModel(data.model);
      })
      .catch(() => {});

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

  const handleTest = async () => {
    if (!currentConfig?.configured && (!apiKey || apiKey.length < 10)) {
      toast({ variant: "destructive", description: t("apiKeyRequired") });
      return;
    }
    if (apiKey && apiKey.length < 10) {
      toast({ variant: "destructive", description: t("apiKeyMinLen") });
      return;
    }

    setIsTesting(true);

    try {
      const res = await fetch("/api/gemini/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, model: selectedModel }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ variant: "success", description: t("connectSuccess", { model: selectedModel }) });
      } else {
        // 콘솔에도 진단 정보 전체 출력
        console.error(`[gemini/test] HTTP ${res.status}`, data);
        const parts = [data.error || t("connectFailed")];
        if (data.action) parts.push(`→ ${data.action}`);
        if (data.detail) parts.push(`\n${t("detailReason")}${data.detail}`);
        toast({ variant: "destructive", description: parts.join("\n") });
      }
    } catch (e) {
      console.error("[gemini/test] network error", e);
      toast({ variant: "destructive", description: t("testRequestFailed") });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!currentConfig?.configured && (!apiKey || apiKey.length < 10)) {
      toast({ variant: "destructive", description: t("apiKeyRequired") });
      return;
    }
    if (apiKey && apiKey.length < 10) {
      toast({ variant: "destructive", description: t("apiKeyMinLen") });
      return;
    }

    setIsSaving(true);

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, model: selectedModel }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("saveFailed"));

      setCurrentConfig({
        configured: true,
        maskedApiKey: data.maskedApiKey ?? currentConfig?.maskedApiKey ?? null,
        model: data.model ?? selectedModel,
      });
      setApiKey("");
      toast({ variant: "success", description: t("aiSaved") });
    } catch (error) {
      toast({ variant: "destructive", description: error instanceof Error ? error.message : t("saveConfigFailed") });
    } finally {
      setIsSaving(false);
    }
  };

  const confirm = useConfirm();

  const handleDelete = async () => {
    if (!(await confirm({ description: t("deleteConfirm"), confirmText: tc("delete"), destructive: true }))) return;

    setIsDeleting(true);
    try {
      await fetch("/api/config", { method: "DELETE" });
      setCurrentConfig({ configured: false, maskedApiKey: null, model: DEFAULT_GEMINI_MODEL });
      setSelectedModel(DEFAULT_GEMINI_MODEL);
      toast({ variant: "success", description: t("aiDeleted") });
    } catch {
      toast({ variant: "destructive", description: t("deleteFailed") });
    } finally {
      setIsDeleting(false);
    }
  };

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
        if (data.created > 0) setBulkText("");
      }
    } catch {
      toast({ variant: "destructive", description: t("serverError") });
    } finally {
      setIsBulkSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader title={tPages("teacherSettings.title")} description={tPages("teacherSettings.description")} />

      <Card>
        <CardHeader>
          <CardTitle>{t("accountInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("name")}</Label>
              <Input value={user?.name || ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>{t("email")}</Label>
              <Input value={user?.email || ""} disabled />
            </div>
          </div>
          {user?.school && (
            <div className="space-y-2">
              <Label>{t("school")}</Label>
              <Input value={user.school} disabled />
            </div>
          )}
          <div className="space-y-2">
            <Label>{t("classInCharge")}</Label>
            {teacherClasses.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {teacherClasses.map((c) => (
                  <span
                    key={`${c.grade}-${c.className}`}
                    className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950/40 px-3 py-1 text-sm font-medium text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-200"
                  >
                    {buildTeacherClassLabel(c.grade, c.className)}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground pt-1">{t("noClassInfo")}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <PasswordChangeCard />

      {/* 학생 관리 — 일괄 등록 / 비밀번호 재설정 탭 */}
      <Card>
        <CardHeader>
          <CardTitle>{t("studentMgmt")}</CardTitle>
          <CardDescription>{t("studentMgmtDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="bulk">
            <TabsList>
              <TabsTrigger value="bulk">{t("tabBulk")}</TabsTrigger>
              <TabsTrigger value="reset">{t("tabReset")}</TabsTrigger>
            </TabsList>

            <TabsContent value="bulk" className="space-y-4">
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
                      <Input
                        id="bulkGrade"
                        placeholder="3"
                        value={bulkGrade}
                        onChange={(e) => setBulkGrade(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bulkClass">{t("classLabel")}</Label>
                      <Input
                        id="bulkClass"
                        placeholder="2"
                        value={bulkClass}
                        onChange={(e) => setBulkClass(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {mode === "auto" && (
                  <div className="space-y-2">
                    <Label>{t("gradeClassLabel")}</Label>
                    <Input
                      value={buildTeacherClassLabel(bulkGrade, bulkClass)}
                      disabled
                    />
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

          <div className="flex items-center gap-3">
            <Button onClick={handleBulkRegister} disabled={isBulkSaving}>
              {isBulkSaving ? t("registering") : t("bulkRegisterBtn", { count: parseBulkText().length })}
            </Button>
            {bulkText && (
              <span className="text-sm text-muted-foreground">{t("enteredCount", { count: parseBulkText().length })}</span>
            )}
          </div>
            </TabsContent>

            <TabsContent value="reset">
              <StudentPasswordResetCard embedded />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("geminiTitle")}</CardTitle>
          <CardDescription>
            {t.rich("geminiDescRich", { b: (c) => <b>{c}</b> })}
            <br />
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              {t("getApiKey")}
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentConfig?.configured && (
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-500/30 flex items-center justify-between">
              <div>
            <p className="text-sm font-medium text-green-800">{t("aiActive")}</p>
                <p className="text-xs text-green-600 mt-0.5">
                  {t("currentKeyModel", { key: currentConfig.maskedApiKey ?? "", model: currentConfig.model })}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                {isDeleting ? t("deleting") : tc("delete")}
              </Button>
            </div>
          )}

          {!currentConfig?.configured && (
            <div className="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-500/30">
              <p className="text-sm text-yellow-800">{t("noAiConfig")}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="apiKey">
              {currentConfig?.configured ? t("newApiKey") : t("apiKey")}
            </Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="AIza..."
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
              }}
            />
            {currentConfig?.configured && (
              <p className="text-xs text-muted-foreground">
                {t("keepKeyHint")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">{t("modelLabel")}</Label>
            <Select value={selectedModel} onValueChange={(v) => {
              setSelectedModel(v);
            }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GEMINI_MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={isTesting || (!currentConfig?.configured && (!apiKey || apiKey.length < 10)) || (!!apiKey && apiKey.length < 10)}
            >
              {isTesting ? t("testing") : t("connectionTest")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || (!currentConfig?.configured && (!apiKey || apiKey.length < 10)) || (!!apiKey && apiKey.length < 10)}
            >
              {isSaving ? t("saving") : tc("save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

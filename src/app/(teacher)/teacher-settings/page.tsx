"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PasswordChangeCard } from "@/components/shared/PasswordChangeCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { useToast } from "@/components/ui/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_GEMINI_MODEL, GEMINI_MODELS } from "@/lib/api-config";
import { buildTeacherClassLabel } from "@/lib/teacher";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useTranslations } from "next-intl";

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

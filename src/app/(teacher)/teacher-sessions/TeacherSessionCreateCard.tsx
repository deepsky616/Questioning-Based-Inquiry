"use client";

import type { Dispatch, SetStateAction } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DatePicker from "@/components/shared/DatePicker";
import { SessionTargetSelector } from "@/components/shared/SessionTargetSelector";
import type { SessionTargetClass, SessionTargetStudent } from "@/lib/session-targeting";
import type { TeacherSessionForm } from "./types";

interface TeacherSessionCreateCardProps {
  form: TeacherSessionForm;
  setForm: Dispatch<SetStateAction<TeacherSessionForm>>;
  isSaving: boolean;
  subjectOptions: string[];
  targetClasses: SessionTargetClass[];
  students: SessionTargetStudent[];
  onCreate: () => void;
}

export function TeacherSessionCreateCard({
  form,
  setForm,
  isSaving,
  subjectOptions,
  targetClasses,
  students,
  onCreate,
}: TeacherSessionCreateCardProps) {
  const t = useTranslations("sessions");
  const tSeq = useTranslations("sequencePanel");

  return (
    <Card aria-labelledby="quick-question-class-form-title">
      <CardHeader className="pb-3">
        <CardTitle id="quick-question-class-form-title" className="text-base">
          {t("newSession")}
        </CardTitle>
        <CardDescription>{t("newSessionDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_2fr] lg:grid-cols-[1fr_1fr_2fr]">
          <div className="space-y-1">
            <Label>{t("date")}</Label>
            <DatePicker
              value={form.date}
              onChange={(value) => setForm((prev) => ({ ...prev, date: value }))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sess-subject">{t("subject")}</Label>
            <Select
              value={form.subject}
              onValueChange={(value) => setForm((prev) => ({ ...prev, subject: value }))}
            >
              <SelectTrigger id="sess-subject">
                <SelectValue placeholder={t("selectSubject")} />
              </SelectTrigger>
              <SelectContent>
                {subjectOptions.map((subject) => (
                  <SelectItem key={subject} value={subject}>
                    {subject}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sess-topic">{t("topic")}</Label>
            <Input
              id="sess-topic"
              placeholder={t("topicPlaceholder")}
              value={form.topic}
              onChange={(event) => setForm((prev) => ({ ...prev, topic: event.target.value }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>{t("selectTargetsLabel")}</Label>
            <SessionTargetSelector
              classes={targetClasses}
              students={students}
              targetClassValue={form.targetClassValue}
              selectedStudentIds={form.selectedStudentIds}
              onTargetClassChange={(targetClassValue, selectedStudentIds) =>
                setForm((prev) => ({ ...prev, targetClassValue, selectedStudentIds }))
              }
              onSelectedStudentIdsChange={(selectedStudentIds) =>
                setForm((prev) => ({ ...prev, selectedStudentIds }))
              }
            />
          </div>

          <div className="space-y-2 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">{t("visibilitySettings")}</p>
            <div className="space-y-2">
              {([
                ["isActive", tSeq("activeLabel"), t("activeDesc"), form.isActive],
                ["defaultQuestionPublic", tSeq("publicLabel"), t("publicDesc"), form.defaultQuestionPublic],
                ["likesVisibleToPeers", tSeq("likesLabel"), t("likesDesc"), form.likesVisibleToPeers],
                ["commentsVisibleToPeers", tSeq("commentsLabel"), t("commentsDesc"), form.commentsVisibleToPeers],
              ] as const).map(([key, label, desc, value]) => (
                <div key={key} className="rounded-md border border-border bg-background p-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <Switch
                      checked={value}
                      onCheckedChange={(checked) => setForm((prev) => ({ ...prev, [key]: checked }))}
                    />
                  </div>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <Button
            onClick={onCreate}
            disabled={isSaving || !form.date || !form.subject.trim() || !form.topic.trim()}
            variant="gradient"
            className="h-11 w-full gap-1.5 text-base font-semibold"
          >
            <Plus className="h-5 w-5" />
            {isSaving ? t("saving") : t("addSession")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

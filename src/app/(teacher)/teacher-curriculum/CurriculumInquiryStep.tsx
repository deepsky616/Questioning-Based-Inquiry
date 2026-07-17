"use client";

import { BookOpenCheck, ChevronDown, ChevronUp, GripVertical, Loader2, Save, WandSparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import DatePicker from "@/components/shared/DatePicker";
import { SessionTargetSelector } from "@/components/shared/SessionTargetSelector";
import { SessionVisibilitySettings } from "@/components/shared/SessionVisibilitySettings";
import { StudentInquiryGuideEditor } from "@/components/shared/StudentInquiryGuideEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/datetime";
import type { SessionTargetClass, SessionTargetStudent } from "@/lib/session-targeting";
import type { CurriculumArea, InquiryQuestion } from "./types";

type LastDesignAction = { type: "saved" | "deployed"; at: string };

const TYPE_COLOR: Record<string, string> = {
  factual: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-300",
  conceptual: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-500/30 text-purple-800 dark:text-purple-300",
  controversial: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-500/30 text-orange-800 dark:text-orange-300",
};

interface CurriculumInquiryStepProps {
  visible: boolean;
  inquiryQuestions: InquiryQuestion[];
  selectedInquiryCount: number;
  dragInquiryIndex: number | null;
  inquiryAddType: InquiryQuestion["type"];
  saveDate: string;
  saveGrade: string;
  saveTitle: string;
  curriculumData: CurriculumArea | null;
  students: SessionTargetStudent[];
  targetClasses: SessionTargetClass[];
  targetClassValue: string;
  selectedStudentIds: string[];
  sessionIsActive: boolean;
  defaultQuestionPublic: boolean;
  sessionLikesVisible: boolean;
  sessionCommentsVisible: boolean;
  isSaving: boolean;
  isGeneratingGuides: boolean;
  canSaveDesign: boolean;
  lastDesignAction: LastDesignAction | null;
  onSetDragInquiryIndex: (index: number | null) => void;
  onDropInquiry: (index: number) => void;
  onMoveInquiry: (index: number, direction: -1 | 1) => void;
  onUpdateInquiry: (index: number, patch: Partial<InquiryQuestion>) => void;
  onRemoveInquiry: (index: number) => void;
  onInquiryAddTypeChange: (type: InquiryQuestion["type"]) => void;
  onAddInquiry: (type: InquiryQuestion["type"]) => void;
  onSaveDateChange: (value: string) => void;
  onSaveGradeChange: (value: string) => void;
  onSaveTitleChange: (value: string) => void;
  onTargetClassChange: (value: string, selectedIds: string[]) => void;
  onSelectedStudentIdsChange: (value: string[]) => void;
  onVisibilitySettingsChange: (next: {
    isActive: boolean;
    defaultQuestionPublic: boolean;
    likesVisibleToPeers: boolean;
    commentsVisibleToPeers: boolean;
  }) => void;
  onSaveAndCreateSession: () => void;
  onSaveOnly: () => void;
  onGenerateGuides: () => void;
}

export function CurriculumInquiryStep({
  visible,
  inquiryQuestions,
  selectedInquiryCount,
  dragInquiryIndex,
  inquiryAddType,
  saveDate,
  saveGrade,
  saveTitle,
  curriculumData,
  students,
  targetClasses,
  targetClassValue,
  selectedStudentIds,
  sessionIsActive,
  defaultQuestionPublic,
  sessionLikesVisible,
  sessionCommentsVisible,
  isSaving,
  isGeneratingGuides,
  canSaveDesign,
  lastDesignAction,
  onSetDragInquiryIndex,
  onDropInquiry,
  onMoveInquiry,
  onUpdateInquiry,
  onRemoveInquiry,
  onInquiryAddTypeChange,
  onAddInquiry,
  onSaveDateChange,
  onSaveGradeChange,
  onSaveTitleChange,
  onTargetClassChange,
  onSelectedStudentIdsChange,
  onVisibilitySettingsChange,
  onSaveAndCreateSession,
  onSaveOnly,
  onGenerateGuides,
}: CurriculumInquiryStepProps) {
  const t = useTranslations("curriculum");
  const tc = useTranslations("common");
  const tCls = useTranslations("classification");
  const typeLabel = (type: string) => `${tCls(`${type}.label`)}`;
  const hasStudentGuides = inquiryQuestions.some((question) => question.studentGuide);

  if (!visible) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("step5Title")}</CardTitle>
        <CardDescription>{t("step5Desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t("selectedCount", { count: selectedInquiryCount })}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onGenerateGuides}
            disabled={isGeneratingGuides || selectedInquiryCount === 0}
          >
            {isGeneratingGuides
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <WandSparkles className="mr-2 h-4 w-4" aria-hidden="true" />}
            {isGeneratingGuides
              ? t("studentGuideGenerating")
              : t(hasStudentGuides ? "studentGuideRegenerate" : "studentGuideGenerate")}
          </Button>
        </div>
        <div className="space-y-2">
          {inquiryQuestions.map((question, index) => (
            <div
              key={index}
              draggable
              onDragStart={() => onSetDragInquiryIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDropInquiry(index)}
              className={`rounded-lg border px-3 py-2.5 ${TYPE_COLOR[question.type] ?? "bg-card"}`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="flex shrink-0 items-center justify-between sm:mt-1 sm:flex-col">
                  <GripVertical className="hidden h-4 w-4 cursor-grab text-muted-foreground sm:block" />
                  <div className="flex sm:flex-col">
                    <button
                      type="button"
                      onClick={() => onMoveInquiry(index, -1)}
                      disabled={index === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label={t("moveUp")}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onMoveInquiry(index, 1)}
                      disabled={index === inquiryQuestions.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label={t("moveDown")}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <select
                  value={question.type}
                  onChange={(event) => onUpdateInquiry(index, { type: event.target.value as InquiryQuestion["type"] })}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground sm:w-auto sm:shrink-0"
                >
                  <option value="factual">{typeLabel("factual")}</option>
                  <option value="conceptual">{typeLabel("conceptual")}</option>
                  <option value="controversial">{typeLabel("controversial")}</option>
                </select>
                <textarea
                  className="w-full flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                  rows={2}
                  value={question.content}
                  onChange={(event) => onUpdateInquiry(index, { content: event.target.value })}
                />
                  <button
                    type="button"
                    onClick={() => onRemoveInquiry(index)}
                    className="self-end text-sm text-red-500 hover:text-red-700 sm:mt-1 sm:shrink-0 sm:self-auto"
                    aria-label={tc("delete")}
                  >
                    ✕
                  </button>
              </div>
              <div className="mt-2">
                <StudentInquiryGuideEditor
                  guide={question.studentGuide}
                  onChange={(studentGuide) => onUpdateInquiry(index, { studentGuide })}
                />
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <select
              value={inquiryAddType}
              onChange={(event) => onInquiryAddTypeChange(event.target.value as InquiryQuestion["type"])}
              className="h-9 shrink-0 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              aria-label={t("addQuestionType")}
            >
              <option value="factual">{typeLabel("factual")}</option>
              <option value="conceptual">{typeLabel("conceptual")}</option>
              <option value="controversial">{typeLabel("controversial")}</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => onAddInquiry(inquiryAddType)}>
              ＋ {t("addQuestion")}
            </Button>
          </div>
        </div>

        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">{t("saveInfo")}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.1fr_0.7fr_0.8fr_2.4fr]">
            <div className="space-y-1">
              <Label>{t("date")}</Label>
              <DatePicker value={saveDate} onChange={onSaveDateChange} placeholder={t("pickSessionDate")} />
            </div>
            <div className="space-y-1">
              <Label>{t("grade")}</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={saveGrade}
                onChange={(event) => onSaveGradeChange(event.target.value)}
              >
                <option value="">{t("selectGrade")}</option>
                {(curriculumData?.gradeRange.split("-") ?? []).map((grade) => (
                  <option key={grade} value={grade}>{t("gradeOption", { g: grade })}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{t("subject")}</Label>
              <Input value={curriculumData?.subject ?? ""} disabled className="bg-muted" />
            </div>
            <div className="space-y-1">
              <Label>{t("unitFieldLabel")}</Label>
              <Input
                placeholder={t("unitNamePlaceholder")}
                value={saveTitle}
                onChange={(event) => onSaveTitleChange(event.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>{t("selectTargetsLabel")}</Label>
              <SessionTargetSelector
                classes={targetClasses}
                students={students}
                targetClassValue={targetClassValue}
                selectedStudentIds={selectedStudentIds}
                onTargetClassChange={onTargetClassChange}
                onSelectedStudentIdsChange={onSelectedStudentIdsChange}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("visibilitySettingsLabel")}</Label>
              <SessionVisibilitySettings
                value={{
                  isActive: sessionIsActive,
                  defaultQuestionPublic,
                  likesVisibleToPeers: sessionLikesVisible,
                  commentsVisibleToPeers: sessionCommentsVisible,
                }}
                onChange={onVisibilitySettingsChange}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button
              onClick={onSaveAndCreateSession}
              disabled={isSaving || !canSaveDesign}
              variant="gradient"
              className="h-11 flex-1 text-base font-semibold"
            >
              <BookOpenCheck className="h-5 w-5" />
              {t("createInquiryQuestionClass")}
            </Button>
            <Button
              variant="outline"
              onClick={onSaveOnly}
              disabled={isSaving || !canSaveDesign}
              className="h-11 flex-1 text-base"
            >
              <Save className="h-5 w-5" />
              {t("saveOnly")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("addSessionHint")}</p>
          {lastDesignAction && (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
              {t(lastDesignAction.type === "saved" ? "lastSavedAt" : "lastDeployedAt", {
                time: formatDateTime(lastDesignAction.at),
              })}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

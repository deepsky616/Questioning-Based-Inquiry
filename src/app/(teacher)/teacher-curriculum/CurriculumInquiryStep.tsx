"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpenCheck, Save } from "lucide-react";
import { useTranslations } from "next-intl";

import DatePicker from "@/components/shared/DatePicker";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { SessionTargetSelector } from "@/components/shared/SessionTargetSelector";
import { SessionVisibilitySettings } from "@/components/shared/SessionVisibilitySettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/datetime";
import type { StudentInquiryGuide } from "@/lib/student-inquiry-guide";
import type { StudentLearningGuides } from "@/lib/student-learning-guide";
import type { Achievement } from "@/lib/achievement-selection";
import type { SessionTargetClass, SessionTargetStudent } from "@/lib/session-targeting";
import { InquiryDistributionReview } from "./InquiryDistributionReview";
import { InquiryQuestionEditor } from "./InquiryQuestionEditor";
import type { CurriculumArea, InquiryQuestion, LastDesignAction } from "./types";

interface CurriculumInquiryStepProps {
  visible: boolean;
  inquiryQuestions: InquiryQuestion[];
  coreIdea: string;
  achievements: Achievement[];
  coreSentences: string[];
  essentialQuestions: string[];
  learningGuides?: StudentLearningGuides;
  hasCurrentStudentGuides: boolean;
  hasFreshStudentGuides: boolean;
  hasIncompleteStudentGuides: boolean;
  hasStaleStudentGuides: boolean;
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
  isGeneratingInquiryQuestions: boolean;
  isGeneratingGuides: boolean;
  canRestoreStudentGuides: boolean;
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
  onSaveAndCreateSession: () => void | Promise<void>;
  onSaveOnly: () => void | Promise<void>;
  onGenerateGuides: () => void | Promise<void>;
  onRestoreGuides: () => void;
  onLearningGuidesChange: (value: StudentLearningGuides) => void;
}

export function CurriculumInquiryStep(props: CurriculumInquiryStepProps) {
  const {
    visible,
    inquiryQuestions,
    coreIdea,
    achievements,
    coreSentences,
    essentialQuestions,
    learningGuides,
    hasCurrentStudentGuides,
    hasFreshStudentGuides,
    hasIncompleteStudentGuides,
    hasStaleStudentGuides,
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
    isGeneratingInquiryQuestions,
    isGeneratingGuides,
    canRestoreStudentGuides,
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
    onRestoreGuides,
    onLearningGuidesChange,
  } = props;
  const t = useTranslations("curriculum");
  const confirm = useConfirm();
  const [isReviewing, setIsReviewing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible || isGeneratingInquiryQuestions) setIsReviewing(false);
  }, [isGeneratingInquiryQuestions, visible]);

  if (!visible) return null;

  const updateInquiryGuide = (index: number, guide: StudentInquiryGuide) => {
    onUpdateInquiry(index, { studentGuide: guide });
  };
  const showReview = () => {
    setIsReviewing(true);
    const scrollToCard = () => cardRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(scrollToCard);
    else scrollToCard();
  };
  const requestStudentGuideGeneration = async () => {
    if (hasCurrentStudentGuides) {
      const approved = await confirm({
        title: t("studentGuideRegenerateConfirmTitle"),
        description: t("studentGuideRegenerateConfirmDesc"),
        confirmText: t("studentGuideRegenerateConfirmAction"),
      });
      if (!approved) return;
    }
    await onGenerateGuides();
  };
  const confirmStudentGuideOmission = async () => {
    if (!(hasIncompleteStudentGuides || hasStaleStudentGuides)) return true;
    return confirm({
      title: t("studentGuideSaveWithoutTitle"),
      description: t("studentGuideSaveWithoutDesc"),
      confirmText: t("studentGuideSaveWithoutAction"),
    });
  };
  const requestSave = async (save: () => void | Promise<void>) => {
    if (!(await confirmStudentGuideOmission())) return;
    await save();
  };

  return (
    <Card ref={cardRef}>
      <CardHeader>
        <CardTitle className="text-base">
          {t(isReviewing ? "studentDistributionReviewTitle" : "step5Title")}
        </CardTitle>
        <CardDescription>
          {t(isReviewing ? "studentDistributionReviewDesc" : "step5Desc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!isReviewing ? (
          <InquiryQuestionEditor
            questions={inquiryQuestions}
            selectedCount={selectedInquiryCount}
            dragIndex={dragInquiryIndex}
            addType={inquiryAddType}
            onSetDragIndex={onSetDragInquiryIndex}
            onDrop={onDropInquiry}
            onMove={onMoveInquiry}
            onUpdate={onUpdateInquiry}
            onRemove={onRemoveInquiry}
            onAddTypeChange={onInquiryAddTypeChange}
            onAdd={onAddInquiry}
            onComplete={showReview}
          />
        ) : (
          <>
            <InquiryDistributionReview
              unitTitle={saveTitle}
              coreIdea={coreIdea}
              achievements={achievements}
              coreSentences={coreSentences}
              essentialQuestions={essentialQuestions}
              inquiryQuestions={inquiryQuestions}
              learningGuides={learningGuides}
              hasCurrentStudentGuides={hasCurrentStudentGuides}
              hasFreshStudentGuides={hasFreshStudentGuides}
              hasIncompleteStudentGuides={hasIncompleteStudentGuides}
              hasStaleStudentGuides={hasStaleStudentGuides}
              isGeneratingGuides={isGeneratingGuides}
              canRestoreStudentGuides={canRestoreStudentGuides}
              onGenerateGuides={requestStudentGuideGeneration}
              onRestoreGuides={onRestoreGuides}
              onLearningGuidesChange={onLearningGuidesChange}
              onInquiryGuideChange={updateInquiryGuide}
              onBackToEdit={() => setIsReviewing(false)}
            />

            <div className="space-y-3 border-t pt-5">
              <p className="text-sm font-semibold text-foreground">{t("saveInfo")}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.1fr_0.7fr_0.8fr_2.4fr]">
                <div className="space-y-1">
                  <Label>{t("date")}</Label>
                  <DatePicker value={saveDate} onChange={onSaveDateChange} placeholder={t("pickSessionDate")} />
                </div>
                <div className="space-y-1">
                  <Label>{t("grade")}</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
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
                  onClick={() => requestSave(onSaveAndCreateSession)}
                  disabled={isSaving || isGeneratingGuides || !canSaveDesign}
                  variant="gradient"
                  className="h-11 flex-1 text-base font-semibold"
                >
                  <BookOpenCheck className="h-5 w-5" aria-hidden="true" />
                  {t("createInquiryQuestionClass")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => requestSave(onSaveOnly)}
                  disabled={isSaving || isGeneratingGuides || !canSaveDesign}
                  className="h-11 flex-1 text-base"
                >
                  <Save className="h-5 w-5" aria-hidden="true" />
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
          </>
        )}
      </CardContent>
    </Card>
  );
}

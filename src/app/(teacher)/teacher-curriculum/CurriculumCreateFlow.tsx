"use client";

import type { Dispatch, SetStateAction } from "react";

import type { Achievement } from "@/lib/achievement-selection";
import type { SessionTargetClass, SessionTargetStudent } from "@/lib/session-targeting";
import { selectAllIndices, toggleSelectedIndex } from "@/lib/inquiry-design-selection";
import { CurriculumInquiryStep } from "./CurriculumInquiryStep";
import { CurriculumKeywordStep } from "./CurriculumKeywordStep";
import { CurriculumSelectableTextStep } from "./CurriculumSelectableTextStep";
import { CurriculumStepProgress, type CurriculumStep } from "./CurriculumStepProgress";
import { Step1CurriculumExplorer } from "./Step1CurriculumExplorer";
import type { CurriculumArea, InquiryQuestion } from "./types";
import type { StudentLearningGuides } from "@/lib/student-learning-guide";

type LastDesignAction = { type: "saved" | "deployed"; at: string };

interface CurriculumCreateFlowProps {
  step: CurriculumStep;
  stepLabel: (step: CurriculumStep) => string;
  selGrade: string;
  setSelGrade: (value: string) => void;
  selSubject: string;
  setSelSubject: (value: string) => void;
  selAreaId: string;
  setSelAreaId: (value: string) => void;
  areas: { id: string; area: string }[];
  curriculumData: CurriculumArea | null;
  loadingCurriculum: boolean;
  loadAreaData: () => void;
  unitNameInput: string;
  setUnitNameInput: (value: string) => void;
  unitMatches: { unitCode: string; unitName: string }[];
  recommendUnit: (unitCode: string) => void;
  recommendByUnitName: () => void;
  isRecommending: boolean;
  recommendMessage: string;
  selectedUnitCodes: string[];
  setSelectedUnitCodes: Dispatch<SetStateAction<string[]>>;
  selectedAchievementCodes: string[];
  setSelectedAchievementCodes: Dispatch<SetStateAction<string[]>>;
  selectedCoreIdeaLines: string[];
  setSelectedCoreIdeaLines: Dispatch<SetStateAction<string[]>>;
  selectedKnowledge: string[];
  setSelectedKnowledge: Dispatch<SetStateAction<string[]>>;
  selectedProcess: string[];
  setSelectedProcess: Dispatch<SetStateAction<string[]>>;
  selectedValue: string[];
  setSelectedValue: Dispatch<SetStateAction<string[]>>;
  getFilteredAchievements: () => Achievement[];
  getSelectedAchievements: () => Achievement[];
  getFilteredAchievementGroups: () => { name: string; achievements: Achievement[] }[];
  handleGoStep2: () => void;
  loadingKeywords: boolean;
  recommendedKeywords: string[];
  selectedKeywords: string[];
  customKeyword: string;
  loadingSentences: boolean;
  toggleKeyword: (keyword: string) => void;
  setCustomKeyword: (value: string) => void;
  addCustomKeyword: () => void;
  handleGoStep3: () => void;
  selectedCoreSentences: string[];
  coreSentences: string[];
  selectedCoreSentenceIndices: number[];
  setSelectedCoreSentenceIndices: Dispatch<SetStateAction<number[]>>;
  setCoreSentences: Dispatch<SetStateAction<string[]>>;
  loadingQuestions: boolean;
  handleGoStep4: () => void;
  selectedEssentialQuestions: string[];
  essentialQuestions: string[];
  selectedEssentialQuestionIndices: number[];
  setSelectedEssentialQuestionIndices: Dispatch<SetStateAction<number[]>>;
  setEssentialQuestions: Dispatch<SetStateAction<string[]>>;
  loadingInquiry: boolean;
  handleGoStep5: () => void;
  loadingStudentGuides: boolean;
  handleGenerateStudentGuides: () => void;
  learningGuides?: StudentLearningGuides;
  setLearningGuides: (value: StudentLearningGuides) => void;
  inquiryQuestions: InquiryQuestion[];
  selectedInquiryCount: number;
  dragInquiryIndex: number | null;
  inquiryAddType: InquiryQuestion["type"];
  saveDate: string;
  saveGrade: string;
  saveTitle: string;
  students: SessionTargetStudent[];
  targetClasses: SessionTargetClass[];
  targetClassValue: string;
  selectedStudentIds: string[];
  sessionIsActive: boolean;
  defaultQuestionPublic: boolean;
  sessionLikesVisible: boolean;
  sessionCommentsVisible: boolean;
  isSaving: boolean;
  canSaveDesign: boolean;
  lastDesignAction: LastDesignAction | null;
  setDragInquiryIndex: (index: number | null) => void;
  handleInquiryDrop: (index: number) => void;
  moveInquiry: (index: number, direction: -1 | 1) => void;
  updateInquiry: (index: number, patch: Partial<InquiryQuestion>) => void;
  removeInquiry: (index: number) => void;
  setInquiryAddType: (type: InquiryQuestion["type"]) => void;
  addInquiry: (type: InquiryQuestion["type"]) => void;
  setSaveDate: (value: string) => void;
  setSaveGrade: (value: string) => void;
  setSaveTitle: (value: string) => void;
  setTargetClassValue: (value: string) => void;
  setSelectedStudentIds: Dispatch<SetStateAction<string[]>>;
  setSessionIsActive: (value: boolean) => void;
  setDefaultQuestionPublic: (value: boolean) => void;
  setSessionLikesVisible: (value: boolean) => void;
  setSessionCommentsVisible: (value: boolean) => void;
  handleSaveAndCreateSession: () => void;
  handleSave: () => void;
}

export function CurriculumCreateFlow({
  step,
  stepLabel,
  selGrade,
  setSelGrade,
  selSubject,
  setSelSubject,
  selAreaId,
  setSelAreaId,
  areas,
  curriculumData,
  loadingCurriculum,
  loadAreaData,
  unitNameInput,
  setUnitNameInput,
  unitMatches,
  recommendUnit,
  recommendByUnitName,
  isRecommending,
  recommendMessage,
  selectedUnitCodes,
  setSelectedUnitCodes,
  selectedAchievementCodes,
  setSelectedAchievementCodes,
  selectedCoreIdeaLines,
  setSelectedCoreIdeaLines,
  selectedKnowledge,
  setSelectedKnowledge,
  selectedProcess,
  setSelectedProcess,
  selectedValue,
  setSelectedValue,
  getFilteredAchievements,
  getSelectedAchievements,
  getFilteredAchievementGroups,
  handleGoStep2,
  loadingKeywords,
  recommendedKeywords,
  selectedKeywords,
  customKeyword,
  loadingSentences,
  toggleKeyword,
  setCustomKeyword,
  addCustomKeyword,
  handleGoStep3,
  selectedCoreSentences,
  coreSentences,
  selectedCoreSentenceIndices,
  setSelectedCoreSentenceIndices,
  setCoreSentences,
  loadingQuestions,
  handleGoStep4,
  selectedEssentialQuestions,
  essentialQuestions,
  selectedEssentialQuestionIndices,
  setSelectedEssentialQuestionIndices,
  setEssentialQuestions,
  loadingInquiry,
  handleGoStep5,
  loadingStudentGuides,
  handleGenerateStudentGuides,
  learningGuides,
  setLearningGuides,
  inquiryQuestions,
  selectedInquiryCount,
  dragInquiryIndex,
  inquiryAddType,
  saveDate,
  saveGrade,
  saveTitle,
  students,
  targetClasses,
  targetClassValue,
  selectedStudentIds,
  sessionIsActive,
  defaultQuestionPublic,
  sessionLikesVisible,
  sessionCommentsVisible,
  isSaving,
  canSaveDesign,
  lastDesignAction,
  setDragInquiryIndex,
  handleInquiryDrop,
  moveInquiry,
  updateInquiry,
  removeInquiry,
  setInquiryAddType,
  addInquiry,
  setSaveDate,
  setSaveGrade,
  setSaveTitle,
  setTargetClassValue,
  setSelectedStudentIds,
  setSessionIsActive,
  setDefaultQuestionPublic,
  setSessionLikesVisible,
  setSessionCommentsVisible,
  handleSaveAndCreateSession,
  handleSave,
}: CurriculumCreateFlowProps) {
  return (
    <>
      <CurriculumStepProgress step={step} getLabel={stepLabel} />

      <Step1CurriculumExplorer
        selGrade={selGrade}
        setSelGrade={setSelGrade}
        selSubject={selSubject}
        setSelSubject={setSelSubject}
        selAreaId={selAreaId}
        setSelAreaId={setSelAreaId}
        areas={areas}
        curriculumData={curriculumData}
        loadingCurriculum={loadingCurriculum}
        loadAreaData={loadAreaData}
        unitNameInput={unitNameInput}
        setUnitNameInput={setUnitNameInput}
        unitMatches={unitMatches}
        recommendUnit={recommendUnit}
        recommendByUnitName={recommendByUnitName}
        isRecommending={isRecommending}
        recommendMessage={recommendMessage}
        selectedUnitCodes={selectedUnitCodes}
        setSelectedUnitCodes={setSelectedUnitCodes}
        selectedAchievementCodes={selectedAchievementCodes}
        setSelectedAchievementCodes={setSelectedAchievementCodes}
        selectedCoreIdeaLines={selectedCoreIdeaLines}
        setSelectedCoreIdeaLines={setSelectedCoreIdeaLines}
        selectedKnowledge={selectedKnowledge}
        setSelectedKnowledge={setSelectedKnowledge}
        selectedProcess={selectedProcess}
        setSelectedProcess={setSelectedProcess}
        selectedValue={selectedValue}
        setSelectedValue={setSelectedValue}
        getFilteredAchievements={getFilteredAchievements}
        getSelectedAchievements={getSelectedAchievements}
        getFilteredAchievementGroups={getFilteredAchievementGroups}
        handleGoStep2={handleGoStep2}
        loadingKeywords={loadingKeywords}
      />

      <CurriculumKeywordStep
        visible={step >= 2}
        recommendedKeywords={recommendedKeywords}
        selectedKeywords={selectedKeywords}
        customKeyword={customKeyword}
        loadingSentences={loadingSentences}
        onToggleKeyword={toggleKeyword}
        onCustomKeywordChange={setCustomKeyword}
        onAddCustomKeyword={addCustomKeyword}
        onGoNext={handleGoStep3}
      />

      <CurriculumSelectableTextStep
        visible={step >= 3}
        titleKey="step3Title"
        descriptionKey="step3Desc"
        selectedCount={selectedCoreSentences.length}
        items={coreSentences}
        selectedIndices={selectedCoreSentenceIndices}
        itemPrefix="number"
        selectAriaKey="selectSentenceAria"
        loading={loadingQuestions}
        loadingLabelKey="loadingQuestions"
        nextLabelKey="nextQuestions"
        loadingKind="unitDesignQuestions"
        onSelectAll={() => setSelectedCoreSentenceIndices(selectAllIndices(coreSentences))}
        onDeselectAll={() => setSelectedCoreSentenceIndices([])}
        onToggle={(index) => setSelectedCoreSentenceIndices((prev) => toggleSelectedIndex(prev, index))}
        onItemChange={(index, value) => {
          const next = [...coreSentences];
          next[index] = value;
          setCoreSentences(next);
        }}
        onGoNext={handleGoStep4}
      />

      <CurriculumSelectableTextStep
        visible={step >= 4}
        titleKey="step4Title"
        descriptionKey="step4Desc"
        selectedCount={selectedEssentialQuestions.length}
        items={essentialQuestions}
        selectedIndices={selectedEssentialQuestionIndices}
        itemPrefix="question"
        selectAriaKey="selectQuestionAria"
        loading={loadingInquiry}
        loadingLabelKey="loadingInquiry"
        nextLabelKey="nextInquiry"
        loadingKind="unitDesignInquiry"
        onSelectAll={() => setSelectedEssentialQuestionIndices(selectAllIndices(essentialQuestions))}
        onDeselectAll={() => setSelectedEssentialQuestionIndices([])}
        onToggle={(index) => setSelectedEssentialQuestionIndices((prev) => toggleSelectedIndex(prev, index))}
        onItemChange={(index, value) => {
          const next = [...essentialQuestions];
          next[index] = value;
          setEssentialQuestions(next);
        }}
        onGoNext={handleGoStep5}
      />

      <CurriculumInquiryStep
        visible={step >= 5}
        inquiryQuestions={inquiryQuestions}
        coreSentences={selectedCoreSentences}
        essentialQuestions={selectedEssentialQuestions}
        learningGuides={learningGuides}
        selectedInquiryCount={selectedInquiryCount}
        dragInquiryIndex={dragInquiryIndex}
        inquiryAddType={inquiryAddType}
        saveDate={saveDate}
        saveGrade={saveGrade}
        saveTitle={saveTitle}
        curriculumData={curriculumData}
        students={students}
        targetClasses={targetClasses}
        targetClassValue={targetClassValue}
        selectedStudentIds={selectedStudentIds}
        sessionIsActive={sessionIsActive}
        defaultQuestionPublic={defaultQuestionPublic}
        sessionLikesVisible={sessionLikesVisible}
        sessionCommentsVisible={sessionCommentsVisible}
        isSaving={isSaving}
        isGeneratingGuides={loadingStudentGuides}
        canSaveDesign={canSaveDesign}
        lastDesignAction={lastDesignAction}
        onSetDragInquiryIndex={setDragInquiryIndex}
        onDropInquiry={handleInquiryDrop}
        onMoveInquiry={moveInquiry}
        onUpdateInquiry={updateInquiry}
        onRemoveInquiry={removeInquiry}
        onInquiryAddTypeChange={setInquiryAddType}
        onAddInquiry={addInquiry}
        onSaveDateChange={setSaveDate}
        onSaveGradeChange={setSaveGrade}
        onSaveTitleChange={setSaveTitle}
        onTargetClassChange={(value, ids) => {
          setTargetClassValue(value);
          setSelectedStudentIds(ids);
        }}
        onSelectedStudentIdsChange={setSelectedStudentIds}
        onVisibilitySettingsChange={(next) => {
          setSessionIsActive(next.isActive);
          setDefaultQuestionPublic(next.defaultQuestionPublic);
          setSessionLikesVisible(next.likesVisibleToPeers);
          setSessionCommentsVisible(next.commentsVisibleToPeers);
        }}
        onSaveAndCreateSession={handleSaveAndCreateSession}
        onSaveOnly={handleSave}
        onGenerateGuides={handleGenerateStudentGuides}
        onLearningGuidesChange={setLearningGuides}
      />
    </>
  );
}

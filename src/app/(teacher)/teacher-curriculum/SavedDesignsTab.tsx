"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { BookOpenCheck, ChevronDown, ChevronUp, GripVertical, Loader2, Pencil, RotateCcw, Save, Trash2, WandSparkles, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DatePicker from "@/components/shared/DatePicker";
import { SessionVisibilitySettings } from "@/components/shared/SessionVisibilitySettings";
import { SessionTargetSelector } from "@/components/shared/SessionTargetSelector";
import { DesignReferenceView } from "@/components/shared/DesignReferenceView";
import { StudentInquiryGuideEditor } from "@/components/shared/StudentInquiryGuideEditor";
import { StudentLearningGuideEditor } from "@/components/shared/StudentLearningGuideEditor";
import { EmptyState } from "@/components/shared/EmptyState";
import { CollapseChevron } from "@/components/shared/SectionToggle";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { filterSortSavedDesigns } from "@/lib/saved-designs";
import { getSavedDesignTimeline, type SavedDesignTimelineKind } from "@/lib/saved-design-timeline";
import { groupSessionDatesByMonth } from "@/lib/sessions";
import { formatDateTime } from "@/lib/datetime";
import { normalizeStudentInquiryGuide, type StudentInquiryGuide } from "@/lib/student-inquiry-guide";
import { validateStudentGuideBundle } from "@/lib/student-guide-completeness";
import { buildStudentGuideSourceSignature } from "@/lib/student-guide-source";
import {
  normalizeStudentLearningGuides,
  remapStudentLearningGuides,
  removeIndexedStudentLearningGuide,
  type StudentLearningGuides,
} from "@/lib/student-learning-guide";
import { appQueryKeys } from "@/lib/app-queries";
import {
  postQuestionClassFromDesign,
  runSavedDesignQuestionClassCreation,
} from "@/lib/question-class-creation";
import {
  buildClassStudentTargetPayload,
  defaultTargetSelection,
  type SessionTargetClass,
  type SessionTargetStudent,
} from "@/lib/session-targeting";
import { todayStr, type InquiryQuestion, type SavedInquiryDesign } from "./types";

interface SavedDesignsTabProps {
  savedList: SavedInquiryDesign[];
  /** 삭제, 수정, 새 수업 생성 뒤 저장 목록을 최신화한다. */
  onChanged: () => void | Promise<unknown>;
  students: SessionTargetStudent[];
  targetClasses: SessionTargetClass[];
}

interface EditStudentGuideSnapshot {
  sourceSignature: string;
  learningGuides?: StudentLearningGuides;
  inquiryGuides: Array<StudentInquiryGuide | undefined>;
}

/**
 * 저장된 탐구질문 탭.
 * 조회(날짜·학년·교과·영역·단원)·정렬, 항목별 접기, 참고자료 미리보기,
 * 인라인 편집(제목·날짜·공개설정·배포대상·핵심아이디어·문장·질문)과
 * 저장, 새 수업 만들기, 삭제를 자체 상태로 처리한다.
 */
export function SavedDesignsTab({ savedList, onChanged, students, targetClasses }: SavedDesignsTabProps) {
  const t = useTranslations("curriculum");
  const tc = useTranslations("common");
  const tCls = useTranslations("classification");
  const tSess = useTranslations("sessions");
  const confirm = useConfirm();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const typeLabel = (type: string) => `${tCls(`${type}.label`)}`;
  const isAfter = (a?: string | null, b?: string | null) => {
    if (!a || !b) return false;
    const left = new Date(a).getTime();
    const right = new Date(b).getTime();
    if (Number.isNaN(left) || Number.isNaN(right)) return false;
    return left > right + 1000;
  };
  const getDesignStatus = (design: SavedInquiryDesign) => {
    if (!design.lastDeployedAt) {
      return {
        label: t("statusNotDeployed"),
        className: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
      };
    }
    if (isAfter(design.updatedAt, design.lastDeployedAt)) {
      return {
        label: t("statusNeedsRedeploy"),
        className: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-950/30 dark:text-orange-200",
      };
    }
    return {
      label: t("statusDeployed"),
      className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-200",
    };
  };
  const needsNewQuestionClass = (design: SavedInquiryDesign) =>
    Boolean(design.lastDeployedAt) && isAfter(design.updatedAt, design.lastDeployedAt);
  const timelineLabelKey: Record<SavedDesignTimelineKind, "savedPrimarySavedAt" | "savedPrimaryUpdatedAt" | "savedPrimaryDeployedAt"> = {
    saved: "savedPrimarySavedAt",
    updated: "savedPrimaryUpdatedAt",
    deployed: "savedPrimaryDeployedAt",
  };
  const historyLabelKey: Record<SavedDesignTimelineKind, "savedCreatedAt" | "savedUpdatedAt" | "savedDeployedAt"> = {
    saved: "savedCreatedAt",
    updated: "savedUpdatedAt",
    deployed: "savedDeployedAt",
  };

  // 항목 접기(참고자료 미리보기) — 기본 접힘
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);
  // 저장 목록 조회(필터)·정렬
  const [savedFilterDate, setSavedFilterDate] = useState("");
  const [savedFilterGrade, setSavedFilterGrade] = useState("");
  const [savedFilterSubject, setSavedFilterSubject] = useState("");
  const [savedFilterArea, setSavedFilterArea] = useState("");
  const [savedFilterUnit, setSavedFilterUnit] = useState("");
  const [savedSort, setSavedSort] = useState<"desc" | "asc">("desc");
  // 편집 상태(저장 설계 제목·질문 인라인 수정)
  const [editingDesignId, setEditingDesignId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editVisibility, setEditVisibility] = useState({
    isActive: true,
    defaultQuestionPublic: true,
    likesVisibleToPeers: true,
    commentsVisibleToPeers: true,
  });
  const [editTargetClassValue, setEditTargetClassValue] = useState("all");
  const [editSelectedStudentIds, setEditSelectedStudentIds] = useState<string[]>([]);
  const [editCoreIdea, setEditCoreIdea] = useState("");
  const [editCoreSentences, setEditCoreSentences] = useState<string[]>([]);
  const [editEssentialQuestions, setEditEssentialQuestions] = useState<string[]>([]);
  const [editQuestions, setEditQuestions] = useState<InquiryQuestion[]>([]);
  const [editLearningGuides, setEditLearningGuides] = useState<StudentLearningGuides | undefined>();
  const [generatedEditGuideSourceSignature, setGeneratedEditGuideSourceSignature] = useState<string | null>(null);
  const [previousEditStudentGuides, setPreviousEditStudentGuides] = useState<EditStudentGuideSnapshot | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [generatingGuides, setGeneratingGuides] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [addType, setAddType] = useState<InquiryQuestion["type"]>("factual");

  const editingDesign = savedList.find((design) => design.id === editingDesignId);
  const editGuideSourceSignature = buildStudentGuideSourceSignature({
    coreIdea: editCoreIdea,
    selectedKeywords: editingDesign?.selectedKeywords ?? [],
    coreSentences: editCoreSentences,
    essentialQuestions: editEssentialQuestions,
    inquiryQuestions: editQuestions,
  });
  const latestEditGuideSourceSignatureRef = useRef(editGuideSourceSignature);
  const latestEditLearningGuidesRef = useRef(editLearningGuides);
  const latestEditQuestionsRef = useRef(editQuestions);
  useEffect(() => {
    latestEditGuideSourceSignatureRef.current = editGuideSourceSignature;
    latestEditLearningGuidesRef.current = editLearningGuides;
    latestEditQuestionsRef.current = editQuestions;
  }, [editGuideSourceSignature, editLearningGuides, editQuestions]);
  const editInquiryQuestions = editQuestions.filter((question) => question.content.trim());
  const editGuideBundle = validateStudentGuideBundle({
    learningGuides: editLearningGuides,
    guides: editInquiryQuestions.flatMap((question, index) => question.studentGuide
      ? [{ ...question.studentGuide, index }]
      : []),
  }, {
    coreSentenceCount: editCoreSentences.length,
    essentialQuestionCount: editEssentialQuestions.length,
    inquiryQuestionCount: editInquiryQuestions.length,
  });
  const hasEditStudentGuides = Boolean(editLearningGuides)
    || editQuestions.some((question) => question.studentGuide);
  const hasCurrentEditStudentGuides = hasEditStudentGuides
    && generatedEditGuideSourceSignature === editGuideSourceSignature;
  const hasFreshEditStudentGuides = hasCurrentEditStudentGuides && editGuideBundle.ok;
  const hasIncompleteEditStudentGuides = hasCurrentEditStudentGuides && !editGuideBundle.ok;
  const hasStaleEditStudentGuides = hasEditStudentGuides
    && generatedEditGuideSourceSignature !== null
    && generatedEditGuideSourceSignature !== editGuideSourceSignature;
  const canRestoreEditStudentGuides = previousEditStudentGuides?.sourceSignature === editGuideSourceSignature;

  // 조회(필터) 옵션 + 필터/정렬 적용
  const uniq = (vals: (string | null | undefined)[]) =>
    Array.from(new Set(vals.filter((v): v is string => Boolean(v)))).sort((a, b) => a.localeCompare(b, "ko"));
  const savedFilterOptions = {
    dates: uniq(savedList.map((d) => d.sessionDate)),
    grades: uniq(savedList.map((d) => d.grade)),
    subjects: uniq(savedList.map((d) => d.subject)),
    areas: uniq(savedList.map((d) => d.area)),
    units: uniq(savedList.map((d) => d.title)),
  };
  const savedDateMonthGroups = groupSessionDatesByMonth(savedFilterOptions.dates);
  const hasSavedFilter = Boolean(savedFilterDate || savedFilterGrade || savedFilterSubject || savedFilterArea || savedFilterUnit);
  const visibleSaved = filterSortSavedDesigns(
    savedList,
    { date: savedFilterDate, grade: savedFilterGrade, subject: savedFilterSubject, area: savedFilterArea, unit: savedFilterUnit },
    savedSort,
  );

  const handleSelectSavedDesign = (design: SavedInquiryDesign) => {
    setSelectedSavedId((prev) => (prev === design.id ? null : design.id));
  };

  const handleDelete = async (id: string) => {
    const linked = savedList.find((x) => x.id === id)?.sessionCount ?? 0;
    // 연결된 수업세션이 있으면 참고자료가 사라짐을 경고
    const description = linked > 0 ? t("deleteConfirmLinked", { count: linked }) : t("deleteConfirm");
    if (!(await confirm({ description, confirmText: tc("delete"), destructive: true }))) return;
    await fetch(`/api/unit-design/${id}`, { method: "DELETE" });
    if (selectedSavedId === id) setSelectedSavedId(null);
    onChanged();
  };

  // ── 저장 설계 인라인 편집(제목·질문 수정/추가/삭제) ──────────────────
  const startEditDesign = (design: SavedInquiryDesign) => {
    setEditingDesignId(design.id);
    setEditTitle(design.title);
    setEditDate(design.sessionDate || todayStr());
    setEditVisibility({
      isActive: design.isActive ?? true,
      defaultQuestionPublic: design.defaultQuestionPublic ?? true,
      likesVisibleToPeers: design.likesVisibleToPeers ?? true,
      commentsVisibleToPeers: design.commentsVisibleToPeers ?? true,
    });
    // 저장된 대상이 구체적이면 그대로 복원, '전체'면 기본값 정책(단일 학급 → 그 학급 전체 학생) 적용
    if ((design.targetClassValue ?? "all") === "all") {
      const defaults = defaultTargetSelection(students, targetClasses);
      setEditTargetClassValue(defaults.targetClassValue);
      setEditSelectedStudentIds(defaults.selectedStudentIds);
    } else {
      setEditTargetClassValue(design.targetClassValue!);
      setEditSelectedStudentIds([...(design.targetStudentIds ?? [])]);
    }
    setEditCoreIdea(design.coreIdea ?? "");
    setEditCoreSentences([...(design.coreSentences ?? [])]);
    setEditEssentialQuestions([...(design.essentialQuestions ?? [])]);
    const nextLearningGuides = normalizeStudentLearningGuides(design.learningGuides);
    const nextQuestions = design.inquiryQuestions.map((q) => ({ ...q }));
    setEditLearningGuides(nextLearningGuides);
    setEditQuestions(nextQuestions);
    const hasGuides = Boolean(nextLearningGuides) || nextQuestions.some((question) => question.studentGuide);
    setGeneratedEditGuideSourceSignature(hasGuides ? buildStudentGuideSourceSignature({
      coreIdea: design.coreIdea ?? "",
      selectedKeywords: design.selectedKeywords ?? [],
      coreSentences: design.coreSentences ?? [],
      essentialQuestions: design.essentialQuestions ?? [],
      inquiryQuestions: nextQuestions,
    }) : null);
    setPreviousEditStudentGuides(null);
  };
  const cancelEditDesign = () => {
    setEditingDesignId(null);
    setEditTitle("");
    setEditCoreIdea("");
    setEditCoreSentences([]);
    setEditEssentialQuestions([]);
    setEditLearningGuides(undefined);
    setGeneratedEditGuideSourceSignature(null);
    setPreviousEditStudentGuides(null);
    setEditQuestions([]);
  };
  // 핵심문장·핵심질문(문자열 리스트) 공통 편집 헬퍼
  const updateTextItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
    value: string,
  ) => setter((prev) => prev.map((v, i) => (i === index ? value : v)));
  const removeTextItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
  ) => setter((prev) => prev.filter((_, i) => i !== index));
  const addTextItem = (setter: React.Dispatch<React.SetStateAction<string[]>>) =>
    setter((prev) => [...prev, ""]);
  const removeLearningTextItem = (
    kind: "coreSentences" | "essentialQuestions",
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
  ) => {
    removeTextItem(setter, index);
    setEditLearningGuides((previous) => removeIndexedStudentLearningGuide(previous, kind, index));
  };
  const updateEditQuestion = (index: number, patch: Partial<InquiryQuestion>) => {
    setEditQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };
  const removeEditQuestion = (index: number) => {
    setEditQuestions((prev) => prev.filter((_, i) => i !== index));
  };
  const addEditQuestion = (type: InquiryQuestion["type"]) => {
    setEditQuestions((prev) => [...prev, { type, content: "" }]);
  };
  // 위/아래 이동(터치·키보드 등 모든 기기 지원). dir: -1 위, +1 아래
  const moveEditQuestion = (index: number, dir: -1 | 1) => {
    setEditQuestions((prev) => {
      const to = index + dir;
      if (to < 0 || to >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[to]] = [copy[to], copy[index]];
      return copy;
    });
  };
  // 드래그앤드롭 순서 변경
  const handleEditDrop = (targetIndex: number) => {
    setEditQuestions((prev) => {
      if (dragIndex === null || dragIndex === targetIndex || dragIndex < 0 || dragIndex >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(dragIndex, 1);
      copy.splice(targetIndex, 0, moved);
      return copy;
    });
    setDragIndex(null);
  };
  // 편집 내용을 설계에 PATCH(제목·수업날짜·공개설정·참고자료 전부)
  const patchEditDesign = async (id: string) => {
    const cleaned = editQuestions
      .map((q) => {
        const studentGuide = hasFreshEditStudentGuides
          ? normalizeStudentInquiryGuide(q.studentGuide)
          : undefined;
        return {
          type: q.type,
          content: q.content.trim(),
          ...(hasFreshEditStudentGuides && studentGuide ? { studentGuide } : {}),
        };
      })
      .filter((q) => q.content);
    const sentenceSourceIndexes = editCoreSentences.map((item, index) => item.trim() ? index : -1).filter((index) => index >= 0);
    const essentialSourceIndexes = editEssentialQuestions.map((item, index) => item.trim() ? index : -1).filter((index) => index >= 0);
    const cleanedSentences = sentenceSourceIndexes.map((index) => editCoreSentences[index].trim());
    const cleanedEssential = essentialSourceIndexes.map((index) => editEssentialQuestions[index].trim());
    const res = await fetch(`/api/unit-design/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle.trim(),
        sessionDate: editDate || null,
        isActive: editVisibility.isActive,
        defaultQuestionPublic: editVisibility.defaultQuestionPublic,
        likesVisibleToPeers: editVisibility.likesVisibleToPeers,
        commentsVisibleToPeers: editVisibility.commentsVisibleToPeers,
        targetClassValue: editTargetClassValue,
        targetStudentIds: editSelectedStudentIds,
        coreIdea: editCoreIdea.trim(),
        coreSentences: cleanedSentences,
        essentialQuestions: cleanedEssential,
        learningGuides: hasFreshEditStudentGuides
          ? remapStudentLearningGuides(editLearningGuides, sentenceSourceIndexes, essentialSourceIndexes)
          : null,
        inquiryQuestions: cleaned,
      }),
    });
    const result = await res.json().catch(() => ({}));
    return { ok: res.ok, cleaned, updatedAt: typeof result.updatedAt === "string" ? result.updatedAt : undefined };
  };

  const generateEditStudentGuides = async (design: SavedInquiryDesign) => {
    const indexedQuestions = editQuestions
      .map((question, originalIndex) => ({ question, originalIndex }))
      .filter(({ question }) => question.content.trim());
    if (indexedQuestions.length === 0 || generatingGuides) return;
    if (hasCurrentEditStudentGuides) {
      const approved = await confirm({
        title: t("studentGuideRegenerateConfirmTitle"),
        description: t("studentGuideRegenerateConfirmDesc"),
        confirmText: t("studentGuideRegenerateConfirmAction"),
      });
      if (!approved) return;
    }

    const requestSourceSignature = editGuideSourceSignature;
    setGeneratingGuides(true);
    try {
      const response = await fetch("/api/unit-design/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "learning_guides",
          subject: design.subject,
          gradeRange: design.gradeRange,
          area: design.area,
          unitName: editTitle.trim(),
          coreIdea: editCoreIdea.trim(),
          selectedKeywords: design.selectedKeywords ?? [],
          coreSentences: editCoreSentences,
          essentialQuestions: editEssentialQuestions,
          inquiryQuestions: indexedQuestions.map(({ question }) => ({
            type: question.type,
            content: question.content.trim(),
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      const expected = {
        coreSentenceCount: editCoreSentences.length,
        essentialQuestionCount: editEssentialQuestions.length,
        inquiryQuestionCount: indexedQuestions.length,
      };
      const checked = validateStudentGuideBundle(data, expected);
      if (!response.ok || !checked.ok) throw new Error();
      if (latestEditGuideSourceSignatureRef.current !== requestSourceSignature) {
        toast({ description: t("studentGuideSourceChangedDuringGeneration") });
        return;
      }
      if (hasCurrentEditStudentGuides) {
        setPreviousEditStudentGuides({
          sourceSignature: requestSourceSignature,
          learningGuides: latestEditLearningGuidesRef.current,
          inquiryGuides: latestEditQuestionsRef.current.map((question) => question.studentGuide),
        });
      } else {
        setPreviousEditStudentGuides(null);
      }
      setEditLearningGuides(checked.value.learningGuides);
      const byOriginalIndex = new Map(indexedQuestions.map(({ originalIndex }, index) => {
        const { index: _index, ...studentGuide } = checked.value.guides[index];
        return [originalIndex, studentGuide] as const;
      }));
      setEditQuestions((previous) => previous.map((question, index) => {
        const studentGuide = byOriginalIndex.get(index);
        return studentGuide ? { ...question, studentGuide } : question;
      }));
      setGeneratedEditGuideSourceSignature(requestSourceSignature);
      toast({ description: t("studentGuideGenerated") });
    } catch {
      toast({ variant: "destructive", description: t("studentGuideGenerateFailed") });
    } finally {
      setGeneratingGuides(false);
    }
  };

  const confirmEditStudentGuideOmission = async () => {
    if (!(hasIncompleteEditStudentGuides || hasStaleEditStudentGuides)) return true;
    return confirm({
      title: t("studentGuideSaveWithoutTitle"),
      description: t("studentGuideSaveWithoutDesc"),
      confirmText: t("studentGuideSaveWithoutAction"),
    });
  };

  const restorePreviousEditStudentGuides = () => {
    if (!previousEditStudentGuides || previousEditStudentGuides.sourceSignature !== editGuideSourceSignature) {
      setPreviousEditStudentGuides(null);
      return;
    }
    setEditLearningGuides(previousEditStudentGuides.learningGuides);
    setEditQuestions((previous) => previous.map((question, index) => {
      const studentGuide = previousEditStudentGuides.inquiryGuides[index];
      if (studentGuide) return { ...question, studentGuide };
      const { studentGuide: _studentGuide, ...withoutStudentGuide } = question;
      return withoutStudentGuide;
    }));
    setGeneratedEditGuideSourceSignature(previousEditStudentGuides.sourceSignature);
    setPreviousEditStudentGuides(null);
  };

  // 저장만(설계 업데이트 — 라이브 참고자료에 즉시 반영)
  const saveEditDesign = async (id: string) => {
    if (!editTitle.trim() || savingEdit) return;
    if (!(await confirmEditStudentGuideOmission())) return;
    setSavingEdit(true);
    try {
      const { ok, updatedAt } = await patchEditDesign(id);
      if (!ok) throw new Error();
      cancelEditDesign();
      onChanged();
      toast({ variant: "success", description: t("designSavedAt", { time: formatDateTime(updatedAt ?? new Date().toISOString()) }) });
    } catch {
      toast({ variant: "destructive", description: t("designUpdateFailed") });
    } finally {
      setSavingEdit(false);
    }
  };

  // 수정한 설계를 저장하고 그 설정으로 새 질문수업을 만든다.
  const createQuestionClassFromDesign = async (id: string) => {
    if (!editTitle.trim() || !editDate || savingEdit) return;
    if (!(await confirmEditStudentGuideOmission())) return;
    setSavingEdit(true);
    try {
      const target = buildClassStudentTargetPayload({
        targetClassValue: editTargetClassValue,
        selectedStudentIds: editSelectedStudentIds,
        students,
      });
      const result = await runSavedDesignQuestionClassCreation({
        updateDesign: async () => (await patchEditDesign(id)).ok,
        createSession: () =>
          postQuestionClassFromDesign({
            designId: id,
            fallbackError: t("sessionCreateFailed"),
            payload: {
              date: editDate,
              topic: editTitle.trim(),
              defaultQuestionPublic: editVisibility.defaultQuestionPublic,
              isActive: editVisibility.isActive,
              likesVisibleToPeers: editVisibility.likesVisibleToPeers,
              commentsVisibleToPeers: editVisibility.commentsVisibleToPeers,
              ...target,
            },
          }),
        refreshDesigns: onChanged,
        onSuccess: async (createdSession) => {
          await queryClient
            .invalidateQueries({ queryKey: appQueryKeys.teacherSessions })
            .catch(() => undefined);
          cancelEditDesign();
          toast({
            variant: "success",
            description: t("designRedeployedAt", {
              time: formatDateTime(createdSession.createdAt ?? new Date().toISOString()),
            }),
          });
          router.push(`/teacher-sessions?session=${encodeURIComponent(createdSession.id)}`);
        },
      });

      if (result.status === "update-failed") {
        toast({ variant: "destructive", description: t("designUpdateFailed") });
      } else if (result.status === "session-failed") {
        const description =
          result.error instanceof Error && result.error.message
            ? result.error.message
            : t("sessionCreateFailed");
        toast({ variant: "destructive", description });
      }
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div>
          <CardTitle className="text-base">{t("savedTitle")}</CardTitle>
          <CardDescription>{t("savedDesc")}</CardDescription>
        </div>
        {savedList.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* 조회(필터) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{tSess("filterLabel")}</span>
              <select
                aria-label={t("date")}
                value={savedFilterDate}
                onChange={(e) => setSavedFilterDate(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
              >
                <option value="">{t("savedFilterAllDates")}</option>
                {savedDateMonthGroups.map((group) => (
                  <optgroup key={group.key} label={group.label}>
                    {group.dates.map((date) => <option key={date} value={date}>{date}</option>)}
                  </optgroup>
                ))}
              </select>
              {([
                [savedFilterGrade, setSavedFilterGrade, savedFilterOptions.grades, t("savedFilterAllGrades")],
                [savedFilterSubject, setSavedFilterSubject, savedFilterOptions.subjects, t("savedFilterAllSubjects")],
                [savedFilterArea, setSavedFilterArea, savedFilterOptions.areas, t("savedFilterAllAreas")],
                [savedFilterUnit, setSavedFilterUnit, savedFilterOptions.units, t("savedFilterAllUnits")],
              ] as const).map(([value, setter, options, allLabel], i) => (
                <select
                  key={i}
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                >
                  <option value="">{allLabel}</option>
                  {options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ))}
              {hasSavedFilter && (
                <button
                  type="button"
                  onClick={() => { setSavedFilterDate(""); setSavedFilterGrade(""); setSavedFilterSubject(""); setSavedFilterArea(""); setSavedFilterUnit(""); }}
                  className="h-8 px-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                >
                  {tc("reset")}
                </button>
              )}
            </div>
            {/* 정렬 */}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{tSess("sortLabel")}</span>
              <div className="flex rounded-md border overflow-hidden h-8">
                {(["desc", "asc"] as const).map((v, i) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSavedSort(v)}
                    className={`px-3 text-xs font-medium transition-colors ${i > 0 ? "border-l" : ""} ${savedSort === v ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
                  >
                    {v === "desc" ? tSess("sortDesc") : tSess("sortAsc")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {savedList.length === 0 ? (
          <EmptyState icon="📭" title={t("savedEmpty")} />
        ) : visibleSaved.length === 0 ? (
          <EmptyState icon="🔍" title={t("savedFilterEmpty")} />
        ) : (
          <ul className="divide-y rounded-md border">
            {visibleSaved.map((d) => {
              const status = getDesignStatus(d);
              const newQuestionClassNeeded = needsNewQuestionClass(d);
              const timeline = getSavedDesignTimeline(d);
              return (
              <li key={d.id} className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => handleSelectSavedDesign(d)}
                    aria-expanded={selectedSavedId === d.id}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="flex items-center gap-1.5 font-medium text-sm text-foreground">
                      <CollapseChevron open={selectedSavedId === d.id} />
                      <span className="truncate">{d.title}</span>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[d.sessionDate, d.subject, d.area].filter(Boolean).join(" · ")}
                    </span>
                    {timeline.primary && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t(timelineLabelKey[timeline.primary.kind], { time: formatDateTime(timeline.primary.at) })}
                      </span>
                    )}
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    {/* 아이콘 버튼(관리 열 공통 패턴) — 편집 중엔 X(취소)로 전환 */}
                    <button
                      type="button"
                      onClick={() => (editingDesignId === d.id ? cancelEditDesign() : startEditDesign(d))}
                      className={`rounded-md border p-1.5 ${
                        editingDesignId === d.id
                          ? "border-border bg-muted text-foreground hover:bg-muted/70"
                          : "border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                      }`}
                      title={editingDesignId === d.id ? tc("cancel") : tc("edit")}
                      aria-label={editingDesignId === d.id ? tc("cancel") : tc("edit")}
                    >
                      {editingDesignId === d.id ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(d.id)}
                      className="rounded-md border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
                      title={tc("delete")}
                      aria-label={tc("delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {selectedSavedId === d.id && timeline.history.length > 0 && (
                  <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">{t("savedTimelineLabel")}</span>
                    <span className="ml-2">
                      {timeline.history
                        .map((item) => t(historyLabelKey[item.kind], { time: formatDateTime(item.at) }))
                        .join(" · ")}
                    </span>
                  </div>
                )}

                {/* 인라인 편집: 제목 + 질문 수정/추가/삭제 */}
                {editingDesignId === d.id && (
                  <div className="mt-3 space-y-3 rounded-md border bg-muted/30 p-3">
                    {newQuestionClassNeeded && (
                      <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700 dark:border-orange-500/30 dark:bg-orange-950/30 dark:text-orange-200">
                        {t("redeployNeededNotice")}
                      </div>
                    )}
                    {/* 학년 (읽기 전용) */}
                    <p className="text-xs text-muted-foreground">
                      {d.grade ? t("gradeLabel", { grade: d.grade }) : t("gradeRangeLabel", { range: d.gradeRange })}
                    </p>
                    {/* 수업날짜 · 교과 · 영역 · 단원 순 (교과·영역은 읽기 전용) */}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1">
                        <Label>{t("sessionDate")}</Label>
                        <DatePicker value={editDate} onChange={setEditDate} placeholder={t("pickSessionDate")} />
                      </div>
                      <div className="space-y-1">
                        <Label>{t("subject")}</Label>
                        <Input value={d.subject} disabled className="bg-muted" />
                      </div>
                      <div className="space-y-1">
                        <Label>{t("area")}</Label>
                        <Input value={d.area} disabled className="bg-muted" />
                      </div>
                      <div className="space-y-1">
                        <Label>{t("unitFieldLabel")}</Label>
                        <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                      </div>
                    </div>

                    {/* 배포 대상 + 공개 설정 4종 */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label>{t("selectTargetsLabel")}</Label>
                        <SessionTargetSelector
                          classes={targetClasses}
                          students={students}
                          targetClassValue={editTargetClassValue}
                          selectedStudentIds={editSelectedStudentIds}
                          onTargetClassChange={(v, ids) => { setEditTargetClassValue(v); setEditSelectedStudentIds(ids); }}
                          onSelectedStudentIdsChange={setEditSelectedStudentIds}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>{t("visibilitySettingsLabel")}</Label>
                        <SessionVisibilitySettings value={editVisibility} onChange={setEditVisibility} />
                      </div>
                    </div>

                    {/* 핵심 아이디어 */}
                    <div className="space-y-1">
                      <Label>{t("coreIdea")}</Label>
                      <textarea
                        value={editCoreIdea}
                        onChange={(e) => setEditCoreIdea(e.target.value)}
                        rows={3}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                      />
                    </div>

                    {/* 핵심 문장 */}
                    <div className="space-y-1.5">
                      <Label>{t("coreSentencesLabel")}</Label>
                      {editCoreSentences.map((s, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <textarea
                            value={s}
                            onChange={(e) => updateTextItem(setEditCoreSentences, i, e.target.value)}
                            rows={2}
                            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                          />
                          <button type="button" onClick={() => removeLearningTextItem("coreSentences", setEditCoreSentences, i)} className="mt-1 shrink-0 text-sm text-red-500 hover:text-red-700" aria-label={tc("delete")}>✕</button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => addTextItem(setEditCoreSentences)}>＋ {t("addItem")}</Button>
                    </div>

                    {/* 핵심 질문 */}
                    <div className="space-y-1.5">
                      <Label>{t("essentialQuestionsLabel")}</Label>
                      {editEssentialQuestions.map((s, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <textarea
                            value={s}
                            onChange={(e) => updateTextItem(setEditEssentialQuestions, i, e.target.value)}
                            rows={2}
                            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                          />
                          <button type="button" onClick={() => removeLearningTextItem("essentialQuestions", setEditEssentialQuestions, i)} className="mt-1 shrink-0 text-sm text-red-500 hover:text-red-700" aria-label={tc("delete")}>✕</button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => addTextItem(setEditEssentialQuestions)}>＋ {t("addItem")}</Button>
                    </div>

                    <div className="space-y-3 border-t pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label>{t("studentGuideTitle")}</Label>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {canRestoreEditStudentGuides && (
                          <Button type="button" variant="ghost" size="sm" onClick={restorePreviousEditStudentGuides} disabled={generatingGuides}>
                            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            {t("studentGuideRestorePrevious")}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => generateEditStudentGuides(d)}
                          disabled={generatingGuides || !editQuestions.some((question) => question.content.trim())}
                        >
                          {generatingGuides
                            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                            : <WandSparkles className="mr-2 h-4 w-4" aria-hidden="true" />}
                          {generatingGuides
                            ? t("studentGuideGenerating")
                            : t(editLearningGuides || editQuestions.some((question) => question.studentGuide) ? "studentGuideRegenerate" : "studentGuideGenerate")}
                        </Button>
                      </div>
                    </div>
                    {hasStaleEditStudentGuides && (
                      <p role="status" className="rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/30 dark:text-amber-100">
                        {t("studentGuideStale")}
                      </p>
                    )}
                    {hasIncompleteEditStudentGuides && (
                      <p role="status" className="rounded-lg border border-rose-300/80 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-900 dark:border-rose-700/70 dark:bg-rose-950/30 dark:text-rose-100">
                        {t("studentGuideIncomplete")}
                      </p>
                    )}
                    <StudentLearningGuideEditor
                      coreIdea={editCoreIdea}
                      coreSentences={editCoreSentences}
                      essentialQuestions={editEssentialQuestions}
                      guides={editLearningGuides}
                      showEditors={hasCurrentEditStudentGuides}
                      emptyMessage={t(hasStaleEditStudentGuides ? "studentGuideStale" : "studentGuideEmpty")}
                      onChange={setEditLearningGuides}
                    />
                    </div>

                    {/* 탐구 질문 */}
                    <Label>{t("inquiryQuestionsLabel")}</Label>
                    <div className="space-y-2">
                      {editQuestions.map((q, i) => (
                        <div
                          key={i}
                          draggable
                          onDragStart={() => setDragIndex(i)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleEditDrop(i)}
                          className="rounded-md border border-border bg-muted/20 p-3"
                        >
                          <div className="flex items-start gap-2">
                            <div className="mt-1 flex shrink-0 flex-col items-center">
                              <GripVertical className="hidden h-4 w-4 cursor-grab text-muted-foreground sm:block" />
                              <div className="flex sm:flex-col">
                                <button
                                  type="button"
                                  onClick={() => moveEditQuestion(i, -1)}
                                  disabled={i === 0}
                                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                                  aria-label={t("moveUp")}
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveEditQuestion(i, 1)}
                                  disabled={i === editQuestions.length - 1}
                                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                                  aria-label={t("moveDown")}
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                            <select
                              value={q.type}
                              onChange={(e) => updateEditQuestion(i, { type: e.target.value as InquiryQuestion["type"] })}
                              className="h-9 shrink-0 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                            >
                              <option value="factual">{typeLabel("factual")}</option>
                              <option value="conceptual">{typeLabel("conceptual")}</option>
                              <option value="controversial">{typeLabel("controversial")}</option>
                            </select>
                            <textarea
                              value={q.content}
                              onChange={(e) => updateEditQuestion(i, { content: e.target.value })}
                              rows={2}
                              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                              placeholder={t("topicPlaceholder")}
                            />
                            <button
                              type="button"
                              onClick={() => removeEditQuestion(i)}
                              className="mt-1 shrink-0 text-sm text-red-500 hover:text-red-700"
                              aria-label={tc("delete")}
                            >
                              ✕
                            </button>
                          </div>
                          {hasCurrentEditStudentGuides && q.studentGuide ? (
                            <div className="mt-2">
                              <StudentInquiryGuideEditor
                                guide={q.studentGuide}
                                onChange={(studentGuide) => updateEditQuestion(i, { studentGuide })}
                              />
                            </div>
                          ) : hasEditStudentGuides ? (
                            <p className="mt-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                              {t(hasStaleEditStudentGuides ? "studentGuideStale" : "studentGuideIncomplete")}
                            </p>
                          ) : null}
                        </div>
                      ))}
                      <div className="flex items-center gap-2">
                        <select
                          value={addType}
                          onChange={(e) => setAddType(e.target.value as InquiryQuestion["type"])}
                          className="h-9 shrink-0 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                          aria-label={t("addQuestionType")}
                        >
                          <option value="factual">{typeLabel("factual")}</option>
                          <option value="conceptual">{typeLabel("conceptual")}</option>
                          <option value="controversial">{typeLabel("controversial")}</option>
                        </select>
                        <Button variant="outline" size="sm" onClick={() => addEditQuestion(addType)}>＋ {t("addQuestion")}</Button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Button
                        onClick={() => saveEditDesign(d.id)}
                        disabled={savingEdit || generatingGuides || !editTitle.trim()}
                        variant="gradient"
                        className="h-11 flex-1 text-base font-semibold"
                      >
                        <Save className="h-4 w-4" />
                        {savingEdit ? tc("loading") : tc("save")}
                      </Button>
                      <Button
                        variant={newQuestionClassNeeded ? "default" : "secondary"}
                        onClick={() => createQuestionClassFromDesign(d.id)}
                        disabled={savingEdit || generatingGuides || !editTitle.trim() || !editDate}
                        className={`h-11 flex-1 text-base font-semibold ${
                          newQuestionClassNeeded ? "bg-orange-600 text-white hover:bg-orange-700" : ""
                        }`}
                      >
                        <BookOpenCheck className="h-4 w-4" />
                        {t(newQuestionClassNeeded ? "redeployNeededButton" : "redeployToSession")}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={cancelEditDesign}
                        disabled={savingEdit}
                        className="h-11 sm:w-28"
                      >
                        {tc("cancel")}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("redeployHint")}</p>
                  </div>
                )}

                {selectedSavedId === d.id && (
                  <div className="mt-3 rounded-md border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-950/30 p-3">
                    {/* 학생에게 전달되는 참고자료 미리보기 */}
                    <p className="mb-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">📚 {t("referencePreview")}</p>
                    <DesignReferenceView
                      data={{
                        title: d.title,
                        sessionDate: d.sessionDate,
                        gradeRange: d.gradeRange,
                        grade: d.grade,
                        subject: d.subject,
                        area: d.area,
                        coreIdea: d.coreIdea,
                        coreSentences: d.coreSentences,
                        essentialQuestions: d.essentialQuestions,
                        learningGuides: d.learningGuides,
                        inquiryQuestions: d.inquiryQuestions,
                      }}
                    />
                  </div>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  buildClassStudentTargetPayload,
  defaultTargetSelection,
  type SessionTargetClass,
  type SessionTargetStudent,
} from "@/lib/session-targeting";
import { useToast } from "@/components/ui/use-toast";
import { useTranslations } from "next-intl";
import {
  extractUnitCode,
  filterAchievementsByUnitCodes,
  getSelectedAchievementsForAnalysis,
  pickAchievementExplanations,
  selectAllAchievementCodes,
  type Achievement,
} from "@/lib/achievement-selection";
import {
  selectAllContentItems,
  splitCoreIdeaLines,
} from "@/lib/content-selection";
import {
  filterSelectedTexts,
  selectAllIndices,
} from "@/lib/inquiry-design-selection";
import { appQueryKeys, useTeacherStudents } from "@/lib/app-queries";
import { sortCurriculumAreas } from "@/lib/curriculum-area-order";
import { CurriculumCreateFlow } from "./CurriculumCreateFlow";
import { CurriculumMainTabs, type CurriculumMainTab } from "./CurriculumMainTabs";
import type { CurriculumStep } from "./CurriculumStepProgress";
import { SavedDesignsTab } from "./SavedDesignsTab";
import {
  postInquiryDesign,
  postQuestionClassFromDesign,
  runInquiryQuestionClassCreation,
  type PendingQuestionClassDesign,
} from "@/lib/question-class-creation";
import { visibleDataRefetchInterval } from "@/lib/query-refresh";
import { normalizeStudentInquiryGuide } from "@/lib/student-inquiry-guide";
import { withSelectedCoreIdea } from "@/lib/student-guide-source";
import {
  KNOWLEDGE_ITEM_LIMIT,
  PROCESS_ITEM_LIMIT,
  VALUE_ITEM_LIMIT,
  todayStr,
  type CurriculumArea,
  type InquiryQuestion,
  type SavedInquiryDesign,
} from "./types";
import { useStudentInquiryGuides } from "./useStudentInquiryGuides";
import { InquiryQuestionClassWorkspaceHeader } from "./InquiryQuestionClassWorkspaceHeader";
// ── 타입 ──────────────────────────────────────────────────────────────
type LastDesignAction = { type: "saved" | "deployed"; at: string };
// ── 컴포넌트 ──────────────────────────────────────────────────────────
export default function CurriculumPage() {
  const t = useTranslations("curriculum");
  const tc = useTranslations("common");
  const stepLabel = (n: CurriculumStep) => t(`step${n}`);
  const [step, setStep] = useState<CurriculumStep>(1);
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveGrade, setSaveGrade] = useState("");
  const [saveDate, setSaveDate] = useState(todayStr);
  const [lastDesignAction, setLastDesignAction] = useState<LastDesignAction | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();
  const pendingQuestionClassDesign = useRef<PendingQuestionClassDesign<SavedInquiryDesign> | null>(null);
  // 저장 목록(조회·정렬·인라인 편집)은 SavedDesignsTab이 자체 상태로 처리한다
  const [mainTab, setMainTab] = useState<CurriculumMainTab>("create");
  const [defaultQuestionPublic, setDefaultQuestionPublic] = useState(true);
  const [sessionIsActive, setSessionIsActive] = useState(true);
  const [sessionLikesVisible, setSessionLikesVisible] = useState(true);
  const [sessionCommentsVisible, setSessionCommentsVisible] = useState(true);

  // Step 1 — 학년군·교과·영역 선택 (학년군 → 교과 → 영역 순)
  const [areas, setAreas] = useState<{ id: string; area: string }[]>([]);
  const [selGrade, setSelGrade] = useState("");
  const [selSubject, setSelSubject] = useState("");
  const [selAreaId, setSelAreaId] = useState("");
  const [curriculumData, setCurriculumData] = useState<CurriculumArea | null>(null);
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);
  const [selectedUnitCodes, setSelectedUnitCodes] = useState<string[]>([]);
  const [selectedAchievementCodes, setSelectedAchievementCodes] = useState<string[]>([]);
  const [unitNameInput, setUnitNameInput] = useState("");
  const [isRecommending, setIsRecommending] = useState(false);
  const [recommendMessage, setRecommendMessage] = useState("");
  // 마지막 단계에서 바로 세션을 만들기 위한 대상 선택 데이터(수업세션 페이지와 동일 UI)
  const { data: targetData } = useTeacherStudents<SessionTargetStudent, SessionTargetClass>();
  const students = useMemo(() => targetData?.students ?? [], [targetData]);
  const teacherClasses = useMemo(() => targetData?.teacherClasses ?? [], [targetData]);
  const [targetClassValue, setTargetClassValue] = useState("all");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [targetDefaulted, setTargetDefaulted] = useState(false);

  // 내용요소 선택 (새 기능: 핵심아이디어·지식이해·과정기능·가치태도 체크박스)
  const [selectedCoreIdeaLines, setSelectedCoreIdeaLines] = useState<string[]>([]);
  const [selectedKnowledge, setSelectedKnowledge] = useState<string[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<string[]>([]);
  const [selectedValue, setSelectedValue] = useState<string[]>([]);
  // Step 2 — 핵심어
  const [recommendedKeywords, setRecommendedKeywords] = useState<string[]>([]);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [customKeyword, setCustomKeyword] = useState("");
  const [loadingKeywords, setLoadingKeywords] = useState(false);

  // Step 3 — 핵심 문장
  const [coreSentences, setCoreSentences] = useState<string[]>([]);
  const [selectedCoreSentenceIndices, setSelectedCoreSentenceIndices] = useState<number[]>([]);
  const [loadingSentences, setLoadingSentences] = useState(false);

  // Step 4 — 핵심 질문
  const [essentialQuestions, setEssentialQuestions] = useState<string[]>([]);
  const [selectedEssentialQuestionIndices, setSelectedEssentialQuestionIndices] = useState<number[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Step 5 — 탐구 질문
  const [inquiryQuestions, setInquiryQuestions] = useState<InquiryQuestion[]>([]);
  const [dragInquiryIndex, setDragInquiryIndex] = useState<number | null>(null);
  const [inquiryAddType, setInquiryAddType] = useState<InquiryQuestion["type"]>("factual");
  const [loadingInquiry, setLoadingInquiry] = useState(false);

  // 저장된 탐구설계 목록 — react-query 폴링(12초)+포커스 재조회
  const { data: savedList = [] } = useQuery<SavedInquiryDesign[]>({
    queryKey: ["unit-designs"],
    queryFn: async () => {
      const r = await fetch("/api/unit-design");
      if (!r.ok) throw new Error("저장된 탐구 설계를 불러오지 못했습니다");
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
    refetchInterval: visibleDataRefetchInterval,
    refetchOnWindowFocus: true,
  });
  const fetchSaved = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["unit-designs"] }),
    [queryClient],
  );

  useEffect(() => {
    if (targetDefaulted || !targetData) return;
    // 기본값: 학급이 여러 개면 전체 담당 학급, 한 개뿐이면 그 학급 전체 학생
    const defaults = defaultTargetSelection(targetData.students, targetData.teacherClasses);
    setTargetClassValue(defaults.targetClassValue);
    setSelectedStudentIds(defaults.selectedStudentIds);
    setTargetDefaulted(true);
  }, [targetData, targetDefaulted]);

  const targetClasses = useMemo(() => {
    if (teacherClasses.length > 0) return teacherClasses;
    const map = new Map<string, SessionTargetClass>();
    students.forEach((s) => {
      if (s.grade && s.className) map.set(`${s.grade}-${s.className}`, { grade: s.grade, className: s.className });
    });
    return Array.from(map.values());
  }, [students, teacherClasses]);

  // 학년군 변경 → 교과·영역·커리큘럼 초기화
  useEffect(() => {
    setSelSubject("");
    setSelAreaId("");
    setAreas([]);
    setCurriculumData(null);
    setSelectedUnitCodes([]);
    setSelectedAchievementCodes([]);
  }, [selGrade]);

  // 교과 변경 → 영역 목록 로드 (2022 교육과정 순서로 정렬)
  useEffect(() => {
    if (!selSubject || !selGrade) {
      setAreas([]);
      setSelAreaId("");
      setCurriculumData(null);
      setSelectedUnitCodes([]);
      setSelectedAchievementCodes([]);
      return;
    }
    setSelAreaId("");
    setCurriculumData(null);
    setSelectedUnitCodes([]);
    setSelectedAchievementCodes([]);
    fetch(`/api/curriculum?subject=${encodeURIComponent(selSubject)}&gradeRange=${encodeURIComponent(selGrade)}`)
      .then((r) => r.json())
      .then((d) => setAreas(sortCurriculumAreas(d.areas ?? [], selSubject)))
      .catch(() => {});
  }, [selSubject, selGrade]);

  // 영역 상세 데이터 로드
  const loadAreaData = useCallback(async () => {
    if (!selAreaId) return;
    setLoadingCurriculum(true);
    // 내용요소 선택 및 추천 상태 초기화
    setSelectedCoreIdeaLines([]);
    setSelectedKnowledge([]);
    setSelectedProcess([]);
    setSelectedValue([]);
    try {
      const r = await fetch(`/api/curriculum?areaId=${selAreaId}`);
      const d: CurriculumArea = await r.json();
      const enrichedRes = await fetch(`/api/curriculum/enriched?areaId=${selAreaId}`);
      const enriched = enrichedRes.ok ? await enrichedRes.json() : {};
      const merged: CurriculumArea = {
        ...d,
        achievements: Array.isArray(enriched.achievements) && enriched.achievements.length > 0
          ? enriched.achievements
          : d.achievements,
        achievementExplanations: enriched.achievementExplanations ?? {},
        achievementConsiderations: enriched.achievementConsiderations ?? [],
        achievementGroups: enriched.achievementGroups ?? [],
      };
      setCurriculumData(merged);
      setSelectedAchievementCodes(selectAllAchievementCodes(merged.achievements));
      setSelectedCoreIdeaLines(splitCoreIdeaLines(d.coreIdea));
      setSelectedKnowledge(selectAllContentItems(d.knowledgeItems, KNOWLEDGE_ITEM_LIMIT));
      setSelectedProcess(selectAllContentItems(d.processItems, PROCESS_ITEM_LIMIT));
      setSelectedValue(selectAllContentItems(d.valueItems, VALUE_ITEM_LIMIT));
      // 단원 데이터가 있으면 전체 선택 초기 상태로 설정
      if (Array.isArray(d.units) && d.units.length > 0) {
        setSelectedUnitCodes(d.units.map((u) => u.unitCode));
      } else {
        setSelectedUnitCodes([]);
      }
    } finally {
      setLoadingCurriculum(false);
    }
  }, [selAreaId]);

  useEffect(() => { loadAreaData(); }, [loadAreaData]);

  // 선택된 단원의 성취기준만 필터링 (단원 데이터 없으면 전체 반환)
  const getFilteredAchievements = () => {
    if (!curriculumData) return [];
    return filterAchievementsByUnitCodes(
      curriculumData.achievements,
      selectedUnitCodes,
      curriculumData.units.length > 0
    );
  };

  const getSelectedAchievements = () => {
    return getSelectedAchievementsForAnalysis(getFilteredAchievements(), selectedAchievementCodes);
  };

  const selectedCoreSentences = filterSelectedTexts(coreSentences, selectedCoreSentenceIndices);
  const selectedEssentialQuestions = filterSelectedTexts(
    essentialQuestions,
    selectedEssentialQuestionIndices
  );
  const getFilteredAchievementGroups = () => {
    const groups = curriculumData?.achievementGroups ?? [];
    if (groups.length === 0) return [];
    const visibleCodes = new Set(getFilteredAchievements().map((achievement) => achievement.code));
    return groups
      .map((group) => ({
        ...group,
        achievements: group.achievements.filter((achievement) => visibleCodes.has(achievement.code)),
      }))
      .filter((group) => group.achievements.length > 0);
  };

  const callGenerate = async (stepName: string, extra: Record<string, unknown> = {}) => {
    if (!curriculumData) return null;
    const res = await fetch("/api/unit-design/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step: stepName,
        subject: curriculumData.subject,
        gradeRange: curriculumData.gradeRange,
        area: curriculumData.area,
        coreIdea: selectedCoreIdeaLines.join("\n"),
        knowledgeItems: selectedKnowledge,
        processItems: selectedProcess,
        valueItems: selectedValue,
        achievements: getSelectedAchievements(),
        achievementExplanations: pickAchievementExplanations(
          curriculumData.achievementExplanations,
          getSelectedAchievements().map((achievement) => achievement.code)
        ),
        achievementConsiderations: curriculumData.achievementConsiderations ?? [],
        selectedKeywords,
        coreSentences,
        essentialQuestions,
        ...extra,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      // 브라우저 콘솔에 진단 정보 전체 출력 (네트워크 탭에서도 확인 가능)
      console.error(`[unit-design/generate] HTTP ${res.status}`, err);
      const parts = [err.error || t("aiGenError")];
      if (err.detail) parts.push(`\n${t("detailLabel")}\n${err.detail}`);
      if (err.rawPreview) parts.push(`\n${t("rawLabel")}\n${err.rawPreview}`);
      toast({ variant: "destructive", description: parts.join("\n") });
      return null;
    }
    return res.json();
  };

  const handleGoStep2 = async () => {
    if (!curriculumData) return;
    setLoadingKeywords(true);
    try {
      const data = await callGenerate("keywords");
      if (data?.keywords) {
        setRecommendedKeywords(data.keywords);
        setSelectedKeywords(data.keywords);
        setStep(2);
      }
    } finally {
      setLoadingKeywords(false);
    }
  };

  const handleGoStep3 = async () => {
    setLoadingSentences(true);
    try {
      const data = await callGenerate("sentences");
      if (data?.sentences) {
        setCoreSentences(data.sentences);
        setSelectedCoreSentenceIndices(selectAllIndices(data.sentences));
        setEssentialQuestions([]);
        setSelectedEssentialQuestionIndices([]);
        setInquiryQuestions([]);
        setStep(3);
      }
    } finally {
      setLoadingSentences(false);
    }
  };

  const handleGoStep4 = async () => {
    setLoadingQuestions(true);
    try {
      const data = await callGenerate("questions", { coreSentences: selectedCoreSentences });
      if (data?.questions) {
        setEssentialQuestions(data.questions);
        setSelectedEssentialQuestionIndices(selectAllIndices(data.questions));
        setInquiryQuestions([]);
        setStep(4);
      }
    } finally {
      setLoadingQuestions(false);
    }
  };
  const { learningGuides, setLearningGuides, loadingStudentGuides, handleGenerateStudentGuides,
    hasCurrentStudentGuides, hasFreshStudentGuides, hasIncompleteStudentGuides,
    hasStaleStudentGuides, clearStudentGuides } = useStudentInquiryGuides({
    questions: inquiryQuestions, coreIdea: selectedCoreIdeaLines.join("\n"), coreSentences: selectedCoreSentences, essentialQuestions: selectedEssentialQuestions,
    setQuestions: setInquiryQuestions, generate: callGenerate,
    onSuccess: () => toast({ description: t("studentGuideGenerated") }),
    onError: () => toast({ variant: "destructive", description: t("studentGuideGenerateFailed") }),
    onSourceChanged: () => toast({ description: t("studentGuideSourceChangedDuringGeneration") }),
  });

  // 5단계 탐구질문은 리스트 자체가 저장/세션 대상(내용이 빈 것은 제외)
  const selectedInquiryQuestions = inquiryQuestions
    .map((question) => {
      const studentGuide = hasFreshStudentGuides
        ? normalizeStudentInquiryGuide(question.studentGuide)
        : undefined;
      return {
        type: question.type,
        content: question.content.trim(),
        ...(studentGuide ? { studentGuide } : {}),
      };
    })
    .filter((question) => question.content);

  const handleGoStep5 = async () => {
    clearStudentGuides();
    setLoadingInquiry(true);
    try {
      const data = await callGenerate("inquiry", {
        coreSentences: selectedCoreSentences,
        essentialQuestions: selectedEssentialQuestions,
      });
      if (Array.isArray(data?.inquiryQuestions)) {
        setInquiryQuestions(data.inquiryQuestions.map((question: InquiryQuestion) => ({
          type: question.type,
          content: question.content,
        })));
        setStep(5);
      }
    } finally {
      setLoadingInquiry(false);
    }
  };

  const toggleKeyword = (kw: string) => {
    setSelectedKeywords((prev) =>
      prev.includes(kw) ? prev.filter((k) => k !== kw) : [...prev, kw]
    );
  };

  const addCustomKeyword = () => {
    const kw = customKeyword.trim();
    if (!kw || selectedKeywords.includes(kw)) return;
    setSelectedKeywords((prev) => [...prev, kw]);
    setRecommendedKeywords((prev) => [...prev, kw]);
    setCustomKeyword("");
  };

  const canSaveDesign = Boolean(
    curriculumData && saveTitle.trim() && saveGrade && saveDate && selectedInquiryQuestions.length > 0,
  );

  const buildDesignPayload = () => withSelectedCoreIdea({
    title: saveTitle.trim(),
    curriculumAreaId: curriculumData?.id,
    subject: curriculumData?.subject,
    gradeRange: curriculumData?.gradeRange,
    grade: saveGrade,
    sessionDate: saveDate,
    area: curriculumData?.area,
    selectedKeywords,
    coreSentences: selectedCoreSentences,
    essentialQuestions: selectedEssentialQuestions,
    learningGuides: hasFreshStudentGuides ? learningGuides : undefined,
    inquiryQuestions: selectedInquiryQuestions,
    isActive: sessionIsActive,
    defaultQuestionPublic,
    likesVisibleToPeers: sessionLikesVisible,
    commentsVisibleToPeers: sessionCommentsVisible,
    targetClassValue,
    targetStudentIds: selectedStudentIds,
  }, selectedCoreIdeaLines);

  // 설계 저장만 수행하고 생성된 설계를 반환한다.
  const saveDesign = async (
    payload = buildDesignPayload(),
  ): Promise<SavedInquiryDesign | null> => {
    if (!curriculumData) return null;
    try {
      const savedDesign = await postInquiryDesign<SavedInquiryDesign>({
        payload,
        fallbackError: t("saveFailed"),
      });
      queryClient.setQueryData<SavedInquiryDesign[]>(["unit-designs"], (prev) => [
        savedDesign,
        ...(prev ?? []).filter((design) => design.id !== savedDesign.id),
      ]);
      fetchSaved();
      return savedDesign;
    } catch {
      toast({ variant: "destructive", description: t("saveFailed") });
      return null;
    }
  };

  const resetSaveForm = () => {
    setSaveTitle("");
    setSaveGrade("");
    setSaveDate(todayStr());
  };

  // 저장만
  const handleSave = async () => {
    if (!canSaveDesign) return;
    setIsSaving(true);
    try {
      const d = await saveDesign();
      if (d?.id) {
        pendingQuestionClassDesign.current = null;
        setLastDesignAction({ type: "saved", at: d.updatedAt ?? d.createdAt ?? new Date().toISOString() });
        resetSaveForm();
        // 저장 탭은 SavedDesignsTab이 새로 마운트되며 접힌 상태로 시작한다
        setMainTab("saved");
      }
    } finally {
      setIsSaving(false);
    }
  };

  // 설계를 저장하고 질문수업을 만든다. 같은 입력 재시도에서는 직전에 저장한 설계를 재사용한다.
  const handleSaveAndCreateSession = async (mode: "inquiry" | "deploy") => {
    if (!canSaveDesign || !curriculumData) return;
    setIsSaving(true);
    try {
      const designPayload = buildDesignPayload();
      const inputSignature = JSON.stringify(designPayload);
      const target = buildClassStudentTargetPayload({ targetClassValue, selectedStudentIds, students });
      const result = await runInquiryQuestionClassCreation({
        inputSignature,
        pendingDesign: pendingQuestionClassDesign.current,
        saveDesign: () => saveDesign(designPayload),
        createSession: (design) =>
          postQuestionClassFromDesign({
            designId: design.id,
            fallbackError: t("sessionCreateFailed"),
            payload: {
              date: saveDate,
              topic: saveTitle.trim(),
              defaultQuestionPublic,
              isActive: sessionIsActive,
              likesVisibleToPeers: sessionLikesVisible,
              commentsVisibleToPeers: sessionCommentsVisible,
              ...target,
              ...(mode === "deploy" ? { sharedQuestions: selectedInquiryQuestions } : {}),
            },
          }),
        onSuccess: async (createdSession) => {
          await queryClient
            .invalidateQueries({ queryKey: appQueryKeys.teacherSessions })
            .catch(() => undefined);
          const actionAt = createdSession.createdAt ?? new Date().toISOString();
          setLastDesignAction({ type: "deployed", at: actionAt });
          toast({
            variant: "success",
            description: t(mode === "deploy" ? "sessionCreated" : "inquirySessionCreated", {
              date: saveDate,
              subject: curriculumData.subject,
            }),
          });
          resetSaveForm();
          setMainTab("saved");
          router.push(`/teacher-sessions?session=${encodeURIComponent(createdSession.id)}`);
        },
      });

      pendingQuestionClassDesign.current = result.pendingDesign;
      if (result.status === "session-failed") {
        const description =
          result.error instanceof Error && result.error.message
            ? result.error.message
            : t("sessionCreateFailed");
        toast({ variant: "destructive", description });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // 단원명 입력 → 교육과정 단원 매칭(성취기준 자동 추천용)
  const normUnit = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const unitMatches =
    curriculumData && unitNameInput.trim()
      ? curriculumData.units.filter((u) => normUnit(u.unitName).includes(normUnit(unitNameInput)))
      : [];
  // 선택한 단원으로 좁혀 그 단원의 성취기준을 추천(선택)한다.
  const recommendUnit = (unitCode: string) => {
    if (!curriculumData) return;
    setSelectedUnitCodes([unitCode]);
    const unitAch = filterAchievementsByUnitCodes(
      curriculumData.achievements,
      [unitCode],
      curriculumData.units.length > 0,
    );
    setSelectedAchievementCodes((prev) => Array.from(new Set([...prev, ...unitAch.map((a) => a.code)])));
    setUnitNameInput("");
  };

  // 교과서 단원명(자유 입력) → AI가 영역 데이터에서 관련 성취기준·지식·과정·가치를 추천(선택)
  const recommendByUnitName = async () => {
    if (!curriculumData || !unitNameInput.trim() || isRecommending) return;
    // 입력한 단원명을 주제(저장 제목)에 반영 — 비어있을 때만(교사가 입력한 주제는 보존)
    if (!saveTitle.trim()) setSaveTitle(unitNameInput.trim());
    setIsRecommending(true);
    setRecommendMessage("");
    try {
      const res = await fetch("/api/unit-design/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "recommend_by_unit",
          subject: curriculumData.subject,
          gradeRange: curriculumData.gradeRange,
          area: curriculumData.area,
          unitName: unitNameInput.trim(),
          achievements: curriculumData.achievements,
          knowledgeItems: curriculumData.knowledgeItems,
          processItems: curriculumData.processItems,
          valueItems: curriculumData.valueItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", description: data.error || t("recommendFailed") });
        return;
      }
      const recCodes: string[] = Array.isArray(data.recommendedCodes) ? data.recommendedCodes : [];
      const kIdx: number[] = Array.isArray(data.knowledgeIdx) ? data.knowledgeIdx : [];
      const pIdx: number[] = Array.isArray(data.processIdx) ? data.processIdx : [];
      const vIdx: number[] = Array.isArray(data.valueIdx) ? data.valueIdx : [];
      // 핵심아이디어: 영역 단일값이라 단원으로 좁히지 않고 전체 줄을 선택(버튼 한 번으로 5종 모두 채움)
      setSelectedCoreIdeaLines(splitCoreIdeaLines(curriculumData.coreIdea));
      // 성취기준: AI가 돌려준 코드를 정규화 비교로 영역의 정규(canonical) 코드에 되매핑
      // (대괄호·공백 등 형식 차이로 추천이 조용히 0개가 되는 것을 방지)
      const normCode = (s: string) => s.replace(/[\s[\]]/g, "");
      const areaByNorm = new Map(curriculumData.achievements.map((a) => [normCode(a.code), a.code] as const));
      const codes = Array.from(
        new Set(recCodes.map((c) => areaByNorm.get(normCode(c))).filter((c): c is string => Boolean(c))),
      );
      // 단원 필터가 추천 성취기준을 가리지 않도록 전체 단원 + 추천 코드의 단원을 포함
      const recUnits = codes.map((c) => extractUnitCode(c)).filter(Boolean);
      setSelectedUnitCodes(Array.from(new Set([...curriculumData.units.map((u) => u.unitCode), ...recUnits])));
      setSelectedAchievementCodes(codes);
      const pick = (items: string[], idx: number[]) =>
        idx.filter((i) => Number.isInteger(i) && i >= 0 && i < items.length).map((i) => items[i]);
      setSelectedKnowledge(pick(curriculumData.knowledgeItems, kIdx));
      setSelectedProcess(pick(curriculumData.processItems, pIdx));
      setSelectedValue(pick(curriculumData.valueItems, vIdx));
      const total = codes.length + pick(curriculumData.knowledgeItems, kIdx).length
        + pick(curriculumData.processItems, pIdx).length + pick(curriculumData.valueItems, vIdx).length;
      setRecommendMessage(total > 0 ? t("recommendDone", { count: total }) : t("recommendEmpty"));
    } catch {
      toast({ variant: "destructive", description: t("recommendFailed") });
    } finally {
      setIsRecommending(false);
    }
  };

  // 5단계 탐구질문 편집(저장 탭 편집과 동일: 드래그·↑↓·유형·내용·삭제·추가)
  const updateInquiry = (index: number, patch: Partial<InquiryQuestion>) =>
    setInquiryQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  const removeInquiry = (index: number) =>
    setInquiryQuestions((prev) => prev.filter((_, i) => i !== index));
  const addInquiry = (type: InquiryQuestion["type"]) =>
    setInquiryQuestions((prev) => [...prev, { type, content: "" }]);
  const moveInquiry = (index: number, dir: -1 | 1) =>
    setInquiryQuestions((prev) => {
      const to = index + dir;
      if (to < 0 || to >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[to]] = [copy[to], copy[index]];
      return copy;
    });
  const handleInquiryDrop = (targetIndex: number) => {
    setInquiryQuestions((prev) => {
      if (dragInquiryIndex === null || dragInquiryIndex === targetIndex || dragInquiryIndex < 0 || dragInquiryIndex >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(dragInquiryIndex, 1);
      copy.splice(targetIndex, 0, moved);
      return copy;
    });
    setDragInquiryIndex(null);
  };

  // ── 렌더 ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <InquiryQuestionClassWorkspaceHeader />

      <CurriculumMainTabs value={mainTab} savedCount={savedList.length} onChange={setMainTab} />

      {/* 저장 목록 — 조회, 정렬, 접기, 인라인 편집, 새 수업 만들기, 삭제 포함 */}
      {mainTab === "saved" && (
        <SavedDesignsTab savedList={savedList} onChanged={fetchSaved} students={students} targetClasses={targetClasses} />
      )}

      {/* 탐구질문 만들기 (단계 진행) */}
      {mainTab === "create" && (
      <CurriculumCreateFlow
        {...{
          step, stepLabel, selGrade, setSelGrade, selSubject, setSelSubject, selAreaId, setSelAreaId,
          areas, curriculumData, loadingCurriculum, loadAreaData, unitNameInput, setUnitNameInput,
          unitMatches, recommendUnit, recommendByUnitName, isRecommending, recommendMessage,
          selectedUnitCodes, setSelectedUnitCodes, selectedAchievementCodes, setSelectedAchievementCodes,
          selectedCoreIdeaLines, setSelectedCoreIdeaLines, selectedKnowledge, setSelectedKnowledge,
          selectedProcess, setSelectedProcess, selectedValue, setSelectedValue, getFilteredAchievements,
          getSelectedAchievements, getFilteredAchievementGroups, handleGoStep2, loadingKeywords,
          recommendedKeywords, selectedKeywords, customKeyword, loadingSentences, toggleKeyword,
          setCustomKeyword, addCustomKeyword, handleGoStep3, selectedCoreSentences, coreSentences,
          selectedCoreSentenceIndices, setSelectedCoreSentenceIndices, setCoreSentences, loadingQuestions,
          handleGoStep4, selectedEssentialQuestions, essentialQuestions, selectedEssentialQuestionIndices,
          setSelectedEssentialQuestionIndices, setEssentialQuestions, loadingInquiry, handleGoStep5,
          loadingStudentGuides, handleGenerateStudentGuides, learningGuides, hasCurrentStudentGuides,
          hasFreshStudentGuides, hasIncompleteStudentGuides, hasStaleStudentGuides, setLearningGuides,
          inquiryQuestions, dragInquiryIndex, inquiryAddType, saveDate, saveGrade, saveTitle, students,
          targetClasses, targetClassValue, selectedStudentIds, sessionIsActive, defaultQuestionPublic,
          sessionLikesVisible, sessionCommentsVisible, isSaving, canSaveDesign, lastDesignAction,
          setDragInquiryIndex, handleInquiryDrop, moveInquiry, updateInquiry, removeInquiry,
          setInquiryAddType, addInquiry, setSaveDate, setSaveGrade, setSaveTitle, setTargetClassValue,
          setSelectedStudentIds, setSessionIsActive, setDefaultQuestionPublic, setSessionLikesVisible,
          setSessionCommentsVisible,
        }}
        selectedInquiryCount={selectedInquiryQuestions.length}
        handleSaveAndCreateSession={() => handleSaveAndCreateSession("inquiry")}
        handleSave={handleSave}
      />
      )}
    </div>
  );
}

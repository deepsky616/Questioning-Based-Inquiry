"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AiLoadingProcess } from "@/components/shared/AiLoadingProcess";
import { SessionVisibilitySettings } from "@/components/shared/SessionVisibilitySettings";
import { SessionTargetSelector } from "@/components/shared/SessionTargetSelector";
import {
  buildClassStudentTargetPayload,
  defaultTargetSelection,
  type SessionTargetClass,
  type SessionTargetStudent,
} from "@/lib/session-targeting";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DatePicker from "@/components/shared/DatePicker";
import { PageHeader } from "@/components/shared/PageHeader";
import { useToast } from "@/components/ui/use-toast";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/datetime";
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
  toggleSelectedIndex,
} from "@/lib/inquiry-design-selection";
import { useTeacherStudents } from "@/lib/app-queries";
import { SavedDesignsTab } from "./SavedDesignsTab";
import { Step1CurriculumExplorer } from "./Step1CurriculumExplorer";
import {
  KNOWLEDGE_ITEM_LIMIT,
  PROCESS_ITEM_LIMIT,
  VALUE_ITEM_LIMIT,
  todayStr,
  type CurriculumArea,
  type InquiryQuestion,
  type SavedInquiryDesign,
} from "./types";

// ── 타입 ──────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3 | 4 | 5;
type LastDesignAction = { type: "saved" | "deployed"; at: string };

const TYPE_COLOR: Record<string, string> = {
  factual: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-300",
  conceptual: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-500/30 text-purple-800 dark:text-purple-300",
  controversial: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-500/30 text-orange-800 dark:text-orange-300",
};




// Codex(웹검색) 검증 완료 — 2022 개정 교육과정 문서 순서
const AREA_ORDER: Record<string, string[]> = {
  국어: ["듣기·말하기", "읽기", "쓰기", "문법", "문학", "매체"],
  수학: ["수와 연산", "변화와 관계", "도형과 측정", "자료와 가능성"],
  사회: ["지리 인식", "자연환경과 인간생활", "인문환경과 인간생활", "지속가능한 세계", "정치", "법", "경제", "사회·문화", "역사 일반", "지역사", "한국사"],
  과학: ["운동과 에너지", "물질", "생명", "지구와 우주", "과학과 사회"],
  도덕: ["자신과의 관계", "타인과의 관계", "사회·공동체와의 관계", "자연과의 관계"],
  음악: ["연주", "감상", "창작"],
  미술: ["미적 체험", "표현", "감상"],
  체육: ["운동", "스포츠", "표현"],
  영어: ["이해(reception)", "표현(production)"],
  실과: ["인간 발달과 주도적 삶", "생활환경과 지속가능한 선택", "기술적 문제해결과 혁신", "지속가능한 기술과 융합", "디지털 사회와 인공지능"],
  "바른 생활": ["나와 우리", "자연과 더불어 사는 삶", "인터넷·AI와 생활"],
  "슬기로운 생활": ["나와 가족", "마을과 우리나라", "봄·여름", "가을·겨울"],
  "즐거운 생활": ["나와 가족", "마을과 우리나라", "봄·여름", "가을·겨울"],
};

function sortAreasByOrder(areas: { id: string; area: string }[], subject: string) {
  const order = AREA_ORDER[subject] ?? [];
  return [...areas].sort((a, b) => {
    const ai = order.indexOf(a.area);
    const bi = order.indexOf(b.area);
    if (ai === -1 && bi === -1) return a.area.localeCompare(b.area, "ko");
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────
export default function CurriculumPage() {
  const tPages = useTranslations("pages");
  const t = useTranslations("curriculum");
  const tc = useTranslations("common");
  const tCls = useTranslations("classification");
  const tSess = useTranslations("sessions");
  const stepLabel = (n: Step) => t(`step${n}`);
  const typeLabel = (type: string) => `${tCls(`${type}.label`)}`;
  const [step, setStep] = useState<Step>(1);
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveGrade, setSaveGrade] = useState("");
  const [saveDate, setSaveDate] = useState(todayStr);
  const [lastDesignAction, setLastDesignAction] = useState<LastDesignAction | null>(null);
  const queryClient = useQueryClient();
  // 저장 목록(조회·정렬·인라인 편집)은 SavedDesignsTab이 자체 상태로 처리한다
  const [mainTab, setMainTab] = useState<"create" | "saved">("create");
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
      if (!r.ok) throw new Error("failed to load saved designs");
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
    refetchInterval: 12000,
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
      .then((d) => setAreas(sortAreasByOrder(d.areas ?? [], selSubject)))
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
  // 5단계 탐구질문은 리스트 자체가 저장/세션 대상(내용이 빈 것은 제외)
  const selectedInquiryQuestions = inquiryQuestions
    .map((q) => ({ type: q.type, content: q.content.trim() }))
    .filter((q) => q.content);

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

  const handleGoStep5 = async () => {
    setLoadingInquiry(true);
    try {
      const data = await callGenerate("inquiry", {
        coreSentences: selectedCoreSentences,
        essentialQuestions: selectedEssentialQuestions,
      });
      if (data?.inquiryQuestions) {
        setInquiryQuestions(data.inquiryQuestions);
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

  // 설계 저장만 수행하고 생성된 설계를 반환(이동/폼 리셋은 호출자가 처리)
  const saveDesign = async (): Promise<SavedInquiryDesign | null> => {
    if (!curriculumData) return null;
    const res = await fetch("/api/unit-design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: saveTitle.trim(),
        curriculumAreaId: curriculumData.id,
        subject: curriculumData.subject,
        gradeRange: curriculumData.gradeRange,
        grade: saveGrade,
        sessionDate: saveDate,
        area: curriculumData.area,
        coreIdea: curriculumData.coreIdea,
        selectedKeywords,
        coreSentences: selectedCoreSentences,
        essentialQuestions: selectedEssentialQuestions,
        inquiryQuestions: selectedInquiryQuestions,
        isActive: sessionIsActive,
        defaultQuestionPublic,
        likesVisibleToPeers: sessionLikesVisible,
        commentsVisibleToPeers: sessionCommentsVisible,
        targetClassValue,
        targetStudentIds: selectedStudentIds,
      }),
    });
    if (!res.ok) {
      toast({ variant: "destructive", description: t("saveFailed") });
      return null;
    }
    const data = await res.json();
    const savedDesign: SavedInquiryDesign | null = data.design ?? null;
    if (savedDesign?.id) {
      queryClient.setQueryData<SavedInquiryDesign[]>(["unit-designs"], (prev) => [
        savedDesign,
        ...(prev ?? []).filter((design) => design.id !== savedDesign.id),
      ]);
    }
    fetchSaved();
    return savedDesign;
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
        setLastDesignAction({ type: "saved", at: d.updatedAt ?? d.createdAt ?? new Date().toISOString() });
        resetSaveForm();
        // 저장 탭은 SavedDesignsTab이 새로 마운트되며 접힌 상태로 시작한다
        setMainTab("saved");
      }
    } finally {
      setIsSaving(false);
    }
  };

  // 저장하고 바로 수업 세션 만들기 — mode: "inquiry"(학생이 직접 작성) / "deploy"(질문 배포)
  const handleSaveAndCreateSession = async (mode: "inquiry" | "deploy") => {
    if (!canSaveDesign || !curriculumData) return;
    setIsSaving(true);
    try {
      const d = await saveDesign();
      if (!d?.id) return;
      const target = buildClassStudentTargetPayload({ targetClassValue, selectedStudentIds, students });
      const res = await fetch(`/api/unit-design/${d.id}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: saveDate,
          topic: saveTitle.trim(),
          defaultQuestionPublic,
          isActive: sessionIsActive,
          likesVisibleToPeers: sessionLikesVisible,
          commentsVisibleToPeers: sessionCommentsVisible,
          ...target,
          ...(mode === "deploy" ? { sharedQuestions: selectedInquiryQuestions } : {}),
        }),
      });
      if (res.ok) {
        const createdSession = await res.json().catch(() => null);
        const actionAt = createdSession?.createdAt ?? new Date().toISOString();
        setLastDesignAction({
          type: "deployed",
          at: actionAt,
        });
        toast({
          variant: "success",
          description: t(mode === "deploy" ? "sessionCreated" : "inquirySessionCreated", {
            date: saveDate,
            subject: curriculumData.subject,
          }),
        });
        resetSaveForm();
        setMainTab("saved");
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ variant: "destructive", description: data.error || t("sessionCreateFailed") });
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
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader title={tPages("teacherCurriculum.title")} description={tPages("teacherCurriculum.description")} />

      {/* 탭: 탐구질문 만들기 / 저장된 탐구질문 */}
      <div className="flex rounded-md border overflow-hidden w-fit">
        <button
          type="button"
          onClick={() => setMainTab("create")}
          className={`px-4 py-2 text-sm font-medium transition-colors ${mainTab === "create" ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
        >
          {t("tabCreate")}
        </button>
        <button
          type="button"
          onClick={() => setMainTab("saved")}
          className={`px-4 py-2 text-sm font-medium border-l transition-colors ${mainTab === "saved" ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
        >
          {t("tabSaved")}{savedList.length > 0 ? ` (${savedList.length})` : ""}
        </button>
      </div>

      {/* 저장 목록 — 조회·정렬·접기·인라인 편집·재배포·삭제 포함 */}
      {mainTab === "saved" && (
        <SavedDesignsTab savedList={savedList} onChanged={fetchSaved} students={students} targetClasses={targetClasses} />
      )}

      {/* 탐구질문 만들기 (단계 진행) */}
      {mainTab === "create" && (
      <>
      <div className="flex gap-1">
        {([1, 2, 3, 4, 5] as Step[]).map((s) => (
          <div
            key={s}
            className={`flex-1 py-1.5 text-center text-xs font-medium rounded transition-colors ${
              step === s
                ? "bg-indigo-600 text-white"
                : step > s
                ? "bg-indigo-100 text-indigo-700"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {s}. {stepLabel(s)}
          </div>
        ))}
      </div>

      {/* ── Step 1: 교육과정 탐색 ── */}
      <Step1CurriculumExplorer
        selGrade={selGrade} setSelGrade={setSelGrade}
        selSubject={selSubject} setSelSubject={setSelSubject}
        selAreaId={selAreaId} setSelAreaId={setSelAreaId}
        areas={areas}
        curriculumData={curriculumData}
        loadingCurriculum={loadingCurriculum}
        loadAreaData={loadAreaData}
        unitNameInput={unitNameInput} setUnitNameInput={setUnitNameInput}
        unitMatches={unitMatches}
        recommendUnit={recommendUnit}
        recommendByUnitName={recommendByUnitName}
        isRecommending={isRecommending}
        recommendMessage={recommendMessage}
        selectedUnitCodes={selectedUnitCodes} setSelectedUnitCodes={setSelectedUnitCodes}
        selectedAchievementCodes={selectedAchievementCodes} setSelectedAchievementCodes={setSelectedAchievementCodes}
        selectedCoreIdeaLines={selectedCoreIdeaLines} setSelectedCoreIdeaLines={setSelectedCoreIdeaLines}
        selectedKnowledge={selectedKnowledge} setSelectedKnowledge={setSelectedKnowledge}
        selectedProcess={selectedProcess} setSelectedProcess={setSelectedProcess}
        selectedValue={selectedValue} setSelectedValue={setSelectedValue}
        getFilteredAchievements={getFilteredAchievements}
        getSelectedAchievements={getSelectedAchievements}
        getFilteredAchievementGroups={getFilteredAchievementGroups}
        handleGoStep2={handleGoStep2}
        loadingKeywords={loadingKeywords}
      />

      {/* ── Step 2: 핵심어 선택 ── */}
      {step >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("step2Title")}</CardTitle>
            <CardDescription>{t("step2Desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {recommendedKeywords.map((kw) => (
                <button
                  key={kw}
                  onClick={() => toggleKeyword(kw)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    selectedKeywords.includes(kw)
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-card text-muted-foreground border-input hover:border-indigo-400"
                  }`}
                >
                  {kw}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                placeholder={t("keywordPlaceholder")}
                value={customKeyword}
                onChange={(e) => setCustomKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomKeyword()}
                className="max-w-xs"
              />
              <Button variant="outline" size="sm" onClick={addCustomKeyword}>{t("addBtn")}</Button>
            </div>

            {selectedKeywords.length > 0 && (
              <div className="rounded-md bg-indigo-50 dark:bg-indigo-950/40 px-4 py-2">
                <span className="text-xs text-indigo-600 font-medium">{t("selectedKeywords")}</span>
                <span className="text-sm text-indigo-800">{selectedKeywords.join(", ")}</span>
              </div>
            )}

            <Button
              onClick={handleGoStep3}
              disabled={loadingSentences || selectedKeywords.length === 0}
              className="w-full"
            >
              {loadingSentences ? t("loadingSentences") : t("nextSentences")}
            </Button>
            {loadingSentences && (
              <AiLoadingProcess kind="unitDesignSentences" />
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: 핵심 문장 ── */}
      {step >= 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("step3Title")}</CardTitle>
            <CardDescription>{t("step3Desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("selectedCount", { count: selectedCoreSentences.length })}</span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCoreSentenceIndices(selectAllIndices(coreSentences))}
                  className="text-indigo-600 hover:text-indigo-800 underline"
                >
                  {t("selectAll")}
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedCoreSentenceIndices([])}
                  className="text-indigo-600 hover:text-indigo-800 underline"
                >
                  {t("deselectAll")}
                </button>
              </span>
            </div>
            {coreSentences.map((s, i) => (
              <div key={i} className="flex gap-2 items-start">
                <input
                  type="checkbox"
                  className="mt-2.5 h-4 w-4 shrink-0 accent-indigo-600"
                  checked={selectedCoreSentenceIndices.includes(i)}
                  onChange={() =>
                    setSelectedCoreSentenceIndices((prev) => toggleSelectedIndex(prev, i))
                  }
                  aria-label={t("selectSentenceAria", { n: i + 1 })}
                />
                <span className="mt-2.5 text-xs font-bold text-indigo-500 shrink-0">{i + 1}</span>
                <textarea
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                  rows={2}
                  value={s}
                  onChange={(e) => {
                    const next = [...coreSentences];
                    next[i] = e.target.value;
                    setCoreSentences(next);
                  }}
                />
              </div>
            ))}
            <Button
              onClick={handleGoStep4}
              disabled={loadingQuestions || selectedCoreSentences.length === 0}
              className="w-full"
            >
              {loadingQuestions ? t("loadingQuestions") : t("nextQuestions")}
            </Button>
            {loadingQuestions && (
              <AiLoadingProcess kind="unitDesignQuestions" />
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 4: 핵심 질문 ── */}
      {step >= 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("step4Title")}</CardTitle>
            <CardDescription>{t("step4Desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("selectedCount", { count: selectedEssentialQuestions.length })}</span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedEssentialQuestionIndices(selectAllIndices(essentialQuestions))}
                  className="text-indigo-600 hover:text-indigo-800 underline"
                >
                  {t("selectAll")}
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedEssentialQuestionIndices([])}
                  className="text-indigo-600 hover:text-indigo-800 underline"
                >
                  {t("deselectAll")}
                </button>
              </span>
            </div>
            {essentialQuestions.map((q, i) => (
              <div key={i} className="flex gap-2 items-start">
                <input
                  type="checkbox"
                  className="mt-2.5 h-4 w-4 shrink-0 accent-indigo-600"
                  checked={selectedEssentialQuestionIndices.includes(i)}
                  onChange={() =>
                    setSelectedEssentialQuestionIndices((prev) => toggleSelectedIndex(prev, i))
                  }
                  aria-label={t("selectQuestionAria", { n: i + 1 })}
                />
                <span className="mt-2.5 text-xs font-bold text-indigo-500 shrink-0">Q{i + 1}</span>
                <textarea
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                  rows={2}
                  value={q}
                  onChange={(e) => {
                    const next = [...essentialQuestions];
                    next[i] = e.target.value;
                    setEssentialQuestions(next);
                  }}
                />
              </div>
            ))}
            <Button
              onClick={handleGoStep5}
              disabled={loadingInquiry || selectedEssentialQuestions.length === 0}
              className="w-full"
            >
              {loadingInquiry ? t("loadingInquiry") : t("nextInquiry")}
            </Button>
            {loadingInquiry && (
              <AiLoadingProcess kind="unitDesignInquiry" />
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 5: 탐구 질문 ── */}
      {step >= 5 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("step5Title")}</CardTitle>
            <CardDescription>{t("step5Desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">{t("selectedCount", { count: selectedInquiryQuestions.length })}</p>
            {/* 평면 편집 리스트 — 드래그·↑↓ 순서 변경, 유형 변경, 내용 수정, 삭제, 추가 */}
            <div className="space-y-2">
              {inquiryQuestions.map((q, i) => (
                <div
                  key={i}
                  draggable
                  onDragStart={() => setDragInquiryIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleInquiryDrop(i)}
                  className={`flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-start ${TYPE_COLOR[q.type] ?? "bg-card"}`}
                >
                  <div className="flex shrink-0 items-center justify-between sm:mt-1 sm:flex-col">
                    <GripVertical className="hidden h-4 w-4 cursor-grab text-muted-foreground sm:block" />
                    <div className="flex sm:flex-col">
                      <button type="button" onClick={() => moveInquiry(i, -1)} disabled={i === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={t("moveUp")}>
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => moveInquiry(i, 1)} disabled={i === inquiryQuestions.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label={t("moveDown")}>
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <select
                    value={q.type}
                    onChange={(e) => updateInquiry(i, { type: e.target.value as InquiryQuestion["type"] })}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground sm:w-auto sm:shrink-0"
                  >
                    <option value="factual">{typeLabel("factual")}</option>
                    <option value="conceptual">{typeLabel("conceptual")}</option>
                    <option value="controversial">{typeLabel("controversial")}</option>
                  </select>
                  <textarea
                    className="w-full flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                    rows={2}
                    value={q.content}
                    onChange={(e) => updateInquiry(i, { content: e.target.value })}
                  />
                  <button type="button" onClick={() => removeInquiry(i)} className="self-end text-sm text-red-500 hover:text-red-700 sm:mt-1 sm:shrink-0 sm:self-auto" aria-label={tc("delete")}>
                    ✕
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <select
                  value={inquiryAddType}
                  onChange={(e) => setInquiryAddType(e.target.value as InquiryQuestion["type"])}
                  className="h-9 shrink-0 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  aria-label={t("addQuestionType")}
                >
                  <option value="factual">{typeLabel("factual")}</option>
                  <option value="conceptual">{typeLabel("conceptual")}</option>
                  <option value="controversial">{typeLabel("controversial")}</option>
                </select>
                <Button variant="outline" size="sm" onClick={() => addInquiry(inquiryAddType)}>＋ {t("addQuestion")}</Button>
              </div>
            </div>

            {/* 저장 — 날짜·학년·교과·주제 결정 후 저장 */}
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-semibold text-foreground">{t("saveInfo")}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.1fr_0.7fr_0.8fr_2.4fr]">
                <div className="space-y-1">
                  <Label>{t("date")}</Label>
                  <DatePicker value={saveDate} onChange={setSaveDate} placeholder={t("pickSessionDate")} />
                </div>
                <div className="space-y-1">
                  <Label>{t("grade")}</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={saveGrade}
                    onChange={(e) => setSaveGrade(e.target.value)}
                  >
                    <option value="">{t("selectGrade")}</option>
                    {(curriculumData?.gradeRange.split("-") ?? []).map((g) => (
                      <option key={g} value={g}>{t("gradeOption", { g })}</option>
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
                    onChange={(e) => setSaveTitle(e.target.value)}
                  />
                </div>
              </div>

              {/* 대상 선택 + 공개 설정 (수업세션 페이지와 동일 구성) */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t("selectTargetsLabel")}</Label>
                  <SessionTargetSelector
                    classes={targetClasses}
                    students={students}
                    targetClassValue={targetClassValue}
                    selectedStudentIds={selectedStudentIds}
                    onTargetClassChange={(v, ids) => { setTargetClassValue(v); setSelectedStudentIds(ids); }}
                    onSelectedStudentIdsChange={setSelectedStudentIds}
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
                    onChange={(next) => {
                      setSessionIsActive(next.isActive);
                      setDefaultQuestionPublic(next.defaultQuestionPublic);
                      setSessionLikesVisible(next.likesVisibleToPeers);
                      setSessionCommentsVisible(next.commentsVisibleToPeers);
                    }}
                  />
                </div>
              </div>

              {/* 세션 추가(탐구질문 수업) / 저장된 탐구질문 탭에 저장 */}
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button
                  onClick={() => handleSaveAndCreateSession("inquiry")}
                  disabled={isSaving || !canSaveDesign}
                  variant="gradient"
                  className="h-11 flex-1 text-base font-semibold"
                >
                  ➕ {t("addSessionBtn")}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSave}
                  disabled={isSaving || !canSaveDesign}
                  className="h-11 flex-1 text-base"
                >
                  💾 {t("saveOnly")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("addSessionHint")}</p>
              {lastDesignAction && (
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground">
                  {t(
                    lastDesignAction.type === "saved"
                      ? "lastSavedAt"
                      : "lastDeployedAt",
                    { time: formatDateTime(lastDesignAction.at) },
                  )}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      </>
      )}
    </div>
  );
}

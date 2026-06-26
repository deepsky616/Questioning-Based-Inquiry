"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SessionVisibilitySettings } from "@/components/shared/SessionVisibilitySettings";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DatePicker from "@/components/shared/DatePicker";
import { PageHeader } from "@/components/shared/PageHeader";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { useTranslations } from "next-intl";
import {
  filterAchievementsByUnitCodes,
  getSelectedAchievementsForAnalysis,
  pickAchievementExplanations,
  selectAllAchievementCodes,
  toggleAchievementCode,
  type Achievement,
} from "@/lib/achievement-selection";
import {
  selectAllContentItems,
  splitCoreIdeaLines,
  toggleContentItem,
} from "@/lib/content-selection";
import {
  filterSelectedInquiryQuestions,
  filterSelectedTexts,
  selectAllIndices,
  toggleSelectedIndex,
} from "@/lib/inquiry-design-selection";

// ── 타입 ──────────────────────────────────────────────────────────────
interface CurriculumUnit {
  unitCode: string;
  unitName: string;
}

interface CurriculumAchievementGroup {
  name: string;
  achievements: Achievement[];
}

interface CurriculumArea {
  id: string;
  subject: string;
  gradeRange: string;
  area: string;
  coreIdea: string;
  knowledgeItems: string[];
  processItems: string[];
  valueItems: string[];
  middleKnowledgeItems: string[];
  middleProcessItems: string[];
  middleValueItems: string[];
  achievements: Achievement[];
  units: CurriculumUnit[];
  achievementExplanations?: Record<string, string>;
  achievementConsiderations?: string[];
  achievementGroups?: CurriculumAchievementGroup[];
}

interface InquiryQuestion {
  type: "factual" | "conceptual" | "controversial";
  content: string;
}

interface SavedInquiryDesign {
  id: string;
  title: string;
  subject: string;
  gradeRange: string;
  grade?: string | null;
  sessionDate?: string | null;
  area: string;
  inquiryQuestions: InquiryQuestion[];
  createdAt?: string;
}

type Step = 1 | 2 | 3 | 4 | 5;

const TYPE_COLOR: Record<string, string> = {
  factual: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-500/30 text-blue-800 dark:text-blue-300",
  conceptual: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-500/30 text-purple-800 dark:text-purple-300",
  controversial: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-500/30 text-orange-800 dark:text-orange-300",
};

const KNOWLEDGE_ITEM_LIMIT = 12;
const PROCESS_ITEM_LIMIT = 12;
const VALUE_ITEM_LIMIT = 8;

// 오늘 날짜(YYYY-MM-DD, 로컬 기준)
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── 교육과정 상수 ──────────────────────────────────────────────────────
const GRADE_RANGES = ["1-2", "3-4", "5-6"] as const;

const SUBJECTS_BY_GRADE: Record<string, string[]> = {
  "1-2": ["국어", "수학", "바른 생활", "슬기로운 생활", "즐거운 생활"],
  "3-4": ["국어", "사회", "도덕", "수학", "과학", "체육", "음악", "미술", "영어"],
  "5-6": ["국어", "사회", "도덕", "수학", "과학", "실과", "체육", "음악", "미술", "영어"],
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
  const stepLabel = (n: Step) => t(`step${n}`);
  const typeLabel = (type: string) => `${tCls(`${type}.label`)}`;
  const typeDesc = (type: string) => tCls(`${type}.desc`);
  const [step, setStep] = useState<Step>(1);
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveGrade, setSaveGrade] = useState("");
  const [saveDate, setSaveDate] = useState(todayStr);
  const queryClient = useQueryClient();
  // 편집 상태(저장 설계 제목·질문 인라인 수정)
  const [editingDesignId, setEditingDesignId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editQuestions, setEditQuestions] = useState<InquiryQuestion[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [mainTab, setMainTab] = useState<"create" | "saved">("create");
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);
  const [sessionDate, setSessionDate] = useState("");
  const [sessionTopic, setSessionTopic] = useState("");
  const [defaultQuestionPublic, setDefaultQuestionPublic] = useState(true);
  const [sessionIsActive, setSessionIsActive] = useState(true);
  const [sessionLikesVisible, setSessionLikesVisible] = useState(true);
  const [sessionCommentsVisible, setSessionCommentsVisible] = useState(true);
  const [selectedSavedQuestionKeys, setSelectedSavedQuestionKeys] = useState<Set<string>>(new Set());
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [createdSessionMessage, setCreatedSessionMessage] = useState("");

  // Step 1 — 학년군·교과·영역 선택 (학년군 → 교과 → 영역 순)
  const [areas, setAreas] = useState<{ id: string; area: string }[]>([]);
  const [selGrade, setSelGrade] = useState("");
  const [selSubject, setSelSubject] = useState("");
  const [selAreaId, setSelAreaId] = useState("");
  const [curriculumData, setCurriculumData] = useState<CurriculumArea | null>(null);
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);
  const [selectedUnitCodes, setSelectedUnitCodes] = useState<string[]>([]);
  const [selectedAchievementCodes, setSelectedAchievementCodes] = useState<string[]>([]);

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
  const [selectedInquiryQuestionIndices, setSelectedInquiryQuestionIndices] = useState<number[]>([]);
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

  const getQuestionKey = (question: InquiryQuestion) => `${question.type}|${question.content.trim()}`;

  const selectedSavedDesign = savedList.find((design) => design.id === selectedSavedId) ?? null;

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
  const selectedInquiryQuestions = filterSelectedInquiryQuestions(
    inquiryQuestions,
    selectedInquiryQuestionIndices
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
        setSelectedInquiryQuestionIndices([]);
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
        setSelectedInquiryQuestionIndices([]);
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
        setSelectedInquiryQuestionIndices(selectAllIndices(data.inquiryQuestions));
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

  const handleSave = async () => {
    if (!curriculumData || !saveTitle.trim() || !saveGrade || !saveDate || selectedInquiryQuestions.length === 0) return;
    setIsSaving(true);
    setCreatedSessionMessage("");
    try {
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
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const savedDesign: SavedInquiryDesign | null = data.design ?? null;
        setSaveTitle("");
        setSaveGrade("");
        setSaveDate(todayStr());
        fetchSaved();
        if (savedDesign?.id) {
          // 새 설계를 캐시에 즉시 반영(다음 폴링/invalidate에서 서버 값으로 확정)
          queryClient.setQueryData<SavedInquiryDesign[]>(["unit-designs"], (prev) => [
            { ...savedDesign, createdAt: new Date().toISOString() },
            ...(prev ?? []).filter((design) => design.id !== savedDesign.id),
          ]);
          setMainTab("saved");
          setSelectedSavedId(savedDesign.id);
          setSelectedSavedQuestionKeys(new Set(savedDesign.inquiryQuestions.map(getQuestionKey)));
        }
      } else {
        toast({ variant: "destructive", description: t("saveFailed") });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSavedQuestion = (question: InquiryQuestion) => {
    setCreatedSessionMessage("");
    const key = getQuestionKey(question);
    setSelectedSavedQuestionKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectSavedDesign = (design: SavedInquiryDesign) => {
    setSelectedSavedId((prev) => (prev === design.id ? null : design.id));
    setCreatedSessionMessage("");
    setSessionTopic("");
    if (design.sessionDate) setSessionDate(design.sessionDate);
    setSelectedSavedQuestionKeys(new Set(design.inquiryQuestions.map(getQuestionKey)));
  };

  const handleCreateSessionFromSaved = async () => {
    if (!selectedSavedDesign || !sessionDate || !sessionTopic.trim() || isCreatingSession) return;
    const selectedQuestions = selectedSavedDesign.inquiryQuestions
      .filter((question) => question.content.trim() && selectedSavedQuestionKeys.has(getQuestionKey(question)))
      .map((question) => ({ type: question.type, content: question.content.trim() }));

    if (selectedQuestions.length === 0) return;

    setIsCreatingSession(true);
    setCreatedSessionMessage("");
    try {
      const res = await fetch(`/api/unit-design/${selectedSavedDesign.id}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: sessionDate,
          topic: sessionTopic.trim(),
          defaultQuestionPublic,
          isActive: sessionIsActive,
          likesVisibleToPeers: sessionLikesVisible,
          commentsVisibleToPeers: sessionCommentsVisible,
          sharedQuestions: selectedQuestions,
        }),
      });
      if (res.ok) {
        setCreatedSessionMessage(t("sessionCreated", { date: sessionDate, subject: selectedSavedDesign.subject }));
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ variant: "destructive", description: data.error || t("sessionCreateFailed") });
      }
    } finally {
      setIsCreatingSession(false);
    }
  };

  const confirm = useConfirm();

  const handleDelete = async (id: string) => {
    if (!(await confirm({ description: t("deleteConfirm"), confirmText: tc("delete"), destructive: true }))) return;
    await fetch(`/api/unit-design/${id}`, { method: "DELETE" });
    if (selectedSavedId === id) {
      setSelectedSavedId(null);
      setSelectedSavedQuestionKeys(new Set());
      setCreatedSessionMessage("");
      setSessionTopic("");
    }
    fetchSaved();
  };

  // ── 저장 설계 인라인 편집(제목·질문 수정/추가/삭제) ──────────────────
  const startEditDesign = (design: SavedInquiryDesign) => {
    setEditingDesignId(design.id);
    setEditTitle(design.title);
    setEditQuestions(design.inquiryQuestions.map((q) => ({ ...q })));
  };
  const cancelEditDesign = () => {
    setEditingDesignId(null);
    setEditTitle("");
    setEditQuestions([]);
  };
  const updateEditQuestion = (index: number, patch: Partial<InquiryQuestion>) => {
    setEditQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  };
  const removeEditQuestion = (index: number) => {
    setEditQuestions((prev) => prev.filter((_, i) => i !== index));
  };
  const addEditQuestion = () => {
    setEditQuestions((prev) => [...prev, { type: "factual", content: "" }]);
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
  const saveEditDesign = async (id: string) => {
    if (!editTitle.trim() || savingEdit) return;
    const cleaned = editQuestions
      .map((q) => ({ type: q.type, content: q.content.trim() }))
      .filter((q) => q.content);
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/unit-design/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim(), inquiryQuestions: cleaned }),
      });
      if (!res.ok) throw new Error();
      // 편집 중이던 설계가 선택/세션생성 대상이면 선택 질문 키도 갱신
      if (selectedSavedId === id) {
        setSelectedSavedQuestionKeys(new Set(cleaned.map(getQuestionKey)));
      }
      cancelEditDesign();
      fetchSaved();
      toast({ variant: "success", description: t("designUpdated") });
    } catch {
      toast({ variant: "destructive", description: t("designUpdateFailed") });
    } finally {
      setSavingEdit(false);
    }
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

      {/* 저장 목록 */}
      {mainTab === "saved" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("savedTitle")}</CardTitle>
            <CardDescription>{t("savedDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {savedList.length === 0 ? (
              <EmptyState icon="📭" title={t("savedEmpty")} />
            ) : (
              <ul className="divide-y rounded-md border">
                {savedList.map((d) => (
                  <li key={d.id} className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => handleSelectSavedDesign(d)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="flex items-center gap-1.5 font-medium text-sm text-foreground">
                          <span className="text-xs text-muted-foreground">{selectedSavedId === d.id ? "▾" : "▸"}</span>
                          <span className="truncate">{d.title}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {d.sessionDate ? `${d.sessionDate} · ` : ""}{d.subject} · {d.grade ? t("gradeLabel", { grade: d.grade }) : t("gradeRangeLabel", { range: d.gradeRange })} · {d.area} · {t("inquiryCount", { count: d.inquiryQuestions.length })}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant={editingDesignId === d.id ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => (editingDesignId === d.id ? cancelEditDesign() : startEditDesign(d))}
                        >
                          {editingDesignId === d.id ? tc("cancel") : tc("edit")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(d.id)}
                        >
                          {tc("delete")}
                        </Button>
                      </div>
                    </div>

                    {/* 인라인 편집: 제목 + 질문 수정/추가/삭제 */}
                    {editingDesignId === d.id && (
                      <div className="mt-3 space-y-3 rounded-md border bg-muted/30 p-3">
                        <div className="space-y-1">
                          <Label>{t("designTitle")}</Label>
                          <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          {editQuestions.map((q, i) => (
                            <div
                              key={i}
                              draggable
                              onDragStart={() => setDragIndex(i)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => handleEditDrop(i)}
                              className="flex items-start gap-2"
                            >
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
                                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
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
                          ))}
                          <Button variant="outline" size="sm" onClick={addEditQuestion}>＋ {t("addQuestion")}</Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => saveEditDesign(d.id)} disabled={savingEdit || !editTitle.trim()}>
                            {savingEdit ? tc("loading") : tc("save")}
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelEditDesign} disabled={savingEdit}>
                            {tc("cancel")}
                          </Button>
                        </div>
                      </div>
                    )}

                    {selectedSavedId === d.id && (
                      <div className="mt-3 space-y-3 rounded-md bg-muted/40 p-3">
                        <div className="space-y-2">
                          {d.inquiryQuestions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t("noSavedInquiry")}</p>
                          ) : (
                            d.inquiryQuestions.map((question, i) => (
                              <label key={`${question.type}-${i}`} className="flex items-start gap-2">
                                <input
                                  type="checkbox"
                                  className="mt-1 shrink-0 accent-indigo-600"
                                  checked={selectedSavedQuestionKeys.has(getQuestionKey(question))}
                                  onChange={() => toggleSavedQuestion(question)}
                                />
                                <span className="text-sm text-foreground">
                                  <span className="font-medium text-indigo-600 mr-1">
                                    [{typeLabel(question.type)}]
                                  </span>
                                  {question.content}
                                </span>
                              </label>
                            ))
                          )}
                        </div>

                        <div className="grid gap-3 border-t pt-3 sm:grid-cols-[1fr_1fr_2fr]">
                          <div className="space-y-1">
                            <Label>{t("sessionDate")}</Label>
                            <DatePicker
                              value={sessionDate}
                              onChange={(v) => {
                                setSessionDate(v);
                                setCreatedSessionMessage("");
                              }}
                              placeholder={t("pickSessionDate")}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>{t("subject")}</Label>
                            <Input value={d.subject} disabled className="bg-muted" />
                          </div>
                          <div className="space-y-1">
                            <Label>{t("topic")}</Label>
                            <Input
                              value={sessionTopic}
                              onChange={(e) => {
                                setSessionTopic(e.target.value);
                                setCreatedSessionMessage("");
                              }}
                              placeholder={t("topicPlaceholder")}
                            />
                          </div>
                        </div>

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
                            setCreatedSessionMessage("");
                          }}
                        />

                        <div className="flex items-center gap-3">
                          <Button
                            onClick={handleCreateSessionFromSaved}
                            disabled={
                              isCreatingSession ||
                              !sessionDate ||
                              !sessionTopic.trim() ||
                              d.inquiryQuestions.length === 0 ||
                              selectedSavedQuestionKeys.size === 0
                            }
                          >
                            {isCreatingSession ? t("creatingSession") : t("createSessionBtn")}
                          </Button>
                        </div>

                        {createdSessionMessage && (
                          <div className="rounded-md border border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-950/40 px-3 py-2 text-sm text-green-800 dark:text-green-300">
                            {createdSessionMessage}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("step1Title")}</CardTitle>
          <CardDescription>{t("step1Desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>{t("gradeRange")}</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selGrade}
                onChange={(e) => setSelGrade(e.target.value)}
              >
                <option value="">{t("selectGradeRange")}</option>
                {GRADE_RANGES.map((g) => (
                  <option key={g} value={g}>{t("gradeRangeOption", { g })}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{t("subject")}</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selSubject}
                onChange={(e) => setSelSubject(e.target.value)}
                disabled={!selGrade}
              >
                <option value="">{t("selectSubject")}</option>
                {(SUBJECTS_BY_GRADE[selGrade] ?? []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>{t("area")}</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selAreaId}
                onChange={(e) => setSelAreaId(e.target.value)}
                disabled={!selSubject}
              >
                <option value="">{t("selectArea")}</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.area}</option>)}
              </select>
            </div>
          </div>

          {loadingCurriculum && <p className="text-sm text-muted-foreground">{t("loadingCurriculum")}</p>}

          {curriculumData && (
            <div className="space-y-3 mt-2">
              {/* 핵심아이디어 (선택 가능) */}
              <div className="rounded-lg border border-indigo-100 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    <p className="text-xs font-semibold text-indigo-600">{t("coreIdea")}</p>
                    <span className="text-xs text-indigo-400">{t("coreIdeaHint")}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCoreIdeaLines(splitCoreIdeaLines(curriculumData.coreIdea))}
                      className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                    >
                      {t("selectAll")}
                    </button>
                    <span className="text-xs text-indigo-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedCoreIdeaLines([])}
                      className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                    >
                      {t("deselectAll")}
                    </button>
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {splitCoreIdeaLines(curriculumData.coreIdea).map((line, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        id={`core-${i}`}
                        checked={selectedCoreIdeaLines.includes(line)}
                        onChange={() =>
                          setSelectedCoreIdeaLines((prev) =>
                            toggleContentItem(prev, line)
                          )
                        }
                        className="mt-0.5 h-3.5 w-3.5 rounded border-indigo-300 text-indigo-600 cursor-pointer flex-shrink-0"
                      />
                      <label htmlFor={`core-${i}`} className="text-sm text-foreground cursor-pointer leading-snug">
                        {line}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 내용 요소 표 (선택 가능) */}
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground w-1/3 border-r">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>{t("knowledge")}</span>
                          <span className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedKnowledge(selectAllContentItems(curriculumData.knowledgeItems, KNOWLEDGE_ITEM_LIMIT))}
                              className="text-xs text-indigo-600 hover:text-indigo-800 underline font-normal"
                            >
                              {t("selectAll")}
                            </button>
                            <span className="text-xs text-muted-foreground font-normal">|</span>
                            <button
                              type="button"
                              onClick={() => setSelectedKnowledge([])}
                              className="text-xs text-indigo-600 hover:text-indigo-800 underline font-normal"
                            >
                              {t("deselectAll")}
                            </button>
                          </span>
                        </div>
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground w-1/3 border-r">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>{t("process")}</span>
                          <span className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedProcess(selectAllContentItems(curriculumData.processItems, PROCESS_ITEM_LIMIT))}
                              className="text-xs text-indigo-600 hover:text-indigo-800 underline font-normal"
                            >
                              {t("selectAll")}
                            </button>
                            <span className="text-xs text-muted-foreground font-normal">|</span>
                            <button
                              type="button"
                              onClick={() => setSelectedProcess([])}
                              className="text-xs text-indigo-600 hover:text-indigo-800 underline font-normal"
                            >
                              {t("deselectAll")}
                            </button>
                          </span>
                        </div>
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground w-1/3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>{t("value")}</span>
                          <span className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedValue(selectAllContentItems(curriculumData.valueItems, VALUE_ITEM_LIMIT))}
                              className="text-xs text-indigo-600 hover:text-indigo-800 underline font-normal"
                            >
                              {t("selectAll")}
                            </button>
                            <span className="text-xs text-muted-foreground font-normal">|</span>
                            <button
                              type="button"
                              onClick={() => setSelectedValue([])}
                              className="text-xs text-indigo-600 hover:text-indigo-800 underline font-normal"
                            >
                              {t("deselectAll")}
                            </button>
                          </span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="align-top">
                      <td className="px-4 py-3 border-r">
                        <ul className="space-y-1.5">
                          {curriculumData.knowledgeItems.slice(0, KNOWLEDGE_ITEM_LIMIT).map((item, i) => (
                            <li key={i} className="flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                id={`k-${i}`}
                                checked={selectedKnowledge.includes(item)}
                                onChange={() =>
                                  setSelectedKnowledge((prev) =>
                                    toggleContentItem(prev, item)
                                  )
                                }
                                className="h-3.5 w-3.5 rounded border-input cursor-pointer flex-shrink-0"
                              />
                              <label htmlFor={`k-${i}`} className="text-foreground cursor-pointer text-xs leading-snug">{item}</label>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-4 py-3 border-r">
                        <ul className="space-y-1.5">
                          {curriculumData.processItems.slice(0, PROCESS_ITEM_LIMIT).map((item, i) => (
                            <li key={i} className="flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                id={`p-${i}`}
                                checked={selectedProcess.includes(item)}
                                onChange={() =>
                                  setSelectedProcess((prev) =>
                                    toggleContentItem(prev, item)
                                  )
                                }
                                className="h-3.5 w-3.5 rounded border-input cursor-pointer flex-shrink-0"
                              />
                              <label htmlFor={`p-${i}`} className="text-foreground cursor-pointer text-xs leading-snug">{item}</label>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-4 py-3">
                        <ul className="space-y-1.5">
                          {curriculumData.valueItems.slice(0, VALUE_ITEM_LIMIT).map((item, i) => (
                            <li key={i} className="flex items-center gap-1.5">
                              <input
                                type="checkbox"
                                id={`v-${i}`}
                                checked={selectedValue.includes(item)}
                                onChange={() =>
                                  setSelectedValue((prev) =>
                                    toggleContentItem(prev, item)
                                  )
                                }
                                className="h-3.5 w-3.5 rounded border-input cursor-pointer flex-shrink-0"
                              />
                              <label htmlFor={`v-${i}`} className="text-foreground cursor-pointer text-xs leading-snug">{item}</label>
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 중학교 연계 내용요소 (선행 확인용) */}
              {(curriculumData.middleKnowledgeItems?.length > 0 ||
                curriculumData.middleProcessItems?.length > 0 ||
                curriculumData.middleValueItems?.length > 0) && (
                <details className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/40">
                  <summary className="px-4 py-2 text-xs font-semibold text-amber-700 cursor-pointer select-none">
                    {t("middleSchoolLink")}
                  </summary>
                  <div className="border-t border-amber-200 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-amber-100">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-medium text-amber-700 w-1/3 border-r border-amber-200">{t("knowledge")}</th>
                          <th className="px-3 py-1.5 text-left font-medium text-amber-700 w-1/3 border-r border-amber-200">{t("process")}</th>
                          <th className="px-3 py-1.5 text-left font-medium text-amber-700 w-1/3">{t("value")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="align-top">
                          <td className="px-3 py-2 border-r border-amber-200">
                            <ul className="space-y-0.5">
                              {curriculumData.middleKnowledgeItems.map((item, i) => (
                                <li key={i} className="text-amber-800">· {item}</li>
                              ))}
                            </ul>
                          </td>
                          <td className="px-3 py-2 border-r border-amber-200">
                            <ul className="space-y-0.5">
                              {curriculumData.middleProcessItems.map((item, i) => (
                                <li key={i} className="text-amber-800">· {item}</li>
                              ))}
                            </ul>
                          </td>
                          <td className="px-3 py-2">
                            <ul className="space-y-0.5">
                              {curriculumData.middleValueItems.map((item, i) => (
                                <li key={i} className="text-amber-800">· {item}</li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              {/* 단원 선택 (단원 데이터가 있는 교과만 표시) */}
              {curriculumData.units.length > 0 && (
                <div className="rounded-lg border border-blue-100 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-950/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-blue-700">{t("unitSelect")}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedUnitCodes(curriculumData.units.map((u) => u.unitCode))}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        {t("selectAll")}
                      </button>
                      <span className="text-xs text-blue-300">|</span>
                      <button
                        onClick={() => setSelectedUnitCodes([])}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        {t("deselectAll")}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-blue-500">{t("unitSelectHint")}</p>
                  <div className="flex flex-wrap gap-2">
                    {curriculumData.units.map((u) => {
                      const selected = selectedUnitCodes.includes(u.unitCode);
                      return (
                        <button
                          key={u.unitCode}
                          onClick={() =>
                            setSelectedUnitCodes((prev) =>
                              selected
                                ? prev.filter((c) => c !== u.unitCode)
                                : [...prev, u.unitCode]
                            )
                          }
                          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                            selected
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-card text-muted-foreground border-input hover:border-blue-400"
                          }`}
                        >
                          {u.unitName}
                        </button>
                      );
                    })}
                  </div>
                  {selectedUnitCodes.length > 0 && (
                    <p className="text-xs text-blue-600">
                      {t("unitsSelected", { count: selectedUnitCodes.length })} ·{" "}
                      {t("achievementsApplied", { count: getFilteredAchievements().length })}
                    </p>
                  )}
                </div>
              )}

              {/* 성취기준 */}
              {curriculumData.achievements.length > 0 && (
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground">
                        {t("achievementSelect")}
                        <span className="ml-2 text-indigo-500 font-normal">
                          {t("selectedRatio", { a: getSelectedAchievements().length, b: getFilteredAchievements().length })}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t("achievementHint")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedAchievementCodes(selectAllAchievementCodes(getFilteredAchievements()))}
                        className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                      >
                        {t("selectAll")}
                      </button>
                      <span className="text-xs text-muted-foreground">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedAchievementCodes([])}
                        className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                      >
                        {t("deselectAll")}
                      </button>
                    </div>
                  </div>

                  {getFilteredAchievements().length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("selectUnitFirst")}</p>
                  ) : (
                    (() => {
                      const groups = getFilteredAchievementGroups();
                      const renderAchievement = (achievement: Achievement) => {
                        const selected = selectedAchievementCodes.includes(achievement.code);
                        return (
                          <label
                            key={`${achievement.code}-${achievement.content}`}
                            className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer transition-colors ${
                              selected
                                ? "border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/40"
                                : "border-border bg-card hover:border-indigo-200"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
                              checked={selected}
                              onChange={() =>
                                setSelectedAchievementCodes((prev) =>
                                  toggleAchievementCode(prev, achievement.code)
                                )
                              }
                            />
                            <span className="text-sm text-foreground leading-snug">
                              <span className="font-mono text-indigo-600 mr-2">{achievement.code}</span>
                              {achievement.content}
                            </span>
                          </label>
                        );
                      };

                      if (groups.length === 0) {
                        return <div className="space-y-2">{getFilteredAchievements().map(renderAchievement)}</div>;
                      }

                      return (
                        <div className="space-y-4">
                          {groups.map((group) => (
                            <div key={group.name} className="space-y-2">
                              <p className="text-xs font-semibold text-indigo-700">
                                {group.name}
                              </p>
                              {group.achievements.map(renderAchievement)}
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  )}
                </div>
              )}

              <Button
                onClick={handleGoStep2}
                disabled={loadingKeywords || getSelectedAchievements().length === 0}
                className="w-full"
              >
                {loadingKeywords ? t("loadingKeywords") : t("nextKeywords")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("selectedCount", { count: selectedInquiryQuestions.length })}</span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedInquiryQuestionIndices(selectAllIndices(inquiryQuestions))}
                  className="text-indigo-600 hover:text-indigo-800 underline"
                >
                  {t("selectAll")}
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedInquiryQuestionIndices([])}
                  className="text-indigo-600 hover:text-indigo-800 underline"
                >
                  {t("deselectAll")}
                </button>
              </span>
            </div>
            {(["factual", "conceptual", "controversial"] as const).map((type) => (
              <div key={type}>
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  {typeLabel(type)}
                  <span className="ml-1.5 font-normal text-muted-foreground/80">· {typeDesc(type)}</span>
                </p>
                <div className="space-y-2">
                  {inquiryQuestions
                    .map((q, i) => ({ ...q, idx: i }))
                    .filter((q) => q.type === type)
                    .map(({ content, idx }) => (
                      <div key={idx} className={`flex gap-2 rounded-lg border px-4 py-3 ${TYPE_COLOR[type]}`}>
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 shrink-0 accent-indigo-600"
                          checked={selectedInquiryQuestionIndices.includes(idx)}
                          onChange={() =>
                            setSelectedInquiryQuestionIndices((prev) =>
                              toggleSelectedIndex(prev, idx)
                            )
                          }
                          aria-label={t("selectType", { type: typeLabel(type) })}
                        />
                        <textarea
                          className="w-full bg-transparent text-sm resize-none outline-none"
                          rows={2}
                          value={content}
                          onChange={(e) => {
                            const next = [...inquiryQuestions];
                            next[idx] = { ...next[idx], content: e.target.value };
                            setInquiryQuestions(next);
                          }}
                        />
                      </div>
                    ))}
                </div>
              </div>
            ))}

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
                  <Label>{t("topic")}</Label>
                  <Input
                    placeholder={t("saveTopicPlaceholder")}
                    value={saveTitle}
                    onChange={(e) => setSaveTitle(e.target.value)}
                  />
                </div>
              </div>
              <Button
                onClick={handleSave}
                disabled={isSaving || !saveTitle.trim() || !saveGrade || !saveDate || selectedInquiryQuestions.length === 0}
              >
                {isSaving ? t("saving") : tc("save")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      </>
      )}
    </div>
  );
}

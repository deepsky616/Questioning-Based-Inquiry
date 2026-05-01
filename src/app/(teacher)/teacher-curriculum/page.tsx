"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<Step, string> = {
  1: "교육과정 탐색",
  2: "핵심어 선택",
  3: "핵심 문장",
  4: "핵심 질문",
  5: "탐구 질문",
};

const TYPE_LABEL: Record<string, string> = {
  factual: "사실적",
  conceptual: "개념적",
  controversial: "논쟁적",
};

const TYPE_COLOR: Record<string, string> = {
  factual: "bg-blue-50 border-blue-200 text-blue-800",
  conceptual: "bg-purple-50 border-purple-200 text-purple-800",
  controversial: "bg-orange-50 border-orange-200 text-orange-800",
};

const KNOWLEDGE_ITEM_LIMIT = 12;
const PROCESS_ITEM_LIMIT = 12;
const VALUE_ITEM_LIMIT = 8;

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
  const [step, setStep] = useState<Step>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [savedList, setSavedList] = useState<{ id: string; title: string; subject: string; gradeRange: string; area: string }[]>([]);
  const [showSaved, setShowSaved] = useState(false);

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
  const [loadingSentences, setLoadingSentences] = useState(false);

  // Step 4 — 핵심 질문
  const [essentialQuestions, setEssentialQuestions] = useState<string[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Step 5 — 탐구 질문
  const [inquiryQuestions, setInquiryQuestions] = useState<InquiryQuestion[]>([]);
  const [loadingInquiry, setLoadingInquiry] = useState(false);

  // 저장 후 세션 공유 관련 상태
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);
  const [sharedIndices, setSharedIndices] = useState<Set<number>>(new Set());
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  useEffect(() => { fetchSaved(); }, []);

  const fetchSaved = () => {
    fetch("/api/unit-design")
      .then((r) => r.json())
      .then((d) => setSavedList(Array.isArray(d) ? d : []))
      .catch(() => {});
  };

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
      const err = await res.json();
      alert(err.error || "AI 생성 오류");
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
        setStep(3);
      }
    } finally {
      setLoadingSentences(false);
    }
  };

  const handleGoStep4 = async () => {
    setLoadingQuestions(true);
    try {
      const data = await callGenerate("questions");
      if (data?.questions) {
        setEssentialQuestions(data.questions);
        setStep(4);
      }
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleGoStep5 = async () => {
    setLoadingInquiry(true);
    try {
      const data = await callGenerate("inquiry");
      if (data?.inquiryQuestions) {
        setInquiryQuestions(data.inquiryQuestions);
        // issue #7: 새 탐구 질문 생성 시 기존 공유 상태 초기화
        setSavedSessionId(null);
        setSharedIndices(new Set());
        setShareSuccess(false);
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
    if (!curriculumData || !saveTitle.trim()) return;
    setIsSaving(true);
    // issue #7: 저장할 때마다 이전 공유 상태 초기화
    setSavedSessionId(null);
    setSharedIndices(new Set());
    setShareSuccess(false);
    try {
      const res = await fetch("/api/unit-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: saveTitle.trim(),
          curriculumAreaId: curriculumData.id,
          subject: curriculumData.subject,
          gradeRange: curriculumData.gradeRange,
          area: curriculumData.area,
          coreIdea: curriculumData.coreIdea,
          selectedKeywords,
          coreSentences,
          essentialQuestions,
          inquiryQuestions,
        }),
      });
      if (res.ok) {
        // issue #6: 응답 JSON에서 sessionId 읽기
        const data = await res.json();
        setSaveTitle("");
        fetchSaved();
        if (data.sessionId) {
          setSavedSessionId(data.sessionId);
        }
      } else {
        alert("저장 실패");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = async () => {
    if (!savedSessionId || isSharing) return;
    // issue #8: 최신 배열에서 선택된 질문 추출, 빈 content 제외
    const selectedOnes = inquiryQuestions
      .filter((q, i) => sharedIndices.has(i) && q.content.trim())
      .map(({ type, content }) => ({ type, content: content.trim() }));

    setIsSharing(true);
    setShareSuccess(false);
    try {
      const res = await fetch(`/api/sessions/${savedSessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedQuestions: selectedOnes }),
      });
      if (res.ok) setShareSuccess(true);
      else alert("공유 실패. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsSharing(false);
    }
  };

  const toggleSharedIndex = (i: number) => {
    setShareSuccess(false); // issue #9: 체크박스 변경 시 성공 상태 초기화
    setSharedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await fetch(`/api/unit-design/${id}`, { method: "DELETE" });
    fetchSaved();
  };

  // ── 렌더 ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">탐구 질문 도우미</h2>
          <p className="text-gray-600">교육과정 분석 → 성취기준 선택 → 핵심어 → 핵심 문장 → 핵심 질문 → 탐구 질문</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowSaved(!showSaved)}>
          저장된 탐구 질문 {savedList.length > 0 ? `(${savedList.length})` : ""}
        </Button>
      </div>

      {/* 저장 목록 */}
      {showSaved && (
        <Card>
          <CardHeader><CardTitle className="text-base">저장된 탐구 질문</CardTitle></CardHeader>
          <CardContent>
            {savedList.length === 0 ? (
              <p className="text-gray-400 text-sm">저장된 탐구 질문이 없습니다.</p>
            ) : (
              <ul className="divide-y">
                {savedList.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-2">
                    <div>
                      <span className="font-medium text-sm">{d.title}</span>
                      <span className="text-xs text-gray-400 ml-2">{d.subject} · {d.gradeRange}학년군 · {d.area}</span>
                    </div>
                    <button onClick={() => handleDelete(d.id)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* 단계 진행 표시 */}
      <div className="flex gap-1">
        {([1, 2, 3, 4, 5] as Step[]).map((s) => (
          <div
            key={s}
            className={`flex-1 py-1.5 text-center text-xs font-medium rounded transition-colors ${
              step === s
                ? "bg-indigo-600 text-white"
                : step > s
                ? "bg-indigo-100 text-indigo-700"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            {s}. {STEP_LABELS[s]}
          </div>
        ))}
      </div>

      {/* ── Step 1: 교육과정 탐색 ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1단계 · 교육과정 탐색</CardTitle>
          <CardDescription>교과 · 학년군 · 영역을 선택하면 2022 개정 교육과정 데이터를 표로 보여줍니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>학년군</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selGrade}
                onChange={(e) => setSelGrade(e.target.value)}
              >
                <option value="">학년군 선택</option>
                {GRADE_RANGES.map((g) => (
                  <option key={g} value={g}>{g}학년군</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>교과</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selSubject}
                onChange={(e) => setSelSubject(e.target.value)}
                disabled={!selGrade}
              >
                <option value="">교과 선택</option>
                {(SUBJECTS_BY_GRADE[selGrade] ?? []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>영역</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selAreaId}
                onChange={(e) => setSelAreaId(e.target.value)}
                disabled={!selSubject}
              >
                <option value="">영역 선택</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.area}</option>)}
              </select>
            </div>
          </div>

          {loadingCurriculum && <p className="text-sm text-gray-400">교육과정 데이터 로딩 중...</p>}

          {curriculumData && (
            <div className="space-y-3 mt-2">
              {/* 핵심아이디어 (선택 가능) */}
              <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    <p className="text-xs font-semibold text-indigo-600">핵심아이디어</p>
                    <span className="text-xs text-indigo-400">수업에서 중점 다룰 항목을 체크하세요</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedCoreIdeaLines(splitCoreIdeaLines(curriculumData.coreIdea))}
                      className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                    >
                      전체 선택
                    </button>
                    <span className="text-xs text-indigo-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedCoreIdeaLines([])}
                      className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                    >
                      전체 해제
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
                      <label htmlFor={`core-${i}`} className="text-sm text-gray-800 cursor-pointer leading-snug">
                        {line}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 내용 요소 표 (선택 가능) */}
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-600 w-1/3 border-r">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>지식·이해</span>
                          <span className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedKnowledge(selectAllContentItems(curriculumData.knowledgeItems, KNOWLEDGE_ITEM_LIMIT))}
                              className="text-xs text-indigo-600 hover:text-indigo-800 underline font-normal"
                            >
                              전체 선택
                            </button>
                            <span className="text-xs text-gray-300 font-normal">|</span>
                            <button
                              type="button"
                              onClick={() => setSelectedKnowledge([])}
                              className="text-xs text-indigo-600 hover:text-indigo-800 underline font-normal"
                            >
                              전체 해제
                            </button>
                          </span>
                        </div>
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600 w-1/3 border-r">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>과정·기능</span>
                          <span className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedProcess(selectAllContentItems(curriculumData.processItems, PROCESS_ITEM_LIMIT))}
                              className="text-xs text-indigo-600 hover:text-indigo-800 underline font-normal"
                            >
                              전체 선택
                            </button>
                            <span className="text-xs text-gray-300 font-normal">|</span>
                            <button
                              type="button"
                              onClick={() => setSelectedProcess([])}
                              className="text-xs text-indigo-600 hover:text-indigo-800 underline font-normal"
                            >
                              전체 해제
                            </button>
                          </span>
                        </div>
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-gray-600 w-1/3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>가치·태도</span>
                          <span className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedValue(selectAllContentItems(curriculumData.valueItems, VALUE_ITEM_LIMIT))}
                              className="text-xs text-indigo-600 hover:text-indigo-800 underline font-normal"
                            >
                              전체 선택
                            </button>
                            <span className="text-xs text-gray-300 font-normal">|</span>
                            <button
                              type="button"
                              onClick={() => setSelectedValue([])}
                              className="text-xs text-indigo-600 hover:text-indigo-800 underline font-normal"
                            >
                              전체 해제
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
                                className="h-3.5 w-3.5 rounded border-gray-300 cursor-pointer flex-shrink-0"
                              />
                              <label htmlFor={`k-${i}`} className="text-gray-700 cursor-pointer text-xs leading-snug">{item}</label>
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
                                className="h-3.5 w-3.5 rounded border-gray-300 cursor-pointer flex-shrink-0"
                              />
                              <label htmlFor={`p-${i}`} className="text-gray-700 cursor-pointer text-xs leading-snug">{item}</label>
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
                                className="h-3.5 w-3.5 rounded border-gray-300 cursor-pointer flex-shrink-0"
                              />
                              <label htmlFor={`v-${i}`} className="text-gray-700 cursor-pointer text-xs leading-snug">{item}</label>
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
                <details className="rounded-lg border border-amber-200 bg-amber-50">
                  <summary className="px-4 py-2 text-xs font-semibold text-amber-700 cursor-pointer select-none">
                    ▶ 중학교 연계 내용요소 (선행 학습 여부 점검용 — 수업에서 직접 다루지 않음)
                  </summary>
                  <div className="border-t border-amber-200 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-amber-100">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-medium text-amber-700 w-1/3 border-r border-amber-200">지식·이해</th>
                          <th className="px-3 py-1.5 text-left font-medium text-amber-700 w-1/3 border-r border-amber-200">과정·기능</th>
                          <th className="px-3 py-1.5 text-left font-medium text-amber-700 w-1/3">가치·태도</th>
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
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-blue-700">단원 선택</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedUnitCodes(curriculumData.units.map((u) => u.unitCode))}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        전체 선택
                      </button>
                      <span className="text-xs text-blue-300">|</span>
                      <button
                        onClick={() => setSelectedUnitCodes([])}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        전체 해제
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-blue-500">수업할 단원을 선택하면 해당 단원의 성취기준만 표시됩니다</p>
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
                              : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                          }`}
                        >
                          {u.unitName}
                        </button>
                      );
                    })}
                  </div>
                  {selectedUnitCodes.length > 0 && (
                    <p className="text-xs text-blue-600">
                      {selectedUnitCodes.length}개 단원 선택됨 ·{" "}
                      {getFilteredAchievements().length}개 성취기준 적용
                    </p>
                  )}
                </div>
              )}

              {/* 성취기준 */}
              {curriculumData.achievements.length > 0 && (
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-gray-600">
                        성취기준 선택
                        <span className="ml-2 text-indigo-500 font-normal">
                          {getSelectedAchievements().length} / {getFilteredAchievements().length}개 선택
                        </span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        선택한 성취기준만 핵심어 추천 분석에 반영됩니다
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedAchievementCodes(selectAllAchievementCodes(getFilteredAchievements()))}
                        className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                      >
                        전체 선택
                      </button>
                      <span className="text-xs text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={() => setSelectedAchievementCodes([])}
                        className="text-xs text-indigo-600 hover:text-indigo-800 underline"
                      >
                        전체 해제
                      </button>
                    </div>
                  </div>

                  {getFilteredAchievements().length === 0 ? (
                    <p className="text-sm text-gray-400">단원을 선택하면 성취기준이 표시됩니다</p>
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
                                ? "border-indigo-200 bg-indigo-50"
                                : "border-gray-200 bg-white hover:border-indigo-200"
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
                            <span className="text-sm text-gray-700 leading-snug">
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
                {loadingKeywords ? "AI 핵심어 분석 중..." : "다음 단계: 핵심어 추천받기 →"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Step 2: 핵심어 선택 ── */}
      {step >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2단계 · 핵심어(개념) 선택</CardTitle>
            <CardDescription>AI가 추천한 핵심어를 선택하거나 직접 추가하세요</CardDescription>
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
                      : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
                  }`}
                >
                  {kw}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="핵심어 직접 추가..."
                value={customKeyword}
                onChange={(e) => setCustomKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomKeyword()}
                className="max-w-xs"
              />
              <Button variant="outline" size="sm" onClick={addCustomKeyword}>추가</Button>
            </div>

            {selectedKeywords.length > 0 && (
              <div className="rounded-md bg-indigo-50 px-4 py-2">
                <span className="text-xs text-indigo-600 font-medium">선택된 핵심어: </span>
                <span className="text-sm text-indigo-800">{selectedKeywords.join(", ")}</span>
              </div>
            )}

            <Button
              onClick={handleGoStep3}
              disabled={loadingSentences || selectedKeywords.length === 0}
              className="w-full"
            >
              {loadingSentences ? "핵심 문장 생성 중..." : "다음 단계: 핵심 문장 생성하기 →"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: 핵심 문장 ── */}
      {step >= 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3단계 · 핵심 문장</CardTitle>
            <CardDescription>학년 수준에 맞게 재진술된 핵심 문장입니다. 직접 수정할 수 있습니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {coreSentences.map((s, i) => (
              <div key={i} className="flex gap-2 items-start">
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
              disabled={loadingQuestions || coreSentences.every((s) => !s.trim())}
              className="w-full"
            >
              {loadingQuestions ? "핵심 질문 도출 중..." : "다음 단계: 핵심 질문 도출하기 →"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step 4: 핵심 질문 ── */}
      {step >= 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4단계 · 핵심 질문</CardTitle>
            <CardDescription>단원 전체를 관통하는 본질적인 질문입니다. 직접 수정할 수 있습니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {essentialQuestions.map((q, i) => (
              <div key={i} className="flex gap-2 items-start">
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
              disabled={loadingInquiry || essentialQuestions.every((q) => !q.trim())}
              className="w-full"
            >
              {loadingInquiry ? "탐구 질문 생성 중..." : "다음 단계: 탐구 질문 구체화하기 →"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Step 5: 탐구 질문 ── */}
      {step >= 5 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">5단계 · 탐구 질문</CardTitle>
            <CardDescription>핵심 질문에 도달하기 위한 사실적·개념적·논쟁적 질문입니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(["factual", "conceptual", "controversial"] as const).map((type) => (
              <div key={type}>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                  {TYPE_LABEL[type]} 질문
                </p>
                <div className="space-y-2">
                  {inquiryQuestions
                    .map((q, i) => ({ ...q, idx: i }))
                    .filter((q) => q.type === type)
                    .map(({ content, idx }) => (
                      <div key={idx} className={`rounded-lg border px-4 py-3 ${TYPE_COLOR[type]}`}>
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

            {/* 저장 */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="탐구 질문 이름 입력 (예: 5학년 과학 생명 탐구)"
                  value={saveTitle}
                  onChange={(e) => {
                    setSaveTitle(e.target.value);
                    // issue #7: 제목 수정 시 이전 세션 상태 초기화
                    setSavedSessionId(null);
                    setSharedIndices(new Set());
                    setShareSuccess(false);
                  }}
                />
                <Button
                  onClick={handleSave}
                  disabled={isSaving || !saveTitle.trim()}
                  className="shrink-0"
                >
                  {isSaving ? "저장 중..." : "저장"}
                </Button>
              </div>

              {/* issue #6: 세션 자동생성 배너 */}
              {savedSessionId && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                  저장 완료! 수업 세션이 자동으로 생성되었습니다.
                </div>
              )}

              {/* 탐구 질문 공유 패널 — 세션이 생성된 경우에만 표시 */}
              {savedSessionId && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-indigo-800">학생에게 탐구 질문 공유</p>
                    <p className="text-xs text-indigo-500 mt-0.5">
                      학생이 질문할 때 참고할 수 있도록 탐구 질문을 선택해서 공유하세요
                    </p>
                  </div>
                  {/* issue #8: 인덱스 기반 선택, 빈 content 제외 */}
                  <div className="space-y-2">
                    {inquiryQuestions.map((q, i) =>
                      q.content.trim() ? (
                        <label
                          key={i}
                          className="flex items-start gap-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 shrink-0 accent-indigo-600"
                            checked={sharedIndices.has(i)}
                            onChange={() => toggleSharedIndex(i)}
                          />
                          <span className="text-sm text-indigo-900">
                            <span className="font-medium text-indigo-600 mr-1">
                              [{q.type === "factual" ? "사실적" : q.type === "conceptual" ? "개념적" : "논쟁적"}]
                            </span>
                            {q.content.trim()}
                          </span>
                        </label>
                      ) : null
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      onClick={handleShare}
                      disabled={isSharing || sharedIndices.size === 0}
                      className="shrink-0"
                    >
                      {isSharing ? "공유 중..." : "학생에게 공유하기"}
                    </Button>
                    {/* issue #9: 성공 상태는 체크박스 변경 시 자동 초기화 */}
                    {shareSuccess && (
                      <span className="text-sm text-green-700 font-medium">공유 완료!</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AiLoadingProcess } from "@/components/shared/AiLoadingProcess";
import {
  filterAchievementsByUnitCodes,
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
  KNOWLEDGE_ITEM_LIMIT,
  PROCESS_ITEM_LIMIT,
  VALUE_ITEM_LIMIT,
  type CurriculumArea,
} from "./types";

// ── 교육과정 상수 ──────────────────────────────────────────────────────
const GRADE_RANGES = ["1-2", "3-4", "5-6"] as const;

const SUBJECTS_BY_GRADE: Record<string, string[]> = {
  "1-2": ["국어", "수학", "바른 생활", "슬기로운 생활", "즐거운 생활"],
  "3-4": ["국어", "사회", "도덕", "수학", "과학", "체육", "음악", "미술", "영어"],
  "5-6": ["국어", "사회", "도덕", "수학", "과학", "실과", "체육", "음악", "미술", "영어"],
};

interface Step1Props {
  selGrade: string; setSelGrade: (v: string) => void;
  selSubject: string; setSelSubject: (v: string) => void;
  selAreaId: string; setSelAreaId: (v: string) => void;
  areas: { id: string; area: string }[];
  curriculumData: CurriculumArea | null;
  loadingCurriculum: boolean;
  loadAreaData: () => void;
  unitNameInput: string; setUnitNameInput: (v: string) => void;
  unitMatches: { unitCode: string; unitName: string }[];
  recommendUnit: (unitCode: string) => void;
  recommendByUnitName: () => void;
  isRecommending: boolean;
  recommendMessage: string;
  selectedUnitCodes: string[]; setSelectedUnitCodes: React.Dispatch<React.SetStateAction<string[]>>;
  selectedAchievementCodes: string[]; setSelectedAchievementCodes: React.Dispatch<React.SetStateAction<string[]>>;
  selectedCoreIdeaLines: string[]; setSelectedCoreIdeaLines: React.Dispatch<React.SetStateAction<string[]>>;
  selectedKnowledge: string[]; setSelectedKnowledge: React.Dispatch<React.SetStateAction<string[]>>;
  selectedProcess: string[]; setSelectedProcess: React.Dispatch<React.SetStateAction<string[]>>;
  selectedValue: string[]; setSelectedValue: React.Dispatch<React.SetStateAction<string[]>>;
  getFilteredAchievements: () => Achievement[];
  getSelectedAchievements: () => Achievement[];
  getFilteredAchievementGroups: () => { name: string; achievements: Achievement[] }[];
  handleGoStep2: () => void;
  loadingKeywords: boolean;
}

/**
 * 탐구질문 마법사 1단계 — 교육과정 탐색.
 * 상태는 전부 페이지가 소유하고, 이 컴포넌트는 표시와 입력 전달만 담당한다
 * (기계적 추출 — 동작 변화 없음).
 */
export function Step1CurriculumExplorer({
  selGrade, setSelGrade,
  selSubject, setSelSubject,
  selAreaId, setSelAreaId,
  areas,
  curriculumData,
  loadingCurriculum,
  loadAreaData,
  unitNameInput, setUnitNameInput,
  unitMatches,
  recommendUnit,
  recommendByUnitName,
  isRecommending,
  recommendMessage,
  selectedUnitCodes, setSelectedUnitCodes,
  selectedAchievementCodes, setSelectedAchievementCodes,
  selectedCoreIdeaLines, setSelectedCoreIdeaLines,
  selectedKnowledge, setSelectedKnowledge,
  selectedProcess, setSelectedProcess,
  selectedValue, setSelectedValue,
  getFilteredAchievements,
  getSelectedAchievements,
  getFilteredAchievementGroups,
  handleGoStep2,
  loadingKeywords,
}: Step1Props) {
  const t = useTranslations("curriculum");

  return (
    <>
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
                  {/* 단원명 자유 입력 → AI 자동 추천(교과서 단원명 기반) */}
                  <div className="rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-950/40 p-4 space-y-2">
                    <div>
                      <p className="text-xs font-semibold text-blue-700">{t("unitNameTitle")}</p>
                      <p className="text-xs text-blue-500">{t("unitNameDesc")}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={unitNameInput}
                        onChange={(e) => setUnitNameInput(e.target.value)}
                        placeholder={t("unitNamePlaceholder")}
                        className="h-9 min-w-[200px] flex-1 rounded-md border border-input bg-background px-3 text-sm"
                      />
                      <Button size="sm" onClick={recommendByUnitName} disabled={isRecommending || !unitNameInput.trim()}>
                        {isRecommending ? t("recommending") : t("recommendByUnitNameBtn")}
                      </Button>
                    </div>
                    {isRecommending && (
                      <AiLoadingProcess kind="unitDesignRecommendation" compact />
                    )}
                    {/* 교육과정 단원명과 정확히 일치하면 데이터 기반 정확 추천도 제공 */}
                    {unitNameInput.trim() && unitMatches.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-blue-500">{t("exactUnitMatch")}</span>
                        {unitMatches.map((u) => (
                          <button
                            key={u.unitCode}
                            type="button"
                            onClick={() => recommendUnit(u.unitCode)}
                            className="rounded-full border border-blue-400 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-200"
                          >
                            {u.unitName} · {t("recommendByUnit")}
                          </button>
                        ))}
                      </div>
                    )}
                    {recommendMessage && <p className="text-xs font-medium text-blue-700">{recommendMessage}</p>}
                  </div>

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
                  <div className="space-y-3 lg:hidden">
                    {([
                      [t("knowledge"), curriculumData.knowledgeItems.slice(0, KNOWLEDGE_ITEM_LIMIT), selectedKnowledge, setSelectedKnowledge, KNOWLEDGE_ITEM_LIMIT, "k-mobile"],
                      [t("process"), curriculumData.processItems.slice(0, PROCESS_ITEM_LIMIT), selectedProcess, setSelectedProcess, PROCESS_ITEM_LIMIT, "p-mobile"],
                      [t("value"), curriculumData.valueItems.slice(0, VALUE_ITEM_LIMIT), selectedValue, setSelectedValue, VALUE_ITEM_LIMIT, "v-mobile"],
                    ] as const).map(([label, items, selected, setSelected, limit, prefix]) => (
                      <div key={prefix} className="rounded-lg border bg-card">
                        <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                          <span className="text-sm font-semibold text-foreground">{label}</span>
                          <span className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelected(selectAllContentItems(items, limit))}
                              className="text-xs font-normal text-indigo-600 underline hover:text-indigo-800"
                            >
                              {t("selectAll")}
                            </button>
                            <span className="text-xs font-normal text-muted-foreground">|</span>
                            <button
                              type="button"
                              onClick={() => setSelected([])}
                              className="text-xs font-normal text-indigo-600 underline hover:text-indigo-800"
                            >
                              {t("deselectAll")}
                            </button>
                          </span>
                        </div>
                        <ul className="space-y-1.5 px-3 py-3">
                          {items.map((item, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                id={`${prefix}-${i}`}
                                checked={selected.includes(item)}
                                onChange={() => setSelected((prev) => toggleContentItem(prev, item))}
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-input"
                              />
                              <label htmlFor={`${prefix}-${i}`} className="cursor-pointer text-xs leading-snug text-foreground">{item}</label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  <div className="hidden rounded-lg border overflow-hidden lg:block">
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
                  {loadingKeywords && (
                    <AiLoadingProcess kind="unitDesignKeywords" />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
    </>
  );
}

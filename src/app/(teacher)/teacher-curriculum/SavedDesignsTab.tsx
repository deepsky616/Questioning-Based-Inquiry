"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GripVertical, ChevronUp, ChevronDown } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DatePicker from "@/components/shared/DatePicker";
import { SessionVisibilitySettings } from "@/components/shared/SessionVisibilitySettings";
import { SessionTargetSelector } from "@/components/shared/SessionTargetSelector";
import { DesignReferenceView } from "@/components/shared/DesignReferenceView";
import { EmptyState } from "@/components/shared/EmptyState";
import { CollapseChevron } from "@/components/shared/SectionToggle";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { filterSortSavedDesigns } from "@/lib/saved-designs";
import {
  buildClassStudentTargetPayload,
  type SessionTargetClass,
  type SessionTargetStudent,
} from "@/lib/session-targeting";
import { todayStr, type InquiryQuestion, type SavedInquiryDesign } from "./types";

interface SavedDesignsTabProps {
  savedList: SavedInquiryDesign[];
  /** 삭제·수정·재배포 후 저장 목록을 최신화한다 */
  onChanged: () => void | Promise<unknown>;
  students: SessionTargetStudent[];
  targetClasses: SessionTargetClass[];
}

/**
 * 저장된 탐구질문 탭.
 * 조회(날짜·학년·교과·영역·단원)·정렬, 항목별 접기, 참고자료 미리보기,
 * 인라인 편집(제목·날짜·공개설정·배포대상·핵심아이디어·문장·질문)과
 * 저장/재배포/삭제를 자체 상태로 처리한다.
 */
export function SavedDesignsTab({ savedList, onChanged, students, targetClasses }: SavedDesignsTabProps) {
  const t = useTranslations("curriculum");
  const tc = useTranslations("common");
  const tCls = useTranslations("classification");
  const tSess = useTranslations("sessions");
  const confirm = useConfirm();
  const { toast } = useToast();
  const typeLabel = (type: string) => `${tCls(`${type}.label`)}`;

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
  const [savingEdit, setSavingEdit] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [addType, setAddType] = useState<InquiryQuestion["type"]>("factual");

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
    setEditTargetClassValue(design.targetClassValue ?? "all");
    setEditSelectedStudentIds([...(design.targetStudentIds ?? [])]);
    setEditCoreIdea(design.coreIdea ?? "");
    setEditCoreSentences([...(design.coreSentences ?? [])]);
    setEditEssentialQuestions([...(design.essentialQuestions ?? [])]);
    setEditQuestions(design.inquiryQuestions.map((q) => ({ ...q })));
  };
  const cancelEditDesign = () => {
    setEditingDesignId(null);
    setEditTitle("");
    setEditCoreIdea("");
    setEditCoreSentences([]);
    setEditEssentialQuestions([]);
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
      .map((q) => ({ type: q.type, content: q.content.trim() }))
      .filter((q) => q.content);
    const cleanedSentences = editCoreSentences.map((s) => s.trim()).filter(Boolean);
    const cleanedEssential = editEssentialQuestions.map((s) => s.trim()).filter(Boolean);
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
        inquiryQuestions: cleaned,
      }),
    });
    return { ok: res.ok, cleaned };
  };

  // 저장만(설계 업데이트 — 라이브 참고자료에 즉시 반영)
  const saveEditDesign = async (id: string) => {
    if (!editTitle.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      const { ok } = await patchEditDesign(id);
      if (!ok) throw new Error();
      cancelEditDesign();
      onChanged();
      toast({ variant: "success", description: t("designRedeployed") });
    } catch {
      toast({ variant: "destructive", description: t("designUpdateFailed") });
    } finally {
      setSavingEdit(false);
    }
  };

  // 저장하고 수업세션에 재배포(탐구질문 수업 세션 생성)
  const redeployEditDesign = async (id: string) => {
    if (!editTitle.trim() || !editDate || savingEdit) return;
    setSavingEdit(true);
    try {
      const { ok } = await patchEditDesign(id);
      if (!ok) throw new Error();
      const target = buildClassStudentTargetPayload({
        targetClassValue: editTargetClassValue,
        selectedStudentIds: editSelectedStudentIds,
        students,
      });
      const res = await fetch(`/api/unit-design/${id}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: editDate,
          topic: editTitle.trim(),
          defaultQuestionPublic: editVisibility.defaultQuestionPublic,
          isActive: editVisibility.isActive,
          likesVisibleToPeers: editVisibility.likesVisibleToPeers,
          commentsVisibleToPeers: editVisibility.commentsVisibleToPeers,
          ...target,
          // sharedQuestions 생략 → 탐구질문 수업 세션
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast({ variant: "destructive", description: d.error || t("sessionCreateFailed") });
        return;
      }
      cancelEditDesign();
      onChanged();
      toast({ variant: "success", description: t("inquirySessionCreated", { date: editDate, subject: editTitle.trim() }) });
    } catch {
      toast({ variant: "destructive", description: t("designUpdateFailed") });
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
              {([
                [savedFilterDate, setSavedFilterDate, savedFilterOptions.dates, t("savedFilterAllDates")],
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
            {visibleSaved.map((d) => (
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
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[d.sessionDate, d.subject, d.area].filter(Boolean).join(" · ")}
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
                          <button type="button" onClick={() => removeTextItem(setEditCoreSentences, i)} className="mt-1 shrink-0 text-sm text-red-500 hover:text-red-700" aria-label={tc("delete")}>✕</button>
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
                          <button type="button" onClick={() => removeTextItem(setEditEssentialQuestions, i)} className="mt-1 shrink-0 text-sm text-red-500 hover:text-red-700" aria-label={tc("delete")}>✕</button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => addTextItem(setEditEssentialQuestions)}>＋ {t("addItem")}</Button>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={() => saveEditDesign(d.id)} disabled={savingEdit || !editTitle.trim()}>
                        💾 {savingEdit ? tc("loading") : tc("save")}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => redeployEditDesign(d.id)} disabled={savingEdit || !editTitle.trim() || !editDate}>
                        📤 {t("redeployToSession")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEditDesign} disabled={savingEdit}>
                        {tc("cancel")}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t("redeployHint")}</p>
                  </div>
                )}

                {selectedSavedId === d.id && (
                  <div className="mt-3 rounded-md border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-950/30 p-3">
                    {/* 학생에게 전달되는 참고자료 미리보기(수정·재배포는 위 '수정' 버튼) */}
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
                        inquiryQuestions: d.inquiryQuestions,
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

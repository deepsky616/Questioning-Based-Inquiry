"use client";

import { useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SessionReferencePanel } from "@/components/shared/SessionReferencePanel";
import { CollapseChevron } from "@/components/shared/SectionToggle";
import { groupSharedQuestions } from "@/lib/shared-questions";
import {
  buildSessionLabel,
  filterSessions,
  getSessionFilterOptions,
  sortSessionsAsc,
  sortSessionsDesc,
} from "@/lib/sessions";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { useToast } from "@/components/ui/use-toast";
import { formatDateTime } from "@/lib/datetime";
import { QuestionSequencePanel } from "./QuestionSequencePanel";
import type { QuestionSession } from "./types";

interface DeployedDesignListProps {
  sessions: QuestionSession[];
  /** 배포 삭제·재배포 후 세션 목록을 최신화한다 */
  onChanged: () => void | Promise<unknown>;
}

/**
 * 배포한 탐구설계 목록 (탐구 설계 탭).
 * 조회(날짜·교과·주제)와 정렬, 항목별 접기 토글, 내용별 묶음, 참고자료,
 * 인라인 수정(재배포), 삭제까지 자체 상태로 처리한다.
 */
export function DeployedDesignList({ sessions, onChanged }: DeployedDesignListProps) {
  const t = useTranslations("teacherQ");
  const tc = useTranslations("common");
  const tSess = useTranslations("sessions");
  const confirm = useConfirm();
  const { toast } = useToast();

  // "수정"을 누른 세션(인라인 패널 열림)
  const [editDeploySessionId, setEditDeploySessionId] = useState<string | null>(null);
  const [deletingDeployId, setDeletingDeployId] = useState<string | null>(null);
  // 배포 항목별 접기 토글(기본 닫힘)
  const [openDeploy, setOpenDeploy] = useState<Set<string>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const toggleDeploy = (id: string) => {
    setOpenDeploy((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setOpenGroups((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };
  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // 조회(필터)·정렬 — 수업세션 목록과 동일한 방식
  const [deployFilterDate, setDeployFilterDate] = useState("");
  const [deployFilterSubject, setDeployFilterSubject] = useState("");
  const [deployFilterTopic, setDeployFilterTopic] = useState("");
  const [deploySort, setDeploySort] = useState<"desc" | "asc">("desc");

  const handleDeleteDeploy = async (sessionId: string) => {
    if (!(await confirm({ description: t("deleteDeployConfirm"), confirmText: tc("delete"), destructive: true }))) return;
    setDeletingDeployId(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/publish-questions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) throw new Error();
      if (editDeploySessionId === sessionId) setEditDeploySessionId(null);
      await onChanged();
    } catch {
      toast({ variant: "destructive", description: t("deleteFailed") });
    } finally {
      setDeletingDeployId(null);
    }
  };

  const deployedAll = sessions.filter((s) => (s.sharedQuestions?.length ?? 0) > 0);
  if (deployedAll.length === 0) return null;
  const deployOptions = getSessionFilterOptions(deployedAll);
  const deployFiltered = filterSessions(deployedAll, {
    date: deployFilterDate || undefined,
    subject: deployFilterSubject || undefined,
    topic: deployFilterTopic || undefined,
  });
  const deployed = deploySort === "asc" ? sortSessionsAsc(deployFiltered) : sortSessionsDesc(deployFiltered);
  const hasDeployFilter = Boolean(deployFilterDate || deployFilterSubject || deployFilterTopic);
  const getPublishedAt = (session: QuestionSession) =>
    session.sharedQuestions?.find((q) => q.publishedAt)?.publishedAt ?? session.createdAt;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5 text-base font-semibold leading-none tracking-tight text-foreground">
          <span>📋</span>
          {t("deployedTitle")}
          <span className="text-xs font-normal text-muted-foreground">{t("listCountSuffix", { count: deployedAll.length })}</span>
        </div>
        {/* 조회(필터, 왼쪽) · 정렬(오른쪽) — 수업세션 목록과 동일 */}
        <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-4 lg:gap-y-2">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <span className="col-span-2 text-xs font-medium text-muted-foreground sm:col-span-1">{tSess("filterLabel")}</span>
            <Select value={deployFilterDate || "__all__"} onValueChange={(v) => setDeployFilterDate(v === "__all__" ? "" : v)}>
              <SelectTrigger className="h-9 w-full bg-background text-sm sm:w-32"><SelectValue placeholder={tSess("allDates")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{tSess("allDates")}</SelectItem>
                {deployOptions.dates.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={deployFilterSubject || "__all__"} onValueChange={(v) => setDeployFilterSubject(v === "__all__" ? "" : v)}>
              <SelectTrigger className="h-9 w-full bg-background text-sm sm:w-28"><SelectValue placeholder={tSess("allSubjects")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{tSess("allSubjects")}</SelectItem>
                {deployOptions.subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={deployFilterTopic || "__all__"} onValueChange={(v) => setDeployFilterTopic(v === "__all__" ? "" : v)}>
              <SelectTrigger className="h-9 w-full bg-background text-sm sm:w-36"><SelectValue placeholder={tSess("allTopics")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{tSess("allTopics")}</SelectItem>
                {deployOptions.topics.map((tp) => <SelectItem key={tp} value={tp}>{tp}</SelectItem>)}
              </SelectContent>
            </Select>
            {hasDeployFilter && (
              <button
                type="button"
                onClick={() => { setDeployFilterDate(""); setDeployFilterSubject(""); setDeployFilterTopic(""); }}
                className="h-9 px-1 text-left text-xs font-medium text-indigo-600 hover:text-indigo-800 sm:text-center"
              >
                {tc("reset")}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 lg:ml-auto">
            <span className="text-xs font-medium text-muted-foreground">{tSess("sortLabel")}</span>
            <div className="flex rounded-md border overflow-hidden h-9">
              {(["desc", "asc"] as const).map((v, i) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDeploySort(v)}
                  className={`px-3 text-xs font-medium transition-colors ${i > 0 ? "border-l" : ""} ${
                    deploySort === v ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {v === "desc" ? tSess("sortDesc") : tSess("sortAsc")}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {t("deployedDesc")}
      </p>
      <div className="mt-3 space-y-2">
        {deployed.map((s) => {
          const isEditing = editDeploySessionId === s.id;
          const publishedAt = getPublishedAt(s);
          return (
            <div key={s.id} className="rounded-lg border bg-background">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                <button type="button" onClick={() => toggleDeploy(s.id)} aria-expanded={openDeploy.has(s.id)} className="min-w-0 flex-1 text-left">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <CollapseChevron open={openDeploy.has(s.id)} />
                    <span className="truncate">{buildSessionLabel(s.date, s.subject, s.topic)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("statQuestions", { count: s.sharedQuestions?.length ?? 0 })}
                    {" · "}
                    {s.isActive ? t("activeOn") : t("activeOff")}
                    {t("likesByline", { v: s.likesVisibleToPeers ? t("publicWord") : t("privateWord") })}
                    {t("commentsByline", { v: s.commentsVisibleToPeers ? t("publicWord") : t("privateWord") })}
                  </p>
                  {publishedAt && (
                    <p className="mt-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-300">
                      {t("deployedAt", { time: formatDateTime(publishedAt) })}
                    </p>
                  )}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  {/* 아이콘 버튼(관리 열 공통 패턴) — 편집 중엔 X(닫기)로 전환 */}
                  <button
                    type="button"
                    onClick={() => setEditDeploySessionId(isEditing ? null : s.id)}
                    className={`rounded-md border p-1.5 ${
                      isEditing
                        ? "border-border bg-muted text-foreground hover:bg-muted/70"
                        : "border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                    }`}
                    title={isEditing ? tc("close") : tc("edit")}
                    aria-label={isEditing ? tc("close") : tc("edit")}
                  >
                    {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    disabled={deletingDeployId === s.id}
                    onClick={() => handleDeleteDeploy(s.id)}
                    className="rounded-md border border-red-200 p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50"
                    title={deletingDeployId === s.id ? t("deleting") : tc("delete")}
                    aria-label={tc("delete")}
                  >
                    <Trash2 className={`h-3.5 w-3.5 ${deletingDeployId === s.id ? "animate-pulse" : ""}`} />
                  </button>
                </div>
              </div>
              {/* 배포된 질문 미리보기 (접기 토글 — 기본 닫힘) */}
              {!isEditing && openDeploy.has(s.id) && (
                <ol className="list-decimal space-y-1 border-t px-7 py-2 text-sm text-muted-foreground">
                  {(s.sharedQuestions ?? []).slice(0, 5).map((q, i) => (
                    <li key={i} className="line-clamp-1">{q.content}</li>
                  ))}
                  {(s.sharedQuestions?.length ?? 0) > 5 && (
                    <li className="list-none text-xs">{t("moreCount", { count: (s.sharedQuestions?.length ?? 0) - 5 })}</li>
                  )}
                </ol>
              )}
              {/* 내용별 묶음 (contentGroup별, 그룹 2개 이상일 때만) */}
              {!isEditing && openDeploy.has(s.id) && (() => {
                const grouped = groupSharedQuestions(s.sharedQuestions ?? []);
                if (grouped.length <= 1) return null;
                return (
                  <div className="border-t px-3 pb-3 pt-2">
                    <button
                      type="button"
                      onClick={() => toggleGroup(s.id)}
                      aria-expanded={openGroups.has(s.id)}
                      className="mb-2 flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted/50 hover:text-primary"
                    >
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span>{t("groupTitle")}</span>
                        <span className="text-xs font-normal text-muted-foreground">{t("groupDesc")}</span>
                      </span>
                      <CollapseChevron open={openGroups.has(s.id)} className="shrink-0" />
                    </button>
                    {openGroups.has(s.id) && (
                      <div className="grid gap-3 md:grid-cols-2">
                        {grouped.map(({ group, questions }) => (
                          <div key={group} className="rounded-lg border bg-white p-3 dark:bg-card">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <h3 className="text-sm font-semibold text-foreground">{group}</h3>
                              <span className="text-xs text-muted-foreground">{t("groupCount", { count: questions.length })}</span>
                            </div>
                            <ul className="space-y-1.5 text-xs text-muted-foreground">
                              {questions.map((question, index) => (
                                <li key={`${question.content}-${index}`}>
                                  <p className="line-clamp-2 font-medium text-foreground/80">
                                    {question.priority}. {question.content}
                                  </p>
                                  {/* 이 대표 질문에 묶인 학생 원본 질문들 */}
                                  {(question.mergedFrom?.length ?? 0) > 1 && (
                                    <ul className="mt-0.5 space-y-0.5 border-l-2 border-emerald-200 pl-2 dark:border-emerald-500/30">
                                      {question.mergedFrom!.map((original, i) => (
                                        <li key={`${original}-${i}`} className="break-words">· {original}</li>
                                      ))}
                                    </ul>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* 배포한 수업의 참고자료(탐구설계 연결 시에만 표시) */}
              {!isEditing && openDeploy.has(s.id) && (
                <div className="border-t px-3 pb-3 pt-2">
                  <SessionReferencePanel sessionId={s.id} />
                </div>
              )}
              {/* 수정: 탐구설계 패널을 다시 열어 수정 후 재배포 */}
              {isEditing && (
                <div className="border-t p-3">
                  <QuestionSequencePanel
                    sessionId={s.id}
                    subject={s.subject}
                    topic={s.topic}
                    editMode
                    initialQuestions={(s.sharedQuestions ?? []).map((q, i) => ({
                      id: `deployed-${i}`,
                      type: q.type || "student",
                      content: q.content,
                      source: q.source === "teacher" ? "teacher" : "student",
                      contentGroup: q.contentGroup || t("groupDefault"),
                      priority: q.priority ?? i + 1,
                      lessonPhase: t("phaseDefault"),
                      rationale: "",
                      ...(q.mergedFrom && q.mergedFrom.length > 0 ? { mergedFrom: q.mergedFrom } : {}),
                    }))}
                    onDeployed={onChanged}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

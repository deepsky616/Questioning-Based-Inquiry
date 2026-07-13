"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import DatePicker from "@/components/shared/DatePicker";
import { useToast } from "@/components/ui/use-toast";
import { formatDateTime } from "@/lib/datetime";
import { buildSessionLabel } from "@/lib/sessions";
import { buildTargetLabel } from "@/lib/session-targeting";
import type { QuestionSession } from "./types";

interface SessionParticipationStudent {
  id: string;
  name: string;
  grade: string | null;
  className: string | null;
  studentNumber: string | null;
  hasQuestion: boolean;
}

interface SessionParticipationResponse {
  students: SessionParticipationStudent[];
}

interface SessionReminderResponse {
  created: number;
  refreshed: number;
  totalMissing: number;
}

interface TeacherSessionRowProps {
  session: QuestionSession;
  isHighlighted?: boolean;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, current: boolean) => void;
  onTogglePublic: (id: string, current: boolean) => void;
  onToggleLikes: (id: string, current: boolean) => void;
  onToggleCommentsVisible: (id: string, current: boolean) => void;
  onEditSave: (id: string, patch: { date: string; subject?: string; topic: string }) => Promise<boolean>;
}

export function TeacherSessionRow({
  session,
  isHighlighted = false,
  onDelete,
  onToggleActive,
  onTogglePublic,
  onToggleLikes,
  onToggleCommentsVisible,
  onEditSave,
}: TeacherSessionRowProps) {
  const t = useTranslations("sessions");
  const tc = useTranslations("common");
  const tSeq = useTranslations("sequencePanel");
  const { toast } = useToast();
  const isDesignSession = !!session.unitDesignId;
  const rowRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState(session.date);
  const [editSubject, setEditSubject] = useState(session.subject);
  const [editTopic, setEditTopic] = useState(session.topic);
  const [editArea, setEditArea] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [showMissingStudents, setShowMissingStudents] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const missingCount = session.participation?.missing ?? 0;
  const { data: participationDetail, isLoading: isLoadingParticipation, isError: isParticipationError } = useQuery<SessionParticipationResponse>({
    queryKey: ["session-participation", session.id],
    queryFn: async () => {
      const res = await fetch(`/api/sessions/${session.id}/participation`);
      if (!res.ok) throw new Error("수업 참여 현황을 불러오지 못했습니다");
      return res.json();
    },
    enabled: showMissingStudents,
    staleTime: 30000,
  });
  const missingStudents = (participationDetail?.students ?? []).filter((student) => !student.hasQuestion);

  useEffect(() => {
    if (!isHighlighted) return;
    rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isHighlighted]);

  const handleSendReminder = async () => {
    if (!session.isActive || missingCount <= 0 || sendingReminder) return;
    setSendingReminder(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/remind`, { method: "POST" });
      if (!res.ok) throw new Error("failed to send reminder");
      const result = (await res.json()) as SessionReminderResponse;
      const notified = result.created + result.refreshed;
      if (notified > 0) {
        toast({ variant: "success", description: t("reminderSent", { count: notified }) });
      } else {
        toast({ variant: "success", description: t("missingStudentsEmpty") });
      }
    } catch {
      toast({ variant: "destructive", description: t("reminderFailed") });
    } finally {
      setSendingReminder(false);
    }
  };

  const openEdit = () => {
    setEditDate(session.date);
    setEditSubject(session.subject);
    setEditTopic(session.topic);
    setEditing(true);
    if (isDesignSession) {
      fetch(`/api/sessions/${session.id}/design-context`)
        .then((res) => res.json())
        .then((data) => setEditArea(data?.context?.area ?? ""))
        .catch(() => {});
    }
  };

  const saveEdit = async () => {
    if (!editDate || !editTopic.trim() || (!isDesignSession && !editSubject.trim())) return;
    setSavingEdit(true);
    const ok = await onEditSave(session.id, {
      date: editDate,
      topic: editTopic.trim(),
      ...(isDesignSession ? {} : { subject: editSubject.trim() }),
    });
    setSavingEdit(false);
    if (ok) setEditing(false);
  };

  return (
    <div
      ref={rowRef}
      data-session-id={session.id}
      aria-current={isHighlighted ? "true" : undefined}
      className={`scroll-mt-24 transition-colors ${
        isHighlighted
          ? "bg-primary/10 ring-2 ring-inset ring-primary/40"
          : session.isActive
            ? "bg-card"
            : "bg-muted/40"
      }`}
    >
      <div className={`flex flex-col gap-3 px-4 py-3 transition-colors lg:flex-row lg:items-center lg:justify-between ${session.isActive ? "hover:bg-muted/50" : "hover:bg-muted"}`}>
        <div className="flex min-w-0 items-start gap-3 lg:items-center">
          <span className={`h-2 w-2 shrink-0 rounded-full ${session.isActive ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`} />
          <div className="min-w-0">
            <p className={`line-clamp-2 text-sm font-medium lg:truncate ${session.isActive ? "text-foreground" : "text-muted-foreground"}`}>
              {buildSessionLabel(session.date, session.subject, session.topic)}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              {!session.isActive && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{t("badgeInactive")}</span>
              )}
              {!session.defaultQuestionPublic && (
                <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">{t("badgePrivateQ")}</span>
              )}
              {!session.likesVisibleToPeers && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">{t("badgePrivateLikes")}</span>
              )}
              {!session.commentsVisibleToPeers && (
                <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">{t("badgePrivateComments")}</span>
              )}
              <span className="inline-flex items-center rounded bg-indigo-600 px-1.5 py-0.5 text-xs font-bold text-white">
                {isDesignSession
                  ? t("badgeInquiryQuestionClass")
                  : t("badgeQuickQuestionClass")}
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {buildTargetLabel({
                  targetType: session.targetType,
                  targetGrade: session.targetGrade,
                  targetClassName: session.targetClassName,
                  targetStudentName: session.targetStudent?.name,
                })}
              </span>
              {session.createdAt && (
                <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200">
                  {t("createdAt", { time: formatDateTime(session.createdAt) })}
                </span>
              )}
            </div>
            {session.participation && (
              <div className="mt-2 w-full max-w-xs rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                {session.participation.total > 0 ? (
                  <>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-200">
                        {t("participationSummary", {
                          submitted: session.participation.submitted,
                          total: session.participation.total,
                        })}
                      </span>
                      <span className="text-emerald-700/80 dark:text-emerald-200/80">
                        {t("participationMissing", { missing: session.participation.missing })}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/70">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, session.participation.percent))}%` }}
                      />
                    </div>
                    {missingCount > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setShowMissingStudents((value) => !value)}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
                        >
                          {showMissingStudents ? t("missingStudentsHide") : t("missingStudentsShow")}
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMissingStudents ? "rotate-180" : ""}`} />
                        </button>
                        <button
                          type="button"
                          onClick={handleSendReminder}
                          disabled={sendingReminder || !session.isActive}
                          title={!session.isActive ? t("reminderInactive") : undefined}
                          className="inline-flex h-7 items-center rounded-md border border-indigo-200 bg-white px-2 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:bg-indigo-900/50"
                        >
                          {sendingReminder ? t("reminderSending") : t("reminderSend")}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs font-medium text-muted-foreground">{t("participationEmpty")}</p>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 lg:flex lg:shrink-0 lg:items-center lg:gap-5 lg:border-t-0 lg:pt-0">
          {([
            [tSeq("activeLabel"), <Switch key="active" checked={session.isActive} onCheckedChange={() => onToggleActive(session.id, session.isActive)} />],
            [tSeq("publicLabel"), <Switch key="public" checked={session.defaultQuestionPublic} onCheckedChange={() => onTogglePublic(session.id, session.defaultQuestionPublic)} />],
            [tSeq("likesLabel"), <Switch key="likes" checked={session.likesVisibleToPeers} onCheckedChange={() => onToggleLikes(session.id, session.likesVisibleToPeers)} />],
            [tSeq("commentsLabel"), <Switch key="comments" checked={session.commentsVisibleToPeers} onCheckedChange={() => onToggleCommentsVisible(session.id, session.commentsVisibleToPeers)} />],
          ] as const).map(([label, control]) => (
            <div key={label} className="flex items-center justify-between rounded-md border bg-background px-3 py-2 lg:w-20 lg:justify-center lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
              <span className="text-xs font-medium text-muted-foreground lg:hidden">{label}</span>
              {control}
            </div>
          ))}
          <div className="col-span-2 flex justify-end gap-1 lg:col-span-1 lg:w-24 lg:justify-center">
            <button
              type="button"
              onClick={openEdit}
              className="rounded-md border border-indigo-200 p-1.5 text-indigo-600 hover:bg-indigo-50"
              title={tc("edit")}
              aria-label={tc("edit")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(session.id)}
              className="rounded-md border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
              title={tc("delete")}
              aria-label={tc("delete")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {showMissingStudents && (
        <div className="border-t border-emerald-100 bg-emerald-50/40 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          {isLoadingParticipation ? (
            <p className="text-xs font-medium text-muted-foreground">{t("missingStudentsLoading")}</p>
          ) : isParticipationError ? (
            <p className="text-xs font-medium text-destructive">{t("missingStudentsLoadFailed")}</p>
          ) : missingStudents.length === 0 ? (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-200">{t("missingStudentsEmpty")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {missingStudents.map((student) => (
                <span
                  key={student.id}
                  className="inline-flex items-center rounded-md border border-emerald-200 bg-background px-2 py-1 text-xs font-medium text-foreground dark:border-emerald-900"
                >
                  {t("missingStudentLabel", {
                    grade: student.grade ?? "-",
                    className: student.className ?? "-",
                    number: student.studentNumber ?? "-",
                    name: student.name,
                  })}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="border-t bg-indigo-50/40 px-4 py-3 dark:bg-indigo-950/30">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("date")}</Label>
              <DatePicker value={editDate} onChange={setEditDate} placeholder={t("pickDate")} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("subject")}</Label>
              <Input
                className="h-9 w-24 bg-background"
                value={isDesignSession ? session.subject : editSubject}
                disabled={isDesignSession}
                onChange={(event) => setEditSubject(event.target.value)}
                placeholder={t("subjectPlaceholder")}
              />
            </div>
            {isDesignSession && (
              <div className="space-y-1">
                <Label className="text-xs">{t("areaLabel")}</Label>
                <Input className="h-9 w-24 bg-muted" value={editArea} disabled />
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-xs">{isDesignSession ? t("unitLabel") : t("topic")}</Label>
              <Input className="h-9 bg-background" value={editTopic} onChange={(event) => setEditTopic(event.target.value)} placeholder={t("topicPlaceholderShort")} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={savingEdit} onClick={saveEdit} className="font-semibold">
                {savingEdit ? t("saving") : tc("save")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>{tc("cancel")}</Button>
            </div>
          </div>
          {isDesignSession && (
            <p className="mt-1 text-xs text-muted-foreground">{t("inquiryEditNote")}</p>
          )}
        </div>
      )}
    </div>
  );
}

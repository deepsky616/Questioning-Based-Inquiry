"use client";

import { Fragment } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { CommentThread } from "@/components/shared/CommentThread";
import { TranslateToggle } from "@/components/shared/TranslateToggle";
import type { useContentTranslation } from "@/components/shared/use-content-translation";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatDateTime } from "@/lib/datetime";
import {
  CLOSURE_LABEL,
  CLOSURE_STYLE,
  COGNITIVE_LABEL,
  COGNITIVE_STYLE,
} from "@/lib/question-labels";
import { buildSessionLabel } from "@/lib/sessions";
import type { Question } from "./types";

interface TeacherQuestionTableProps {
  list: Question[];
  selectedIds: Set<string>;
  selectedSessionId: string;
  expandedCommentId: string | null;
  commentCountOverride: Record<string, number>;
  contentTranslation: ReturnType<typeof useContentTranslation>;
  onSelectAll: (list: Question[]) => void;
  onClearSelection: () => void;
  onToggleSelect: (id: string) => void;
  onToggleComment: (id: string) => void;
  onCommentCountChange: (id: string, count: number) => void;
  onClearFlag: (question: Question) => void;
  onToggleQuestionPublic: (question: Question) => void;
  onEditQuestion: (question: Question) => void;
  onDeleteQuestion: (question: Question) => void;
}

export function TeacherQuestionTable({
  list,
  selectedIds,
  selectedSessionId,
  expandedCommentId,
  commentCountOverride,
  contentTranslation,
  onSelectAll,
  onClearSelection,
  onToggleSelect,
  onToggleComment,
  onCommentCountChange,
  onClearFlag,
  onToggleQuestionPublic,
  onEditQuestion,
  onDeleteQuestion,
}: TeacherQuestionTableProps) {
  const t = useTranslations("teacherQ");
  const tc = useTranslations("common");
  const tTarget = useTranslations("targetSelector");
  const allChecked = list.length > 0 && list.every((question) => selectedIds.has(question.id));

  if (list.length === 0) {
    return <EmptyState icon="🔍" title={t("noQuestions")} />;
  }

  return (
    <>
      <div className="space-y-3 lg:hidden">
        <label className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={() => (allChecked ? onClearSelection() : onSelectAll(list))}
            className="h-4 w-4 rounded border-input accent-indigo-600"
          />
          {tTarget("selectAll")}
        </label>
        {list.map((question) => {
          const commentCount = commentCountOverride[question.id] ?? question.comments?.length ?? 0;
          return (
            <div
              key={question.id}
              className={`rounded-lg border bg-card p-3 ${selectedIds.has(question.id) ? "border-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/20" : ""}`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(question.id)}
                  onChange={() => onToggleSelect(question.id)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-input accent-indigo-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-foreground">{question.author.name}</span>
                    {question.author.className && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {[
                          question.author.grade && t("gradeLabel", { grade: question.author.grade }),
                          question.author.className && t("classLabel", { className: question.author.className }),
                          question.author.studentNumber && t("numberLabel", { studentNumber: question.author.studentNumber }),
                        ].filter(Boolean).join(" ")}
                      </span>
                    )}
                  </div>

                  {question.flagged && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                        ⚠️ {question.flagReason || t("flagSuspected")}
                      </span>
                      <button
                        type="button"
                        onClick={() => onClearFlag(question)}
                        className="text-[11px] font-medium text-emerald-600 hover:text-emerald-800"
                      >
                        {t("clearFlag")}
                      </button>
                    </div>
                  )}

                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                    {contentTranslation.text({ type: "QUESTION", id: question.id }, question.content)}
                  </p>
                  {contentTranslation.canTranslate && (
                    <TranslateToggle item={{ type: "QUESTION", id: question.id }} ct={contentTranslation} className="mt-1" />
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded px-2 py-0.5 text-xs break-keep ${CLOSURE_STYLE[question.closure]}`}>
                      {CLOSURE_LABEL[question.closure]}
                    </span>
                    <span className={`rounded px-2 py-0.5 text-xs break-keep ${COGNITIVE_STYLE[question.cognitive]}`}>
                      {COGNITIVE_LABEL[question.cognitive]}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {selectedSessionId === "all" && question.session && (
                      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                        <span>📚</span>
                        <span>{buildSessionLabel(question.session.date, question.session.subject, question.session.topic)}</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <span>🕒</span>
                      <span>{formatDateTime(question.createdAt)}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3">
                <div className="rounded-md bg-muted/40 px-2 py-2 text-center">
                  <p className="text-[11px] text-muted-foreground">{t("colLikes")}</p>
                  <p className="text-sm font-semibold text-rose-500">❤️ {question.likeCount}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleComment(question.id)}
                  className="rounded-md bg-muted/40 px-2 py-2 text-center text-indigo-600"
                  title={t("commentTooltip")}
                >
                  <p className="text-[11px] text-muted-foreground">{t("colComments")}</p>
                  <p className="text-sm font-semibold">💬 {commentCount}</p>
                </button>
                <div className="flex flex-col items-center justify-center rounded-md bg-muted/40 px-2 py-2">
                  <p className="mb-1 text-[11px] text-muted-foreground">{t("colPublic")}</p>
                  <Switch checked={question.isPublic} onCheckedChange={() => onToggleQuestionPublic(question)} />
                </div>
              </div>

              <div className="mt-3 flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => onEditQuestion(question)}
                  className="rounded-md border border-indigo-200 p-2 text-indigo-600 hover:bg-indigo-50"
                  title={tc("edit")}
                  aria-label={tc("edit")}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteQuestion(question)}
                  className="rounded-md border border-red-200 p-2 text-red-500 hover:bg-red-50"
                  title={tc("delete")}
                  aria-label={tc("delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {expandedCommentId === question.id && (
                <div className="mt-3 rounded-lg bg-muted/30 p-3">
                  <CommentThread
                    questionId={question.id}
                    preloaded={question.comments ?? []}
                    canModerate
                    onCountChange={(count) => onCommentCountChange(question.id, count)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() => (allChecked ? onClearSelection() : onSelectAll(list))}
                  className="h-4 w-4 rounded border-input accent-indigo-600"
                />
              </TableHead>
              <TableHead>{t("colStudent")}</TableHead>
              <TableHead>{t("colContent")}</TableHead>
              <TableHead className="w-20 text-center break-keep">{t("colLikes")}</TableHead>
              <TableHead className="w-16 text-center">{t("colComments")}</TableHead>
              <TableHead className="w-20 text-center">{t("colPublic")}</TableHead>
              <TableHead className="w-28 text-center">{t("colManage")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((question) => (
              <Fragment key={question.id}>
                <TableRow className={selectedIds.has(question.id) ? "bg-indigo-50 dark:bg-indigo-950/40/40" : ""}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(question.id)}
                      onChange={() => onToggleSelect(question.id)}
                      className="h-4 w-4 rounded border-input accent-indigo-600"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{question.author.name}</div>
                    {question.author.className && (
                      <div className="text-xs text-muted-foreground">
                        {[
                          question.author.grade && t("gradeLabel", { grade: question.author.grade }),
                          question.author.className && t("classLabel", { className: question.author.className }),
                          question.author.studentNumber && t("numberLabel", { studentNumber: question.author.studentNumber }),
                        ].filter(Boolean).join(" ")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md">
                    {question.flagged && (
                      <div className="mb-1.5 flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                          ⚠️ {question.flagReason || t("flagSuspected")}
                        </span>
                        <button
                          type="button"
                          onClick={() => onClearFlag(question)}
                          className="text-[11px] font-medium text-emerald-600 hover:text-emerald-800"
                        >
                          {t("clearFlag")}
                        </button>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {contentTranslation.text({ type: "QUESTION", id: question.id }, question.content)}
                    </p>
                    {contentTranslation.canTranslate && (
                      <TranslateToggle item={{ type: "QUESTION", id: question.id }} ct={contentTranslation} className="mt-0.5" />
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded break-keep ${CLOSURE_STYLE[question.closure]}`}>
                        {CLOSURE_LABEL[question.closure]}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded break-keep ${COGNITIVE_STYLE[question.cognitive]}`}>
                        {COGNITIVE_LABEL[question.cognitive]}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {selectedSessionId === "all" && question.session && (
                        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                          <span>📚</span>
                          <span>{buildSessionLabel(question.session.date, question.session.subject, question.session.topic)}</span>
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <span>🕒</span>
                        <span>{formatDateTime(question.createdAt)}</span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="group relative inline-block">
                      <span className="flex items-center gap-1 text-sm font-medium text-rose-500">
                        ❤️ {question.likeCount}
                      </span>
                      {(question.likedBy?.length ?? 0) > 0 && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-10 hidden group-hover:block bg-gray-900 text-white text-xs rounded-lg py-1.5 px-2.5 w-36 shadow-lg">
                          <p className="font-semibold mb-1">{t("likedByStudents")}</p>
                          {question.likedBy!.map((user) => (
                            <p key={user.id} className="truncate">{user.name}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      type="button"
                      onClick={() => onToggleComment(question.id)}
                      className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                      title={t("commentTooltip")}
                    >
                      💬 {commentCountOverride[question.id] ?? question.comments?.length ?? 0}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center">
                      <Switch
                        checked={question.isPublic}
                        onCheckedChange={() => onToggleQuestionPublic(question)}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-center">
                      <button
                        type="button"
                        onClick={() => onEditQuestion(question)}
                        className="rounded-md border border-indigo-200 p-1.5 text-indigo-600 hover:bg-indigo-50"
                        title={tc("edit")}
                        aria-label={tc("edit")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteQuestion(question)}
                        className="rounded-md border border-red-200 p-1.5 text-red-500 hover:bg-red-50"
                        title={tc("delete")}
                        aria-label={tc("delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
                {expandedCommentId === question.id && (
                  <TableRow>
                    <TableCell colSpan={7} className="bg-muted/30 px-6 py-4">
                      <CommentThread
                        questionId={question.id}
                        preloaded={question.comments ?? []}
                        canModerate
                        onCountChange={(count) => onCommentCountChange(question.id, count)}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

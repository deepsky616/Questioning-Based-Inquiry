"use client";

import { useTranslations } from "next-intl";

import { TranslateAllButton } from "@/components/shared/TranslateAllButton";
import type { useContentTranslation } from "@/components/shared/use-content-translation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import {
  QuestionSortControl,
  type SortDir,
  type SortField,
} from "@/components/shared/QuestionClassificationStats";
import type { Question, QuestionPageInfo } from "./types";
import { TeacherQuestionTable } from "./TeacherQuestionTable";
import { TeacherQuestionPageNavigation } from "./TeacherQuestionPageNavigation";

type ClosureFilter = "all" | "closed" | "open";
type CognitiveFilter = "all" | "factual" | "conceptual" | "controversial";

interface TeacherQuestionListPanelProps {
  hasQuestionList: boolean;
  isLoading: boolean;
  isError: boolean;
  filtered: Question[];
  displayed: Question[];
  totalCount: number;
  pageInfo: QuestionPageInfo;
  search: string;
  showFlaggedOnly: boolean;
  flaggedCount: number;
  sortField: SortField;
  sortDir: SortDir;
  filterClosure: ClosureFilter;
  filterCognitive: CognitiveFilter;
  selectedSessionId: string;
  selectedIds: Set<string>;
  expandedCommentId: string | null;
  commentCountOverride: Record<string, number>;
  contentTranslation: ReturnType<typeof useContentTranslation>;
  onSearchChange: (value: string) => void;
  onToggleFlaggedOnly: () => void;
  onSortChange: (field: SortField, dir: SortDir) => void;
  onFilterClosureChange: (value: ClosureFilter) => void;
  onFilterCognitiveChange: (value: CognitiveFilter) => void;
  onResetClassificationFilters: () => void;
  onSelectAll: (list: Question[]) => void;
  onClearSelection: () => void;
  onToggleSelect: (id: string) => void;
  onToggleComment: (id: string) => void;
  onCommentCountChange: (id: string, count: number) => void;
  onClearFlag: (question: Question) => void;
  onToggleQuestionPublic: (question: Question) => void;
  onEditQuestion: (question: Question) => void;
  onDeleteQuestion: (question: Question) => void;
  onPageChange: (page: number) => void;
  onQuestionsRetry: () => void;
}

export function TeacherQuestionListPanel({
  hasQuestionList,
  isLoading,
  isError,
  filtered,
  displayed,
  totalCount,
  pageInfo,
  search,
  showFlaggedOnly,
  flaggedCount,
  sortField,
  sortDir,
  filterClosure,
  filterCognitive,
  selectedSessionId,
  selectedIds,
  expandedCommentId,
  commentCountOverride,
  contentTranslation,
  onSearchChange,
  onToggleFlaggedOnly,
  onSortChange,
  onFilterClosureChange,
  onFilterCognitiveChange,
  onResetClassificationFilters,
  onSelectAll,
  onClearSelection,
  onToggleSelect,
  onToggleComment,
  onCommentCountChange,
  onClearFlag,
  onToggleQuestionPublic,
  onEditQuestion,
  onDeleteQuestion,
  onPageChange,
  onQuestionsRetry,
}: TeacherQuestionListPanelProps) {
  const t = useTranslations("teacherQ");
  const tc = useTranslations("common");
  const tCls = useTranslations("classification");

  if (!hasQuestionList) {
    return isLoading ? (
      <div className="text-center py-16 text-muted-foreground">{tc("loading")}</div>
    ) : (
      <div className="text-center py-16 text-muted-foreground text-sm">{t("selectSessionPrompt")}</div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-base font-semibold leading-none tracking-tight text-foreground">
            {t("listTitle")}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              {t("listCountSuffix", { count: totalCount })}
            </span>
          </h3>
          <Input
            aria-label={t("searchPlaceholder")}
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-8 text-sm w-56 bg-background"
          />
          <button
            type="button"
            onClick={onToggleFlaggedOnly}
            aria-pressed={showFlaggedOnly}
            className={`h-8 rounded-md border px-3 text-xs font-medium transition-colors ${
              showFlaggedOnly ? "border-red-400 bg-red-500 text-white" : "bg-white text-red-600 border-red-200 hover:bg-red-50"
            }`}
            title={t("flaggedTooltip")}
          >
            {t("flaggedOnly")} {flaggedCount > 0 && `(${flaggedCount})`}
          </button>
          <TranslateAllButton
            items={filtered.map((question) => ({ type: "QUESTION" as const, id: question.id }))}
            ct={contentTranslation}
          />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <QuestionSortControl field={sortField} dir={sortDir} onChange={onSortChange} />
        </div>
      </div>

      {isError ? (
        <div role="alert" className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-destructive">{t("listLoadError")}</p>
          <Button type="button" variant="outline" size="sm" onClick={onQuestionsRetry}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("listRetry")}
          </Button>
        </div>
      ) : isLoading ? (
        <div className="text-center py-16 text-muted-foreground">{tc("loading")}</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-0.5">{tCls("category1")}</span>
            {(["all", "closed", "open"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onFilterClosureChange(value)}
                aria-pressed={filterClosure === value}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  filterClosure === value ? "border-indigo-500 bg-indigo-500 text-white" : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {value === "all" ? t("all") : tCls(`${value}.label`)}
              </button>
            ))}
            <span className="text-xs text-muted-foreground mx-1">{tCls("category2")}</span>
            {(["all", "factual", "conceptual", "controversial"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onFilterCognitiveChange(value)}
                aria-pressed={filterCognitive === value}
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  filterCognitive === value ? "border-indigo-500 bg-indigo-500 text-white" : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {value === "all" ? t("all") : tCls(`${value}.label`)}
              </button>
            ))}
            {(filterClosure !== "all" || filterCognitive !== "all") && (
              <button
                type="button"
                onClick={onResetClassificationFilters}
                className="ml-1 text-xs font-medium text-indigo-600"
              >
                {tc("reset")}
              </button>
            )}
          </div>
          <TeacherQuestionTable
            list={displayed}
            selectedIds={selectedIds}
            selectedSessionId={selectedSessionId}
            expandedCommentId={expandedCommentId}
            commentCountOverride={commentCountOverride}
            contentTranslation={contentTranslation}
            onSelectAll={onSelectAll}
            onClearSelection={onClearSelection}
            onToggleSelect={onToggleSelect}
            onToggleComment={onToggleComment}
            onCommentCountChange={onCommentCountChange}
            onClearFlag={onClearFlag}
            onToggleQuestionPublic={onToggleQuestionPublic}
            onEditQuestion={onEditQuestion}
            onDeleteQuestion={onDeleteQuestion}
          />
          <TeacherQuestionPageNavigation
            page={pageInfo.page}
            totalPages={pageInfo.totalPages}
            total={pageInfo.total}
            onPageChange={onPageChange}
            labels={{
              previous: t("pagePrevious"),
              next: t("pageNext"),
              status: (page, totalPages, total) => t("pageStatus", { page, totalPages, total }),
            }}
          />
        </>
      )}
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { groupSessionDatesByMonth } from "@/lib/sessions";

export type SessionListSort = "desc" | "asc" | "missingDesc";
export type SessionParticipationFilter = "all" | "missing" | "completed";

interface TeacherSessionListControlsProps {
  filterOptions: {
    dates: string[];
    subjects: string[];
    topics: string[];
  };
  filterDate: string;
  filterSubject: string;
  filterTopic: string;
  search: string;
  participationFilter: SessionParticipationFilter;
  sort: SessionListSort;
  onFilterDate: (value: string) => void;
  onFilterSubject: (value: string) => void;
  onFilterTopic: (value: string) => void;
  onSearch: (value: string) => void;
  onParticipationFilter: (value: SessionParticipationFilter) => void;
  onSort: (value: SessionListSort) => void;
  onReset: () => void;
}

export function TeacherSessionListControls({
  filterOptions,
  filterDate,
  filterSubject,
  filterTopic,
  search,
  participationFilter,
  sort,
  onFilterDate,
  onFilterSubject,
  onFilterTopic,
  onSearch,
  onParticipationFilter,
  onSort,
  onReset,
}: TeacherSessionListControlsProps) {
  const t = useTranslations("sessions");
  const tc = useTranslations("common");
  const hasFilter = Boolean(filterDate || filterSubject || filterTopic || search || participationFilter !== "all");
  const dateMonthGroups = groupSessionDatesByMonth(filterOptions.dates);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-x-4 lg:gap-y-2">
      <div className="teacher-sessions-filter-grid grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[auto_11rem_8rem_7rem_10rem_10rem_auto] lg:items-center">
        <span className="text-xs font-medium text-muted-foreground sm:col-span-2 lg:col-span-1">{t("filterLabel")}</span>
        {/* 세션이 쌓이면 select만으로 찾기 어렵다 — 주제·교과 텍스트 검색 */}
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <select
          aria-label={t("allDates")}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={filterDate}
          onChange={(event) => onFilterDate(event.target.value)}
        >
          <option value="">{t("allDates")}</option>
          {dateMonthGroups.map((group) => (
            <optgroup key={group.key} label={group.label}>
              {group.dates.map((date) => <option key={date} value={date}>{date}</option>)}
            </optgroup>
          ))}
        </select>
        <Select value={filterSubject || "__all__"} onValueChange={(v) => onFilterSubject(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-10 w-full bg-background text-sm"><SelectValue placeholder={t("allSubjects")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("allSubjects")}</SelectItem>
            {filterOptions.subjects.map((subject) => <SelectItem key={subject} value={subject}>{subject}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterTopic || "__all__"} onValueChange={(v) => onFilterTopic(v === "__all__" ? "" : v)}>
          <SelectTrigger className="h-10 w-full bg-background text-sm"><SelectValue placeholder={t("allTopics")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("allTopics")}</SelectItem>
            {filterOptions.topics.map((topic) => <SelectItem key={topic} value={topic}>{topic}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={participationFilter} onValueChange={(value) => onParticipationFilter(value as SessionParticipationFilter)}>
          <SelectTrigger className="h-10 w-full bg-background text-sm"><SelectValue placeholder={t("allParticipation")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allParticipation")}</SelectItem>
            <SelectItem value="missing">{t("participationFilterMissing")}</SelectItem>
            <SelectItem value="completed">{t("participationFilterCompleted")}</SelectItem>
          </SelectContent>
        </Select>
        {hasFilter && (
          <button
            type="button"
            onClick={onReset}
            className="h-10 px-1 text-left text-xs font-medium text-indigo-600 hover:text-indigo-800 sm:text-center"
          >
            {tc("reset")}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 lg:ml-auto">
        <span className="text-xs font-medium text-muted-foreground">{t("sortLabel")}</span>
        <div className="flex h-9 overflow-hidden rounded-md border">
          {(["desc", "asc", "missingDesc"] as const).map((value, index) => (
            <button
              key={value}
              type="button"
              onClick={() => onSort(value)}
              className={`px-3 text-xs font-medium transition-colors ${index > 0 ? "border-l" : ""} ${
                sort === value ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {value === "desc" ? t("sortDesc") : value === "asc" ? t("sortAsc") : t("sortMissingDesc")}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

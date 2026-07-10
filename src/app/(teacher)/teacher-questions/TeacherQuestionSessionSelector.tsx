"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildSessionLabel, groupSessionDatesByMonth, groupSessionsByMonth } from "@/lib/sessions";
import type { QuestionSession } from "./types";

interface SessionFilterOptions {
  dates: string[];
  subjects: string[];
  topics: string[];
}

interface TeacherQuestionSessionSelectorProps {
  sessions: QuestionSession[];
  filterOptions: SessionFilterOptions;
  filteredSessions: QuestionSession[];
  selectedSessionId: string;
  filterDate: string;
  filterSubject: string;
  filterTopic: string;
  onFilterDateChange: (value: string) => void;
  onFilterSubjectChange: (value: string) => void;
  onFilterTopicChange: (value: string) => void;
  onSessionChange: (value: string) => void;
  labels: {
    noSessions: string;
    date: string;
    allDates: string;
    subject: string;
    all: string;
    allSubjects: string;
    topicFilterLabel: string;
    allTopics: string;
    classSession: string;
    noMatchingSession: string;
    selectSession: string;
    allSessions: string;
    filterHint: string;
    sessionHint?: string;
  };
}

export function TeacherQuestionSessionSelector({
  sessions,
  filterOptions,
  filteredSessions,
  selectedSessionId,
  filterDate,
  filterSubject,
  filterTopic,
  onFilterDateChange,
  onFilterSubjectChange,
  onFilterTopicChange,
  onSessionChange,
  labels,
}: TeacherQuestionSessionSelectorProps) {
  const dateMonthGroups = groupSessionDatesByMonth(filterOptions.dates);
  const sessionMonthGroups = groupSessionsByMonth(filteredSessions);

  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        {labels.noSessions}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 w-36">
          <label className="text-xs font-medium text-muted-foreground">{labels.date}</label>
          <select
            aria-label={labels.date}
            className="flex h-8 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-36"
            value={filterDate}
            onChange={(event) => onFilterDateChange(event.target.value)}
          >
            <option value="">{labels.allDates}</option>
            {dateMonthGroups.map((group) => (
              <optgroup key={group.key} label={group.label}>
                {group.dates.map((date) => (
                  <option key={date} value={date}>{date}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 w-32">
          <label className="text-xs font-medium text-muted-foreground">{labels.subject}</label>
          <Select value={filterSubject || "__all__"} onValueChange={(value) => onFilterSubjectChange(value === "__all__" ? "" : value)}>
            <SelectTrigger className="h-8 text-sm bg-card">
              <SelectValue placeholder={labels.all} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{labels.allSubjects}</SelectItem>
              {filterOptions.subjects.map((subject) => (
                <SelectItem key={subject} value={subject}>
                  {subject}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1 w-52">
          <label className="text-xs font-medium text-muted-foreground">{labels.topicFilterLabel}</label>
          <Select value={filterTopic || "__all__"} onValueChange={(value) => onFilterTopicChange(value === "__all__" ? "" : value)}>
            <SelectTrigger className="h-8 text-sm bg-card">
              <SelectValue placeholder={labels.all} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{labels.allTopics}</SelectItem>
              {filterOptions.topics.map((topic) => (
                <SelectItem key={topic} value={topic}>
                  {topic}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <label className="text-xs font-medium text-muted-foreground">{labels.classSession}</label>
          {filteredSessions.length === 0 ? (
            <div className="h-8 flex items-center text-sm text-muted-foreground">{labels.noMatchingSession}</div>
          ) : (
            <select
              aria-label={labels.classSession}
              className="flex h-8 w-full rounded-md border border-input bg-card px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={selectedSessionId}
              onChange={(event) => onSessionChange(event.target.value)}
            >
              <option value="all">{labels.allSessions}</option>
              {sessionMonthGroups.map((group) => (
                <optgroup key={group.key} label={`${group.label} (${group.sessions.length})`}>
                  {group.sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {buildSessionLabel(session.date, session.subject, session.topic)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2">{labels.filterHint}</p>
      {labels.sessionHint && (
        <p className="mt-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-950/30 dark:text-indigo-200">
          {labels.sessionHint}
        </p>
      )}
    </div>
  );
}

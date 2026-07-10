"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildSessionLabel, groupSessionsByMonth } from "@/lib/sessions";
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
          <Select value={filterDate || "__all__"} onValueChange={(value) => onFilterDateChange(value === "__all__" ? "" : value)}>
            <SelectTrigger className="h-8 text-sm bg-card">
              <SelectValue placeholder={labels.allDates} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{labels.allDates}</SelectItem>
              {filterOptions.dates.map((date) => (
                <SelectItem key={date} value={date}>
                  {date}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <Select value={selectedSessionId} onValueChange={onSessionChange}>
              <SelectTrigger className="bg-card font-medium">
                <SelectValue placeholder={labels.selectSession} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{labels.allSessions}</SelectItem>
                {sessionMonthGroups.map((group) => (
                  <SelectGroup key={group.key}>
                    <SelectLabel>{group.label} ({group.sessions.length})</SelectLabel>
                    {group.sessions.map((session) => (
                      <SelectItem key={session.id} value={session.id}>
                        {buildSessionLabel(session.date, session.subject, session.topic)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2">{labels.filterHint}</p>
    </div>
  );
}

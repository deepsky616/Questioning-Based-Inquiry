"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TeacherClass {
  grade: string;
  className: string;
}

interface TeacherDashboardFiltersProps {
  period: string;
  selectedClass: string;
  teacherClasses: TeacherClass[];
  school?: string | null;
  onPeriodChange: (value: string) => void;
  onSelectedClassChange: (value: string) => void;
  classKey: (teacherClass: TeacherClass) => string;
  labels: {
    periodWeek: string;
    periodMonth: string;
    periodSemester: string;
    allClasses: string;
    gradeClass: (grade: string, className: string) => string;
  };
}

export function TeacherDashboardFilters({
  period,
  selectedClass,
  teacherClasses,
  school,
  onPeriodChange,
  onSelectedClassChange,
  classKey,
  labels,
}: TeacherDashboardFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Select value={period} onValueChange={onPeriodChange}>
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="week">{labels.periodWeek}</SelectItem>
          <SelectItem value="month">{labels.periodMonth}</SelectItem>
          <SelectItem value="semester">{labels.periodSemester}</SelectItem>
        </SelectContent>
      </Select>

      <Select value={selectedClass} onValueChange={onSelectedClassChange}>
        <SelectTrigger className="w-full sm:w-[22rem] md:w-[28rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="w-[var(--radix-select-trigger-width)]">
          <SelectItem value="all">{labels.allClasses}</SelectItem>
          {teacherClasses.map((teacherClass) => (
            <SelectItem key={classKey(teacherClass)} value={classKey(teacherClass)}>
              {school ? `${school} ` : ""}{labels.gradeClass(teacherClass.grade, teacherClass.className)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

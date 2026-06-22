"use client";

import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildClassSelectionLabel,
  buildClassTargetValue,
  type SessionTargetClass,
  type SessionTargetStudent,
} from "@/lib/session-targeting";

interface SessionTargetSelectorProps {
  classes: SessionTargetClass[];
  students: SessionTargetStudent[];
  targetClassValue: string;
  selectedStudentIds: string[];
  onTargetClassChange: (value: string, nextStudentIds: string[]) => void;
  onSelectedStudentIdsChange: (ids: string[]) => void;
}

export function SessionTargetSelector({
  classes,
  students,
  targetClassValue,
  selectedStudentIds,
  onTargetClassChange,
  onSelectedStudentIdsChange,
}: SessionTargetSelectorProps) {
  const t = useTranslations("targetSelector");
  const selectedClassStudents = targetClassValue === "all"
    ? []
    : students.filter((student) => {
        const [, grade, className] = targetClassValue.split(":");
        return student.grade === grade && student.className === className;
      });
  const selectedSet = new Set(selectedStudentIds);
  const isAllChecked =
    selectedClassStudents.length > 0 &&
    selectedClassStudents.every((student) => selectedSet.has(student.id));

  const handleClassChange = (value: string) => {
    if (value === "all") {
      onTargetClassChange(value, students.map((student) => student.id));
      return;
    }
    const [, grade, className] = value.split(":");
    const classStudentIds = students
      .filter((student) => student.grade === grade && student.className === className)
      .map((student) => student.id);
    onTargetClassChange(value, classStudentIds);
  };

  const toggleStudent = (studentId: string) => {
    const next = selectedSet.has(studentId)
      ? selectedStudentIds.filter((id) => id !== studentId)
      : [...selectedStudentIds, studentId];
    onSelectedStudentIdsChange(next);
  };

  const toggleAll = () => {
    onSelectedStudentIdsChange(isAllChecked ? [] : selectedClassStudents.map((student) => student.id));
  };

  return (
    <div className="space-y-2">
      <Label>{t("target")}</Label>
      <Select value={targetClassValue} onValueChange={handleClassChange}>
        <SelectTrigger>
          <SelectValue placeholder={t("selectClass")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("allClasses")}</SelectItem>
          {classes.map((targetClass) => (
            <SelectItem key={buildClassTargetValue(targetClass)} value={buildClassTargetValue(targetClass)}>
              {t("gradeClass", { grade: targetClass.grade, className: targetClass.className })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {buildClassSelectionLabel({ targetClassValue, selectedStudentIds, students })}
      </p>

      {targetClassValue !== "all" && (
        <div className="max-h-44 overflow-auto rounded-md border bg-card">
          <label className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm font-medium text-foreground">
            <input type="checkbox" checked={isAllChecked} onChange={toggleAll} />
            {t("selectAll")}
          </label>
          {selectedClassStudents.map((student) => (
            <label
              key={student.id}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted/40"
            >
              <input
                type="checkbox"
                checked={selectedSet.has(student.id)}
                onChange={() => toggleStudent(student.id)}
              />
              <span className="min-w-0 truncate">
                {t("numberName", { n: student.studentNumber, name: student.name })}
              </span>
            </label>
          ))}
          {selectedClassStudents.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">{t("noStudents")}</div>
          )}
        </div>
      )}
    </div>
  );
}

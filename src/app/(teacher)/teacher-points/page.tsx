"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { DashboardSkeleton } from "@/components/shared/DashboardSkeleton";
import { StudentRankPanel, ClassRankingPanel } from "@/components/shared/RankingPanels";
import { PointReviewView } from "@/components/teacher/PointReviewView";
import { useTeacherStudents } from "@/lib/app-queries";
import { cn } from "@/lib/utils";

type TeacherPointsTab = "ranking" | "points";

interface TeacherClass {
  grade: string;
  className: string;
}

interface TeacherStudent {
  id: string;
  grade: string;
  className: string;
}

function classKey(tc: TeacherClass) {
  return `${tc.grade}|${tc.className}`;
}

function TeacherPointsTabs({
  value,
  onChange,
  labels,
}: {
  value: TeacherPointsTab;
  onChange: (value: TeacherPointsTab) => void;
  labels: Record<TeacherPointsTab, string>;
}) {
  const tabClass = (tab: TeacherPointsTab, withDivider = false) =>
    cn(
      "px-4 py-2 text-sm font-medium transition-colors",
      withDivider && "border-l",
      value === tab ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted",
    );

  return (
    <div className="flex rounded-md border overflow-hidden w-fit">
      <button type="button" onClick={() => onChange("ranking")} className={tabClass("ranking")}>
        {labels.ranking}
      </button>
      <button type="button" onClick={() => onChange("points")} className={tabClass("points", true)}>
        {labels.points}
      </button>
    </div>
  );
}

function TeacherClassSelector({
  selectedClass,
  teacherClasses,
  onChange,
}: {
  selectedClass: string;
  teacherClasses: TeacherClass[];
  onChange: (value: string) => void;
}) {
  const tTarget = useTranslations("targetSelector");

  return (
    <div className="flex min-w-0 flex-col gap-1 sm:w-60">
      <label className="text-xs font-medium text-muted-foreground">{tTarget("selectClass")}</label>
      <select
        value={selectedClass}
        onChange={(event) => onChange(event.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="all">{tTarget("allClasses")}</option>
        {teacherClasses.map((tc) => (
          <option key={classKey(tc)} value={classKey(tc)}>
            {tTarget("gradeClass", { grade: tc.grade, className: tc.className })}
          </option>
        ))}
      </select>
    </div>
  );
}

function TeacherRankingsView({
  selectedClass,
  teacherClasses,
  onSelectedClassChange,
  isLoading,
}: {
  selectedClass: string;
  teacherClasses: TeacherClass[];
  onSelectedClassChange: (value: string) => void;
  isLoading: boolean;
}) {
  const t = useTranslations("teacherPoints");
  const [selGrade, selClassName] =
    selectedClass !== "all" ? selectedClass.split("|") : [undefined, undefined];

  if (isLoading && teacherClasses.length === 0) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("rankingTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("rankingDesc")}</p>
        </div>
        <TeacherClassSelector
          selectedClass={selectedClass}
          teacherClasses={teacherClasses}
          onChange={onSelectedClassChange}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {selectedClass !== "all" ? (
            <StudentRankPanel gradeParam={selGrade} classNameParam={selClassName} scrollable={false} />
          ) : teacherClasses.length > 0 ? (
            teacherClasses.map((tc) => (
              <StudentRankPanel key={classKey(tc)} gradeParam={tc.grade} classNameParam={tc.className} scrollable={false} />
            ))
          ) : (
            <StudentRankPanel scrollable={false} />
          )}
        </div>
        <ClassRankingPanel
          gradeParam={selGrade}
          classNameParam={selClassName}
          highlightSelf={selectedClass !== "all"}
          highlightClasses={selectedClass === "all" ? teacherClasses : undefined}
          defaultScope="school"
          scrollable={false}
        />
      </div>
    </div>
  );
}

function TeacherPointReviewWithClass({
  selectedClass,
  teacherClasses,
  students,
  onSelectedClassChange,
}: {
  selectedClass: string;
  teacherClasses: TeacherClass[];
  students: TeacherStudent[];
  onSelectedClassChange: (value: string) => void;
}) {
  const t = useTranslations("teacherPoints");
  const [grade, className] = selectedClass !== "all" ? selectedClass.split("|") : ["", ""];
  const studentIds = useMemo(
    () =>
      selectedClass === "all"
        ? []
        : students
            .filter((student) => student.grade === grade && student.className === className)
            .map((student) => student.id),
    [className, grade, selectedClass, students],
  );
  const classFilter =
    selectedClass === "all"
      ? undefined
      : {
          grade,
          className,
          studentIds,
        };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t("pointReviewTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("pointReviewDesc")}</p>
        </div>
        <TeacherClassSelector
          selectedClass={selectedClass}
          teacherClasses={teacherClasses}
          onChange={onSelectedClassChange}
        />
      </div>

      <PointReviewView classFilter={classFilter} />
    </div>
  );
}

function TeacherPointsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tPages = useTranslations("pages");
  const t = useTranslations("teacherPoints");
  const { data, isLoading } = useTeacherStudents<TeacherStudent, TeacherClass>();
  const teacherClasses = useMemo(() => data?.teacherClasses ?? [], [data]);
  const students = useMemo(() => data?.students ?? [], [data]);
  const [selectedClass, setSelectedClass] = useState("all");
  const tabParam = searchParams.get("tab");
  const tab: TeacherPointsTab = tabParam === "points" || tabParam === "review" ? "points" : "ranking";

  useEffect(() => {
    if (selectedClass === "all") return;
    if (!teacherClasses.some((tc) => classKey(tc) === selectedClass)) {
      setSelectedClass("all");
    }
  }, [selectedClass, teacherClasses]);

  useEffect(() => {
    if (tabParam !== "review") return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "points");
    router.replace(`/teacher-points?${params.toString()}`, { scroll: false });
  }, [router, searchParams, tabParam]);

  const setTab = (value: TeacherPointsTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "ranking") {
      params.delete("tab");
      params.delete("studentId");
    } else {
      params.set("tab", "points");
    }
    const query = params.toString();
    router.replace(query ? `/teacher-points?${query}` : "/teacher-points", { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader title={tPages("teacherPoints.title")} description={tPages("teacherPoints.description")} />

      <TeacherPointsTabs
        value={tab}
        onChange={setTab}
        labels={{ ranking: t("tabRanking"), points: t("tabPoints") }}
      />

      {tab === "ranking" ? (
        <TeacherRankingsView
          selectedClass={selectedClass}
          teacherClasses={teacherClasses}
          onSelectedClassChange={setSelectedClass}
          isLoading={isLoading}
        />
      ) : (
        <TeacherPointReviewWithClass
          selectedClass={selectedClass}
          teacherClasses={teacherClasses}
          students={students}
          onSelectedClassChange={setSelectedClass}
        />
      )}
    </div>
  );
}

export default function TeacherPointsPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <TeacherPointsContent />
    </Suspense>
  );
}

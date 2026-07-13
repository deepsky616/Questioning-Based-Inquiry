"use client";

export type TeacherQuestionTopTab = "questions" | "design";

interface TeacherQuestionTopTabsProps {
  value: TeacherQuestionTopTab;
  onChange: (value: TeacherQuestionTopTab) => void;
  labels: {
    questions: string;
    design: string;
  };
}

export function TeacherQuestionTopTabs({ value, onChange, labels }: TeacherQuestionTopTabsProps) {
  const tabClass = (tab: TeacherQuestionTopTab, withDivider = false) =>
    `px-4 py-2 text-sm font-medium transition-colors ${withDivider ? "border-l " : ""}${
      value === tab ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"
    }`;

  return (
    <div className="flex rounded-md border overflow-hidden w-fit">
      <button type="button" onClick={() => onChange("questions")} className={tabClass("questions")}>
        {labels.questions}
      </button>
      <button type="button" onClick={() => onChange("design")} className={tabClass("design", true)}>
        {labels.design}
      </button>
    </div>
  );
}

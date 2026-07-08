"use client";

export type CurriculumStep = 1 | 2 | 3 | 4 | 5;

interface CurriculumStepProgressProps {
  step: CurriculumStep;
  getLabel: (step: CurriculumStep) => string;
}

export function CurriculumStepProgress({ step, getLabel }: CurriculumStepProgressProps) {
  return (
    <div className="flex gap-1">
      {([1, 2, 3, 4, 5] as CurriculumStep[]).map((item) => (
        <div
          key={item}
          className={`flex-1 py-1.5 text-center text-xs font-medium rounded transition-colors ${
            step === item
              ? "bg-indigo-600 text-white"
              : step > item
              ? "bg-indigo-100 text-indigo-700"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {item}. {getLabel(item)}
        </div>
      ))}
    </div>
  );
}

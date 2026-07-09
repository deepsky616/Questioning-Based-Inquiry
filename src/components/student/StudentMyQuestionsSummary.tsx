"use client";

interface StudentMyQuestionsSummaryProps {
  className?: string;
  totalQuestions: number;
  shownQuestions: number;
  totalLikes: number;
  totalComments: number;
  sessionPercent: number;
  labels: {
    total: string;
    shown: string;
    likes: string;
    comments: string;
    progress: string;
  };
}

export function StudentMyQuestionsSummary({
  className = "",
  totalQuestions,
  shownQuestions,
  totalLikes,
  totalComments,
  sessionPercent,
  labels,
}: StudentMyQuestionsSummaryProps) {
  const cards = [
    { label: labels.total, value: totalQuestions, tone: "text-indigo-600" },
    { label: labels.shown, value: shownQuestions, tone: "text-foreground" },
    { label: labels.likes, value: totalLikes, tone: "text-rose-500" },
    { label: labels.comments, value: totalComments, tone: "text-emerald-600" },
  ];

  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      {cards.map((card) => (
        <div key={card.label} className="min-h-[96px] rounded-lg border bg-card p-3 md:p-4">
          <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
          <p className={`mt-2 text-2xl font-bold ${card.tone}`}>{card.value}</p>
        </div>
      ))}
      <div className="col-span-2 rounded-lg border bg-muted/30 p-3 md:hidden">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium text-muted-foreground">{labels.progress}</span>
          <span className="font-bold text-emerald-700 dark:text-emerald-200">{sessionPercent}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${sessionPercent}%` }} />
        </div>
      </div>
    </div>
  );
}

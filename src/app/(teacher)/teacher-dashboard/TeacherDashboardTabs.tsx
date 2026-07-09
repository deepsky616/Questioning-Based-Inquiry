"use client";

interface TeacherDashboardTabsProps {
  value: "overview" | "reports";
  onChange: (value: "overview" | "reports") => void;
  labels: {
    overview: string;
    reports: string;
  };
}

export function TeacherDashboardTabs({ value, onChange, labels }: TeacherDashboardTabsProps) {
  return (
    <div className="flex w-fit rounded-md border overflow-hidden">
      {(["overview", "reports"] as const).map((tab, index) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={`px-4 py-2 text-sm font-medium transition-colors ${index > 0 ? "border-l" : ""} ${
            value === tab ? "bg-indigo-600 text-white" : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          {tab === "overview" ? labels.overview : labels.reports}
        </button>
      ))}
    </div>
  );
}

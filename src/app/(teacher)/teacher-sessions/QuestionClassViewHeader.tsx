interface QuestionClassViewHeaderProps {
  title: string;
  description: string;
}

export function QuestionClassViewHeader({
  title,
  description,
}: QuestionClassViewHeaderProps) {
  return (
    <section className="flex items-start gap-3" aria-labelledby="question-class-view-title">
      <span
        className="mt-1 h-10 w-1 shrink-0 rounded-full bg-primary"
        aria-hidden="true"
      />
      <div className="min-w-0 space-y-1">
        <h2 id="question-class-view-title" className="text-xl font-bold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
    </section>
  );
}

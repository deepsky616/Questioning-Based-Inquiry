"use client";

import Image from "next/image";
import { type ReactNode, type RefObject } from "react";
import {
  ArrowRight,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  Compass,
  Lightbulb,
  Link2,
  LockKeyhole,
  RotateCcw,
  Scale,
  Search,
  Sparkles,
  Unlock,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type QuestionDetectiveContent,
} from "@/lib/question-detective-content";
import type { Cognitive } from "@/lib/question-practice-data";
import type { QuestionLearningSlide } from "@/components/shared/QuestionDetectiveSlides";

const TYPE_STYLE: Record<
  Cognitive,
  {
    Icon: LucideIcon;
    text: string;
    soft: string;
    border: string;
    solid: string;
  }
> = {
  factual: {
    Icon: Search,
    text: "text-sky-800 dark:text-sky-200",
    soft: "bg-sky-50 dark:bg-sky-950/40",
    border: "border-sky-200 dark:border-sky-800",
    solid: "bg-sky-600 text-white",
  },
  conceptual: {
    Icon: Link2,
    text: "text-emerald-800 dark:text-emerald-200",
    soft: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-800",
    solid: "bg-emerald-600 text-white",
  },
  controversial: {
    Icon: Scale,
    text: "text-rose-800 dark:text-rose-200",
    soft: "bg-rose-50 dark:bg-rose-950/40",
    border: "border-rose-200 dark:border-rose-800",
    solid: "bg-rose-600 text-white",
  },
};

interface SlideHeadingProps {
  eyebrow: string;
  title: string;
  description?: string;
  Icon: LucideIcon;
  iconClassName?: string;
}

function SlideHeading({
  eyebrow,
  title,
  description,
  Icon,
  iconClassName,
}: SlideHeadingProps) {
  return (
    <header className="flex max-w-3xl items-start gap-3">
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
          iconClassName,
        )}
        aria-hidden="true"
      >
        <Icon className="h-6 w-6" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase text-muted-foreground">{eyebrow}</p>
        <h3 className="mt-1 text-2xl font-bold leading-tight text-foreground">{title}</h3>
        {description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
    </header>
  );
}

function FormulaText({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

function QuestionTypeLabel({ type, label }: { type: Cognitive; label: string }) {
  const { Icon, text, soft, border } = TYPE_STYLE[type];
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-bold",
        text,
        soft,
        border,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </span>
  );
}

function CoverSlide({ content }: { content: QuestionDetectiveContent }) {
  return (
    <div className="relative isolate flex min-h-[34rem] w-full items-center overflow-hidden rounded-lg lg:h-full lg:min-h-0">
      <Image
        src="/question-learning-cover.png"
        alt=""
        fill
        priority
        sizes="(min-width: 1280px) 960px, (min-width: 768px) 80vw, 100vw"
        className="-z-20 object-cover object-[32%_center] sm:object-center"
      />
      <div className="absolute inset-0 -z-10 bg-white/45 sm:bg-white/25 dark:bg-slate-950/45" />
      <div className="w-[82%] max-w-md px-5 py-10 sm:w-[52%] sm:px-10">
        <span className="mb-5 block h-1.5 w-16 rounded-full bg-violet-500" aria-hidden="true" />
        <p className="text-sm font-bold text-sky-950 dark:text-sky-100">{content.cover.eyebrow}</p>
        <h3 className="mt-2 whitespace-nowrap text-3xl font-black leading-tight text-slate-950 dark:text-white sm:text-4xl">{content.cover.title}</h3>
        <p className="mt-4 max-w-sm text-base font-semibold leading-relaxed text-slate-900 dark:text-slate-100">
          {content.cover.description}
        </p>
        <div className="mt-7 flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
          <Search className="h-5 w-5 text-sky-700 dark:text-sky-200" aria-hidden="true" />
          <span>{content.cover.badge}</span>
        </div>
      </div>
    </div>
  );
}

function WhyQuestionsSlide({ content }: { content: QuestionDetectiveContent }) {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-8 p-5 sm:p-8">
      <SlideHeading
        eyebrow={content.whyQuestions.eyebrow}
        title={content.whyQuestions.title}
        description={content.whyQuestions.description}
        Icon={Lightbulb}
        iconClassName="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
      />

      <div className="grid items-center gap-7 md:grid-cols-[0.8fr_1.2fr]">
        <div className="relative border-l-4 border-sky-500 pl-5">
          <BrainCircuit className="h-14 w-14 text-sky-700 dark:text-sky-300" aria-hidden="true" />
          <p className="mt-4 text-xl font-bold leading-snug text-foreground">
            {content.whyQuestions.aiStatement}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {content.whyQuestions.humanStatement}
          </p>
        </div>

        <div className="space-y-3">
          {content.whyQuestions.strengths.map((text, itemIndex) => (
            <div
              key={text}
              className={cn(
                "flex min-h-14 items-center gap-4 rounded-lg border-l-4 px-4",
                itemIndex === 0 && "border-sky-400 bg-sky-50 dark:bg-sky-950/40",
                itemIndex === 1 && "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40",
                itemIndex === 2 && "border-rose-400 bg-rose-50 dark:bg-rose-950/40",
              )}
            >
              <span className="text-sm font-black text-foreground">0{itemIndex + 1}</span>
              <span className="text-sm font-semibold text-foreground">{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TwoAxesSlide({ content }: { content: QuestionDetectiveContent }) {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-7 p-5 sm:p-8">
      <SlideHeading
        eyebrow={content.twoAxes.eyebrow}
        title={content.twoAxes.title}
        description={content.wordHint}
        Icon={Compass}
        iconClassName="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      />

      <div className="relative space-y-4 md:pl-16">
        <div className="absolute bottom-4 left-5 top-4 hidden w-px bg-border md:block" aria-hidden="true" />
        {content.classificationAxes.map((axis, axisIndex) => (
          <section
            key={axis.key}
            className={cn(
              "relative grid gap-3 rounded-lg border p-4 md:grid-cols-[10rem_1fr] md:items-center",
              axisIndex === 0
                ? "border-sky-200 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/30"
                : "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30",
            )}
          >
            <span
              className={cn(
                "absolute -left-[3.75rem] hidden h-10 w-10 items-center justify-center rounded-full text-sm font-black text-white md:flex",
                axisIndex === 0 ? "bg-sky-600" : "bg-emerald-600",
              )}
              aria-hidden="true"
            >
              {axisIndex + 1}
            </span>
            <div>
              <p className="text-xs font-bold text-muted-foreground">{content.twoAxes.axisLabel} {axisIndex + 1}</p>
              <h4 className="mt-1 text-lg font-bold text-foreground">{axis.title}</h4>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{axis.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
                {axisIndex === 0 ? (
                  <>
                    <span className="rounded-md bg-sky-100 px-2 py-1 text-sky-800 dark:bg-sky-900 dark:text-sky-100">{content.twoAxes.closedLabel}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="rounded-md bg-emerald-100 px-2 py-1 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100">{content.twoAxes.openLabel}</span>
                  </>
                ) : (
                  <>
                    <span className="text-sky-800 dark:text-sky-200">{content.twoAxes.factualShort}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-emerald-800 dark:text-emerald-200">{content.twoAxes.conceptualShort}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="text-rose-800 dark:text-rose-200">{content.twoAxes.controversialShort}</span>
                  </>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function OpenClosedSlide({ content }: { content: QuestionDetectiveContent }) {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-6 p-5 sm:p-8">
      <SlideHeading
        eyebrow={content.openClosed.eyebrow}
        title={content.openClosed.title}
        description={content.openClosed.description}
        Icon={Unlock}
        iconClassName="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200"
      />

      <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
        <section className="rounded-lg border border-sky-200 bg-sky-50/70 p-5 dark:border-sky-900 dark:bg-sky-950/30">
          <div className="flex items-center gap-3">
            <LockKeyhole className="h-7 w-7 text-sky-700 dark:text-sky-300" aria-hidden="true" />
            <h4 className="text-lg font-bold text-sky-900 dark:text-sky-100">{content.answerRangeGuide.closed.title}</h4>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{content.answerRangeGuide.closed.definition}</p>
          <p className="mt-5 border-t border-sky-200 pt-4 text-sm font-semibold leading-relaxed text-foreground dark:border-sky-800">
            {content.answerRangeGuide.closed.example}
          </p>
        </section>

        <div className="flex items-center justify-center text-xs font-black text-muted-foreground" aria-hidden="true">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border bg-background">{content.openClosed.compare}</span>
        </div>

        <section className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex items-center gap-3">
            <Unlock className="h-7 w-7 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
            <h4 className="text-lg font-bold text-emerald-900 dark:text-emerald-100">{content.answerRangeGuide.open.title}</h4>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{content.answerRangeGuide.open.definition}</p>
          <p className="mt-5 border-t border-emerald-200 pt-4 text-sm font-semibold leading-relaxed text-foreground dark:border-emerald-800">
            {content.answerRangeGuide.open.example}
          </p>
        </section>
      </div>
    </div>
  );
}

function InquiryDepthSlide({ content, typeLabel }: { content: QuestionDetectiveContent; typeLabel: (type: Cognitive) => string }) {
  const journey: Cognitive[] = ["factual", "conceptual", "controversial"];

  return (
    <div className="flex h-full w-full flex-col justify-center gap-8 p-5 sm:p-8">
      <SlideHeading
        eyebrow={content.inquiryDepth.eyebrow}
        title={content.inquiryDepth.title}
        description={content.inquiryDepth.description}
        Icon={Sparkles}
        iconClassName="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
      />

      <ol className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
        {journey.map((type, typeIndex) => {
          const style = TYPE_STYLE[type];
          const Icon = style.Icon;
          return (
            <li key={type} className="contents">
              <div className={cn("flex min-h-32 flex-col justify-between rounded-lg border p-4", style.soft, style.border)}>
                <div className="flex items-center justify-between gap-3">
                  <span className={cn("text-xs font-black", style.text)}>0{typeIndex + 1}</span>
                  <Icon className={cn("h-6 w-6", style.text)} aria-hidden="true" />
                </div>
                <div>
                  <h4 className={cn("text-lg font-bold", style.text)}>{typeLabel(type)}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">{content.inquiryDepth.descriptions[type]}</p>
                </div>
              </div>
              {typeIndex < journey.length - 1 && (
                <ArrowRight className="mx-auto hidden h-5 w-5 text-muted-foreground md:block" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function FactualDefinitionSlide({ content, label }: { content: QuestionDetectiveContent; label: string }) {
  const guide = content.typeFormulaGuide[0];
  return (
    <div className="grid h-full w-full gap-7 p-5 sm:p-8 md:grid-cols-[15rem_1fr] md:items-center">
      <div className="flex min-h-52 flex-col justify-between rounded-lg bg-sky-600 p-6 text-white">
        <Search className="h-14 w-14" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-sky-100">{content.factualDefinition.action}</p>
          <h3 className="mt-1 text-3xl font-black">{label}</h3>
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-sky-700 dark:text-sky-300">{content.factualDefinition.eyebrow}</p>
        <h4 className="mt-2 text-2xl font-bold leading-tight text-foreground">{content.factualDefinition.title}</h4>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">{guide.definition}</p>
        <div className="mt-5 rounded-lg border-l-4 border-sky-500 bg-sky-50 px-4 py-3 text-sm font-semibold leading-relaxed text-sky-950 dark:bg-sky-950/40 dark:text-sky-100">
          {content.factualDefinition.exampleLabel}: {guide.formulas[0].examples[0]}
        </div>
      </div>
    </div>
  );
}

function FactualFormulasSlide({ content, label }: { content: QuestionDetectiveContent; label: string }) {
  const guide = content.typeFormulaGuide[0];
  return (
    <div className="flex h-full w-full flex-col justify-center gap-5 p-5 sm:p-8">
      <SlideHeading
        eyebrow={content.factualFormulas.eyebrow}
        title={content.factualFormulas.title.replace("{label}", label)}
        Icon={Search}
      />

      <ol className="overflow-hidden rounded-lg border border-sky-200 bg-background dark:border-sky-900">
        {guide.formulas.map((formula, formulaIndex) => (
          <li
            key={formula.title}
            className="grid gap-2 border-b border-sky-100 p-3 last:border-b-0 sm:grid-cols-[3rem_1fr] sm:gap-4 dark:border-sky-900"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-sky-600 text-sm font-black text-white">
              {formulaIndex + 1}
            </span>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-foreground">{formula.title}</h4>
              <FormulaText>
                <strong className="text-sky-800 dark:text-sky-200">{content.factualFormulas.formulaLabel}</strong> {formula.pattern}
              </FormulaText>
              <FormulaText>
                <strong className="text-sky-800 dark:text-sky-200">{content.factualFormulas.exampleLabel}</strong> {formula.examples[0]}
              </FormulaText>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ConceptualDefinitionSlide({ content, label }: { content: QuestionDetectiveContent; label: string }) {
  const guide = content.typeFormulaGuide[1];
  return (
    <div className="grid h-full w-full gap-8 p-5 sm:p-8 md:grid-cols-[1fr_1.15fr] md:items-center">
      <div className="relative min-h-60" aria-hidden="true">
        <div className="absolute left-4 top-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
          {content.conceptualDefinition.factOne}
        </div>
        <div className="absolute right-4 top-12 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-100">
          {content.conceptualDefinition.factTwo}
        </div>
        <div className="absolute bottom-4 left-1/2 flex h-28 w-28 -translate-x-1/2 items-center justify-center rounded-full bg-emerald-600 text-center text-base font-black text-white shadow-md">
          {content.conceptualDefinition.relation.split("\n").map((part) => (
            <span key={part} className="block">{part}</span>
          ))}
        </div>
        <Link2 className="absolute left-1/2 top-20 h-16 w-16 -translate-x-1/2 text-emerald-700 dark:text-emerald-300" />
      </div>

      <div>
        <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{content.conceptualDefinition.eyebrow}</p>
        <h3 className="mt-2 text-3xl font-black text-emerald-900 dark:text-emerald-100">{label}</h3>
        <h4 className="mt-3 text-xl font-bold leading-snug text-foreground">{content.conceptualDefinition.title}</h4>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">{guide.definition}</p>
      </div>
    </div>
  );
}

function ConceptualFormulasSlide({ content, label }: { content: QuestionDetectiveContent; label: string }) {
  const guide = content.typeFormulaGuide[1];
  return (
    <div className="flex h-full w-full flex-col justify-center gap-5 p-5 sm:p-8">
      <SlideHeading
        eyebrow={content.conceptualFormulas.eyebrow}
        title={content.conceptualFormulas.title.replace("{label}", label)}
        Icon={Link2}
        iconClassName="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      />

      <ol className="relative space-y-3 pl-12 before:absolute before:bottom-5 before:left-[1.12rem] before:top-5 before:w-px before:bg-emerald-300 dark:before:bg-emerald-800">
        {guide.formulas.map((formula, formulaIndex) => (
          <li key={formula.title} className="relative rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
            <span className="absolute -left-12 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-sm font-black text-white">
              {formulaIndex + 1}
            </span>
            <h4 className="text-sm font-bold text-foreground">{formula.title}</h4>
            <FormulaText>{formula.pattern}</FormulaText>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-emerald-900 dark:text-emerald-100">{formula.examples[0]}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ControversialDefinitionSlide({ content, label }: { content: QuestionDetectiveContent; label: string }) {
  const guide = content.typeFormulaGuide[2];
  return (
    <div className="flex h-full w-full flex-col justify-center gap-7 p-5 sm:p-8">
      <div className="mx-auto flex w-full max-w-xl items-end justify-center gap-3" aria-hidden="true">
        <div className="mb-2 w-32 rounded-lg border border-sky-200 bg-sky-50 px-3 py-3 text-center text-sm font-bold text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">{content.controversialDefinition.valueChoice}</div>
        <Scale className="h-16 w-16 shrink-0 text-rose-700 dark:text-rose-300" />
        <div className="mb-2 w-32 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-center text-sm font-bold text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{content.controversialDefinition.responsibilityImpact}</div>
      </div>

      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-bold text-rose-700 dark:text-rose-300">{content.controversialDefinition.eyebrow}</p>
        <h3 className="mt-2 text-3xl font-black text-rose-900 dark:text-rose-100">{label}</h3>
        <h4 className="mt-3 text-xl font-bold text-foreground">{content.controversialDefinition.title}</h4>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">{guide.definition}</p>
        <p className="mt-5 rounded-lg border-l-4 border-rose-500 bg-rose-50 px-4 py-3 text-left text-sm font-semibold text-rose-950 dark:bg-rose-950/40 dark:text-rose-100">
          {content.controversialDefinition.note}
        </p>
      </div>
    </div>
  );
}

function ControversialFormulasSlide({ content, label }: { content: QuestionDetectiveContent; label: string }) {
  const guide = content.typeFormulaGuide[2];
  return (
    <div className="flex h-full w-full flex-col justify-center gap-5 p-5 sm:p-8">
      <SlideHeading
        eyebrow={content.controversialFormulas.eyebrow}
        title={content.controversialFormulas.title.replace("{label}", label)}
        Icon={Scale}
        iconClassName="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
      />

      <div className="grid gap-3 md:grid-cols-3">
        {guide.formulas.map((formula, formulaIndex) => (
          <section key={formula.title} className="flex min-h-48 flex-col rounded-lg border border-rose-200 bg-background p-4 dark:border-rose-900">
            <span className="text-xs font-black text-rose-700 dark:text-rose-300">{content.controversialFormulas.judgmentLabel} {formulaIndex + 1}</span>
            <h4 className="mt-2 text-sm font-bold leading-snug text-foreground">{formula.title}</h4>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{formula.pattern}</p>
            <p className="mt-auto border-t border-rose-100 pt-3 text-sm font-semibold leading-relaxed text-rose-950 dark:border-rose-900 dark:text-rose-100">
              {formula.examples[0]}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}

function ComparisonSlide({ content, typeLabel }: { content: QuestionDetectiveContent; typeLabel: (type: Cognitive) => string }) {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-5 p-5 sm:p-8">
      <SlideHeading
        eyebrow={content.comparison.eyebrow}
        title={content.comparison.title}
        Icon={BrainCircuit}
        iconClassName="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
      />

      <div className="hidden overflow-hidden rounded-lg border md:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-muted/70 text-xs text-muted-foreground">
            <tr>
              <th className="w-[18%] px-3 py-3 font-semibold">{content.comparison.typeHeader}</th>
              <th className="w-[30%] px-3 py-3 font-semibold">{content.comparison.thinkingHeader}</th>
              <th className="w-[20%] px-3 py-3 font-semibold">{content.comparison.purposeHeader}</th>
              <th className="px-3 py-3 font-semibold">{content.comparison.exampleHeader}</th>
            </tr>
          </thead>
          <tbody>
            {content.trioTable.map((row) => (
              <tr key={row.typeKey} className="border-t align-top">
                <th className="px-3 py-3 font-normal">
                  <QuestionTypeLabel type={row.typeKey} label={typeLabel(row.typeKey)} />
                </th>
                <td className="px-3 py-3 leading-relaxed text-muted-foreground">{row.thinkingGuide}</td>
                <td className="px-3 py-3 leading-relaxed text-muted-foreground">{row.purpose}</td>
                <td className="px-3 py-3 font-medium leading-relaxed text-foreground">{row.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {content.trioTable.map((row) => (
          <article key={row.typeKey} className={cn("rounded-lg border-l-4 bg-muted/20 p-4", TYPE_STYLE[row.typeKey].border)}>
            <QuestionTypeLabel type={row.typeKey} label={typeLabel(row.typeKey)} />
            <dl className="mt-3 grid gap-2 text-sm">
              <div>
                <dt className="font-bold text-foreground">{content.comparison.thinkingHeader}</dt>
                <dd className="text-muted-foreground">{row.thinkingGuide}</dd>
              </div>
              <div>
                <dt className="font-bold text-foreground">{content.comparison.purposeHeader}</dt>
                <dd className="text-muted-foreground">{row.purpose}</dd>
              </div>
              <div>
                <dt className="font-bold text-foreground">{content.comparison.exampleHeader}</dt>
                <dd className="text-muted-foreground">{row.example}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}

interface CheckSlideProps {
  content: QuestionDetectiveContent;
  typeLabel: (type: Cognitive) => string;
  checkNext: string;
  checkRestart: string;
  checkIndex: number;
  checkPromptRef: RefObject<HTMLParagraphElement | null>;
  selectedType: Cognitive | null;
  onSelectType: (type: Cognitive) => void;
  onMoveCheck: () => void;
}

function CheckSlide({
  content,
  typeLabel,
  checkNext,
  checkRestart,
  checkIndex,
  checkPromptRef,
  selectedType,
  onSelectType,
  onMoveCheck,
}: CheckSlideProps) {
  const check = content.checks[checkIndex];
  const isLastCheck = checkIndex === content.checks.length - 1;
  const choices: Cognitive[] = ["factual", "conceptual", "controversial"];
  const promptId = `question-learning-check-prompt-${check.id}`;

  return (
    <div className="flex h-full w-full flex-col justify-center gap-5 p-5 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <SlideHeading
          eyebrow={content.check.eyebrow}
          title={content.check.title}
          Icon={CheckCircle2}
          iconClassName="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200"
        />
        <span className="shrink-0 text-sm font-bold text-muted-foreground">
          {checkIndex + 1} / {content.checks.length}
        </span>
      </div>

      <div className="rounded-lg border bg-muted/20 p-5 text-center">
        <p
          id={promptId}
          ref={checkPromptRef}
          tabIndex={-1}
          aria-live="polite"
          aria-atomic="true"
          className="text-lg font-bold leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
        >
          {check.prompt}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" role="group" aria-labelledby={promptId}>
        {choices.map((type) => {
          const style = TYPE_STYLE[type];
          const Icon = style.Icon;
          const isSelected = selectedType === type;
          const isAnswer = selectedType !== null && check.answer === type;
          return (
            <button
              key={type}
              type="button"
              aria-pressed={isSelected}
              disabled={selectedType !== null}
              onClick={() => onSelectType(type)}
              className={cn(
                "flex min-h-14 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none disabled:opacity-100",
                style.border,
                style.soft,
                style.text,
                isSelected && "ring-2 ring-foreground ring-offset-2",
                isAnswer && style.solid,
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {typeLabel(type)}
            </button>
          );
        })}
      </div>

      {selectedType && (
        <div
          className={cn(
            "flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
            selectedType === check.answer
              ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
              : "border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40",
          )}
          aria-live="polite"
        >
          <div className="flex min-w-0 items-start gap-3">
            {selectedType === check.answer ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700 dark:text-rose-300" aria-hidden="true" />
            )}
            <div>
              <p className="text-sm font-bold text-foreground">
                {selectedType === check.answer ? content.check.correct : `${content.check.answerPrefix}${typeLabel(check.answer)}${content.check.answerSuffix}`}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{check.explanation}</p>
            </div>
          </div>
          <Button variant="outline" className="h-11 shrink-0 gap-2" onClick={onMoveCheck}>
            {isLastCheck ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
            {isLastCheck ? checkRestart : checkNext}
          </Button>
        </div>
      )}
    </div>
  );
}

function SynthesisSlide({ content, completionActions }: { content: QuestionDetectiveContent; completionActions?: ReactNode }) {
  const stepIcons = [Search, Link2, Scale] as const;
  const stepStyles = [TYPE_STYLE.factual, TYPE_STYLE.conceptual, TYPE_STYLE.controversial] as const;

  return (
    <div className="flex h-full w-full flex-col justify-center gap-7 p-5 sm:p-8">
      <SlideHeading
        eyebrow={content.synthesis.eyebrow}
        title={content.synthesis.title}
        description={content.synthesis.description}
        Icon={Sparkles}
        iconClassName="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
      />

      <ol className="grid gap-3 md:grid-cols-3">
        {content.inquirySteps.map((step, stepIndex) => {
          const Icon = stepIcons[stepIndex];
          const style = stepStyles[stepIndex];
          return (
            <li key={step.step} className={cn("relative rounded-lg border p-4", style.border, style.soft)}>
              <div className="flex items-center justify-between">
                <Icon className={cn("h-6 w-6", style.text)} aria-hidden="true" />
                <span className={cn("text-xs font-black", style.text)}>0{step.step}</span>
              </div>
              <h4 className="mt-5 text-base font-bold text-foreground">{step.title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
            </li>
          );
        })}
      </ol>

      <div className="flex items-center gap-3 rounded-lg bg-slate-900 px-4 py-4 text-white dark:bg-slate-100 dark:text-slate-950">
        <Check className="h-5 w-5 shrink-0 text-emerald-400 dark:text-emerald-700" aria-hidden="true" />
        <p className="text-sm font-bold">{content.synthesis.finalPrompt}</p>
      </div>
      {completionActions && <div className="flex flex-wrap gap-2">{completionActions}</div>}
    </div>
  );
}

export interface QuestionLearningSlideContentProps {
  completionActions?: ReactNode;
  content: QuestionDetectiveContent;
  slide: QuestionLearningSlide;
  typeLabel: (type: Cognitive) => string;
  checkNext: string;
  checkRestart: string;
  checkIndex: number;
  checkPromptRef: RefObject<HTMLParagraphElement | null>;
  selectedType: Cognitive | null;
  onSelectType: (type: Cognitive) => void;
  onMoveCheck: () => void;
}

export function QuestionLearningSlideContent({
  completionActions,
  content,
  slide,
  typeLabel,
  checkNext,
  checkRestart,
  checkIndex,
  checkPromptRef,
  selectedType,
  onSelectType,
  onMoveCheck,
}: QuestionLearningSlideContentProps) {
  switch (slide) {
    case "cover":
      return <CoverSlide content={content} />;
    case "whyQuestions":
      return <WhyQuestionsSlide content={content} />;
    case "twoAxes":
      return <TwoAxesSlide content={content} />;
    case "openClosed":
      return <OpenClosedSlide content={content} />;
    case "inquiryDepth":
      return <InquiryDepthSlide content={content} typeLabel={typeLabel} />;
    case "factualDefinition":
      return <FactualDefinitionSlide content={content} label={typeLabel("factual")} />;
    case "factualFormulas":
      return <FactualFormulasSlide content={content} label={typeLabel("factual")} />;
    case "conceptualDefinition":
      return <ConceptualDefinitionSlide content={content} label={typeLabel("conceptual")} />;
    case "conceptualFormulas":
      return <ConceptualFormulasSlide content={content} label={typeLabel("conceptual")} />;
    case "controversialDefinition":
      return <ControversialDefinitionSlide content={content} label={typeLabel("controversial")} />;
    case "controversialFormulas":
      return <ControversialFormulasSlide content={content} label={typeLabel("controversial")} />;
    case "comparison":
      return <ComparisonSlide content={content} typeLabel={typeLabel} />;
    case "check":
      return (
        <CheckSlide
          content={content}
          typeLabel={typeLabel}
          checkNext={checkNext}
          checkRestart={checkRestart}
          checkIndex={checkIndex}
          checkPromptRef={checkPromptRef}
          selectedType={selectedType}
          onSelectType={onSelectType}
          onMoveCheck={onMoveCheck}
        />
      );
    case "synthesis":
      return <SynthesisSlide content={content} completionActions={completionActions} />;
  }
}

"use client";

import { useLocale } from "next-intl";
import { CheckCircle2, Lightbulb } from "lucide-react";
import {
  buildQuestionGameLearningSummary,
  type QuestionGameLearningNextStep,
  type QuestionGameLearningStrength,
  type QuestionGameMode,
} from "@/lib/question-game-learning-summary";

interface Props {
  mode: QuestionGameMode;
  completedActivities: number;
  questions: string[];
  points?: number;
  accentColor?: string;
  embedded?: boolean;
}

const KO_STRENGTH: Record<QuestionGameLearningStrength, (count: number) => string> = {
  completed: () => "놀이 규칙에 맞춰 활동을 끝까지 완료했어요.",
  startedQuestions: () => "질문을 만들고 생각을 말로 나타내는 연습을 했어요.",
  clearQuestion: () => "질문 형태를 분명하게 갖춘 질문을 만들었어요.",
  variedQuestions: (count) => `서로 다른 질문을 ${count}개 만들었어요.`,
};

const EN_STRENGTH: Record<QuestionGameLearningStrength, (count: number) => string> = {
  completed: () => "You completed the activity by following the game rules.",
  startedQuestions: () => "You practiced turning your thinking into a question.",
  clearQuestion: () => "You made a question with a clear question form.",
  variedQuestions: (count) => `You made ${count} different questions.`,
};

const KO_NEXT_STEP: Record<QuestionGameLearningNextStep, string> = {
  explainConnection: "질문과 대답이 이어지는 까닭을 한 문장으로 설명해 보세요.",
  clarifyQuestionForm: "물음표와 질문 표현을 넣어 질문 형태를 더 분명히 해 보세요.",
  expandThinking: "왜 또는 어떻게를 넣어 생각을 넓히는 질문도 만들어 보세요.",
  changePerspective: "같은 주제를 다른 관점에서 한 번 더 질문해 보세요.",
};

const EN_NEXT_STEP: Record<QuestionGameLearningNextStep, string> = {
  explainConnection: "Explain in one sentence why the question and answer belong together.",
  clarifyQuestionForm: "Use a question mark and a question phrase to make the question clearer.",
  expandThinking: "Try a why or how question that expands your thinking.",
  changePerspective: "Ask about the same topic once more from a different point of view.",
};

export function GameLearningSummary({
  mode,
  completedActivities,
  questions,
  points,
  accentColor = "#4f46e5",
  embedded = false,
}: Props) {
  const locale = useLocale();
  const isEnglish = locale === "en";
  const summary = buildQuestionGameLearningSummary(questions, completedActivities);
  const modeLabels: Record<QuestionGameMode, string> = isEnglish
    ? { solo: "Solo", ai: "With AI", friend: "With friends" }
    : { solo: "혼자 하기", ai: "인공지능과 함께", friend: "친구와 함께" };
  const strength = (isEnglish ? EN_STRENGTH : KO_STRENGTH)[summary.strength](
    summary.validQuestionCount,
  );
  const nextStep = (isEnglish ? EN_NEXT_STEP : KO_NEXT_STEP)[summary.nextStep];

  const measures = [
    {
      label: isEnglish ? "Activities" : "완료 활동",
      value: completedActivities,
    },
    {
      label: isEnglish ? "Questions" : "만든 질문",
      value: questions.filter((question) => question.trim()).length,
    },
    ...(typeof points === "number" ? [{
      label: isEnglish ? "Points" : "받은 포인트",
      value: points,
    }] : []),
  ];

  return (
    <section className={embedded
      ? "border-y border-border py-5 text-foreground"
      : "rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm"
    }>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-black text-foreground">
          {isEnglish ? "My question learning result" : "나의 질문학습 결과"}
        </h2>
        <span
          className="rounded-full border px-2.5 py-1 text-xs font-bold text-foreground"
          style={{ borderColor: accentColor }}
        >
          {modeLabels[mode]}
        </span>
      </div>

      <dl className={`mt-4 grid ${measures.length === 3 ? "grid-cols-3" : "grid-cols-2"} divide-x divide-border border-y border-border py-3`}>
        {measures.map(({ label, value }) => (
          <div className="min-w-0 px-2 text-center first:pl-0 last:pr-0" key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg font-black text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 space-y-3 text-sm">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accentColor }} aria-hidden="true" />
          <div>
            <p className="font-bold text-foreground">{isEnglish ? "What went well" : "잘한 점"}</p>
            <p className="mt-0.5 leading-6 text-muted-foreground">{strength}</p>
          </div>
        </div>
        <div className="flex items-start gap-2 border-t border-border pt-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accentColor }} aria-hidden="true" />
          <div>
            <p className="font-bold text-foreground">{isEnglish ? "Next practice" : "다음 연습"}</p>
            <p className="mt-0.5 leading-6 text-muted-foreground">{nextStep}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

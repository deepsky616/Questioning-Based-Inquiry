"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getQuestionGameText,
  isQuestionFormForLocale,
} from "@/lib/question-game-i18n";
import { QUESTION_GAME_LIMITS } from "@/lib/question-game-rules";
import { parseClassificationResponse } from "@/lib/classify";
import type { ClassificationResult } from "@/types/question";

type ComposerPhase = "writing" | "checking" | "review" | "check-failed";

interface LadderQuestionComposerProps {
  locale: string;
  roundKey: string;
  topic: string;
  onConfirm: (question: string) => Promise<boolean>;
}

export default function LadderQuestionComposer({
  locale,
  roundKey,
  topic,
  onConfirm,
}: LadderQuestionComposerProps) {
  const text = getQuestionGameText(locale);
  const [phase, setPhase] = useState<ComposerPhase>("writing");
  const [question, setQuestion] = useState("");
  const [classification, setClassification] =
    useState<ClassificationResult | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const requestIdRef = useRef(0);
  const roundKeyRef = useRef(roundKey);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    roundKeyRef.current = roundKey;
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setQuestion("");
    setClassification(null);
    setInputError(null);
    setConfirmError(null);
    setConfirming(false);
    setPhase("writing");

    return () => {
      requestIdRef.current += 1;
      abortRef.current?.abort();
    };
  }, [roundKey]);

  function validateQuestion(value: string): string | null {
    if (!value) return text.ladderQuestionEmptyError;
    if (value.length > QUESTION_GAME_LIMITS.question) {
      return text.ladderQuestionLengthError(QUESTION_GAME_LIMITS.question);
    }
    if (!isQuestionFormForLocale(value, locale)) {
      return text.ladderQuestionShapeError;
    }
    return null;
  }

  function handleQuestionChange(value: string) {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setQuestion(value);
    setClassification(null);
    setInputError(null);
    setConfirmError(null);
    setConfirming(false);
    setPhase("writing");
  }

  async function checkQuestion() {
    const trimmed = question.trim();
    const validationError = validateQuestion(trimmed);
    if (validationError) {
      setInputError(validationError);
      setPhase("writing");
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const requestedRoundKey = roundKey;
    const requestedQuestion = question;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setClassification(null);
    setInputError(null);
    setConfirmError(null);
    setPhase("checking");

    try {
      const response = await fetch("/api/classify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("classification-request-failed");
      const body: unknown = await response.json();
      const parsed = parseClassificationResponse(JSON.stringify(body));
      if (!parsed) throw new Error("classification-response-invalid");
      if (
        requestIdRef.current !== requestId ||
        roundKeyRef.current !== requestedRoundKey ||
        question !== requestedQuestion
      ) {
        return;
      }
      setClassification(parsed);
      setPhase("review");
    } catch {
      if (
        requestIdRef.current !== requestId ||
        roundKeyRef.current !== requestedRoundKey
      ) {
        return;
      }
      setClassification(null);
      setPhase("check-failed");
    } finally {
      if (requestIdRef.current === requestId) abortRef.current = null;
    }
  }

  async function confirmQuestion() {
    const trimmed = question.trim();
    const validationError = validateQuestion(trimmed);
    if (validationError) {
      setInputError(validationError);
      setPhase("writing");
      return;
    }

    const confirmId = requestIdRef.current + 1;
    requestIdRef.current = confirmId;
    const requestedRoundKey = roundKey;
    const requestedQuestion = question;
    setInputError(null);
    setConfirmError(null);
    setConfirming(true);
    try {
      const confirmed = await onConfirm(trimmed);
      if (
        requestIdRef.current !== confirmId ||
        roundKeyRef.current !== requestedRoundKey ||
        question !== requestedQuestion
      ) {
        return;
      }
      if (!confirmed) {
        setConfirmError(text.ladderQuestionConfirmError);
        return;
      }
      setQuestion("");
      setClassification(null);
      setPhase("writing");
    } catch {
      if (
        requestIdRef.current === confirmId &&
        roundKeyRef.current === requestedRoundKey
      ) {
        setConfirmError(text.ladderQuestionConfirmError);
      }
    } finally {
      if (requestIdRef.current === confirmId) setConfirming(false);
    }
  }

  const openness = classification
    ? Math.round((1 - classification.closureScore) * 100)
    : null;
  const closureLabel = classification?.closure === "open"
    ? text.ladderOpenQuestion
    : text.ladderClosedQuestion;
  const cognitiveLabel = classification
    ? {
      factual: text.ladderFactualQuestion,
      conceptual: text.ladderConceptualQuestion,
      controversial: text.ladderControversialQuestion,
    }[classification.cognitive]
    : "";

  return (
    <section
      className="space-y-4 rounded-lg border border-border bg-card p-4 text-card-foreground"
      data-state={phase}
    >
      <div className="space-y-2">
        <label className="block break-words font-black text-foreground" htmlFor={`ladder-question-${roundKey}`}>
          {text.ladderQuestionLabel(topic)}
        </label>
        <textarea
          aria-describedby={`ladder-question-help-${roundKey}`}
          className="h-28 w-full resize-none rounded-lg border-2 border-input bg-background p-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-violet-600 dark:focus:border-violet-300"
          id={`ladder-question-${roundKey}`}
          onChange={(event) => handleQuestionChange(event.target.value)}
          placeholder={text.ladderQuestionPlaceholder(topic)}
          value={question}
        />
        <div
          className="flex items-start justify-between gap-3 text-xs text-muted-foreground"
          id={`ladder-question-help-${roundKey}`}
        >
          <span>{text.ladderQuestionFormHint}</span>
          <span className="shrink-0">
            {question.length}/{QUESTION_GAME_LIMITS.question}
          </span>
        </div>
        {inputError && (
          <p className="text-sm font-bold text-rose-700 dark:text-rose-300" role="alert">
            {inputError}
          </p>
        )}
      </div>

      {phase === "writing" && (
        <Button
          className="w-full bg-violet-700 font-black text-white hover:bg-violet-800 dark:bg-violet-300 dark:text-violet-950 dark:hover:bg-violet-200"
          onClick={() => void checkQuestion()}
          type="button"
        >
          {text.ladderQuestionCheck}
        </Button>
      )}

      {phase === "checking" && (
        <p
          aria-live="polite"
          className="border-y border-border py-3 text-center text-sm font-bold text-indigo-700 dark:text-indigo-300"
        >
          {text.ladderQuestionChecking}
        </p>
      )}

      {phase === "review" && classification && openness !== null && (
        <section
          aria-label={text.ladderQuestionReviewLabel}
          className="space-y-4 border-y border-border py-4"
        >
          <div className="flex flex-wrap gap-2 text-sm font-black">
            <span className="rounded-md bg-indigo-100 px-3 py-1.5 text-indigo-950 dark:bg-indigo-950 dark:text-indigo-100">
              {text.ladderQuestionOpenness(openness)}
            </span>
            <span className="rounded-md bg-violet-100 px-3 py-1.5 text-violet-950 dark:bg-violet-950 dark:text-violet-100">
              {closureLabel}
            </span>
            <span className="rounded-md bg-emerald-100 px-3 py-1.5 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100">
              {cognitiveLabel}
            </span>
          </div>

          {classification.reasoning && (
            <div className="space-y-1">
              <h3 className="text-sm font-black text-foreground">
                {text.ladderQuestionReasonLabel}
              </h3>
              <p className="break-words text-sm leading-6 text-foreground">
                {classification.reasoning}
              </p>
            </div>
          )}
          {classification.feedback && (
            <div className="space-y-1 border-l-4 border-indigo-500 bg-indigo-50 p-3 text-indigo-950 dark:border-indigo-300 dark:bg-indigo-950 dark:text-indigo-100">
              <h3 className="text-sm font-black">
                {text.ladderQuestionHelpLabel}
              </h3>
              <p className="break-words text-sm leading-6">
                {classification.feedback}
              </p>
            </div>
          )}
          {classification.inappropriate && (
            <p className="text-sm font-bold text-rose-700 dark:text-rose-300" role="alert">
              {classification.inappropriateReason || text.ladderQuestionInappropriate}
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              className="border-border bg-background text-foreground"
              disabled={confirming}
              onClick={() => {
                setClassification(null);
                setConfirmError(null);
                setPhase("writing");
              }}
              type="button"
              variant="outline"
            >
              {text.ladderQuestionRewrite}
            </Button>
            <Button
              className="bg-violet-700 font-black text-white hover:bg-violet-800 dark:bg-violet-300 dark:text-violet-950 dark:hover:bg-violet-200"
              disabled={confirming}
              onClick={() => void confirmQuestion()}
              type="button"
            >
              {confirming
                ? text.ladderQuestionConfirming
                : text.ladderQuestionConfirm}
            </Button>
          </div>
        </section>
      )}

      {phase === "check-failed" && (
        <section className="space-y-3 border-y border-border py-4">
          <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
            {text.ladderQuestionCheckFailed}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              className="border-border bg-background text-foreground"
              disabled={confirming}
              onClick={() => void checkQuestion()}
              type="button"
              variant="outline"
            >
              {text.ladderQuestionRetryCheck}
            </Button>
            <Button
              className="bg-violet-700 font-black text-white hover:bg-violet-800 dark:bg-violet-300 dark:text-violet-950 dark:hover:bg-violet-200"
              disabled={confirming}
              onClick={() => void confirmQuestion()}
              type="button"
            >
              {confirming
                ? text.ladderQuestionConfirming
                : text.ladderQuestionConfirmWithoutHelp}
            </Button>
          </div>
        </section>
      )}

      {confirmError && (
        <p className="text-sm font-bold text-rose-700 dark:text-rose-300" role="alert">
          {confirmError}
        </p>
      )}
    </section>
  );
}

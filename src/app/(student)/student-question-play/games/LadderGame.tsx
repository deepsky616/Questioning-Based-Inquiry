"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  assignLadderTopics,
  type LadderGrid,
  type LadderTopicAssignment,
} from "@/lib/question-ladder";
import { getQuestionGameText } from "@/lib/question-game-i18n";
import {
  QUESTION_GAME_LIMITS,
  QUESTION_GAME_RULES,
} from "@/lib/question-game-rules";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";
import LadderBoard, { type LadderBoardAssignment } from "./LadderBoard";
import LadderQuestionComposer from "./LadderQuestionComposer";
import { useAIPlay } from "./useAIPlay";
import { useGameRun, type GameRunSnapshot } from "./useGameRun";
import { GameLearningSummary } from "./GameLearningSummary";
import { LearningSoundToggle } from "@/components/shared/LearningSoundToggle";
import { useLearningSounds } from "@/lib/learning-sounds";

const MAX_ROUNDS = QUESTION_GAME_RULES.ladder.targets.solo.count;
const SOLO_COLUMN_COUNT = 4;
const AI_COLUMN_COUNT = 2;
const PRIMARY_ACTION_CLASS = "w-full whitespace-normal rounded-lg bg-violet-700 font-black text-white hover:bg-violet-800 dark:bg-violet-300 dark:text-violet-950 dark:hover:bg-violet-200";

type LocalPhase = "setup" | "reveal" | "compose" | "round-summary" | "done";
type RoundNumber = 1 | 2 | 3;
type AIQuestionState = "idle" | "loading" | "ready" | "failed";

interface LocalQuestionRecord {
  round: RoundNumber;
  startColumn: number;
  destinationColumn: number;
  topic: string;
  question: string;
}

interface Props {
  game: BuiltInGame;
  onBack: () => void;
  config: GameStartConfig;
}

function columnLetter(column: number): string {
  return String.fromCharCode(65 + column);
}

function firstNonEmptyLine(value: string | undefined): string {
  return value
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}

export default function LadderGame({ game, onBack, config }: Props) {
  const locale = useLocale();
  const t = useTranslations("gamePlay");
  const text = getQuestionGameText(locale);
  const { play: playSound } = useLearningSounds();
  const isAI = config.mode === "ai";
  const columnCount = isAI ? AI_COLUMN_COUNT : SOLO_COLUMN_COUNT;
  const myName = config.players[0]?.trim() || text.me;
  const aiName = config.players[1]?.trim() || "AI";
  const { ask } = useAIPlay();
  const {
    run,
    result: runResult,
    pending: runPending,
    error: runError,
    conflict: runConflict,
    unconfirmedQuestion,
    start: startRun,
    submitLadderQuestion,
    reset: resetRun,
    clearError: clearRunError,
  } = useGameRun();

  const [phase, setPhase] = useState<LocalPhase>("setup");
  const [round, setRound] = useState<RoundNumber>(1);
  const [topics, setTopics] = useState(() =>
    Array.from({ length: columnCount }, () => ""),
  );
  const [grid, setGrid] = useState<LadderGrid | null>(null);
  const [topicAssignments, setTopicAssignments] = useState<
    LadderTopicAssignment[]
  >([]);
  const [selectedStartColumn, setSelectedStartColumn] = useState<number | null>(null);
  const [questions, setQuestions] = useState<LocalQuestionRecord[]>([]);
  const [roundKey, setRoundKey] = useState("local-round-1-0");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiQuestionState, setAiQuestionState] =
    useState<AIQuestionState>("idle");

  const roundSerialRef = useRef(0);
  const activeRoundKeyRef = useRef("");
  const aiRequestRef = useRef(0);

  const selectedAssignment = selectedStartColumn === null
    ? undefined
    : topicAssignments.find(
      (assignment) => assignment.startColumn === selectedStartColumn,
    );
  const aiAssignment = !isAI || selectedStartColumn === null
    ? undefined
    : topicAssignments.find(
      (assignment) => assignment.startColumn !== selectedStartColumn,
    );
  const latestQuestion = questions.at(-1);
  const runBusy = runPending !== null;
  const backBlocked = runBusy || unconfirmedQuestion !== null;

  const boardAssignments: LadderBoardAssignment[] = topicAssignments.map(
    (assignment) => {
      let playerName = text.ladderStartName(assignment.startColumn + 1);
      if (isAI && selectedStartColumn !== null) {
        playerName = assignment.startColumn === selectedStartColumn ? myName : aiName;
      }
      return { ...assignment, playerName };
    },
  );

  function normalizedTopics(): string[] {
    return Array.from({ length: columnCount }, (_, index) =>
      topics[index]?.trim()
      || text.defaultTopic(columnLetter(index)),
    );
  }

  function applyServerRound(activeRun: GameRunSnapshot, nextRound: RoundNumber) {
    if (
      activeRun.gameId !== "ladder" ||
      activeRun.mode !== (isAI ? "AI" : "SOLO") ||
      activeRun.status !== "ACTIVE" ||
      activeRun.ladderRound !== nextRound ||
      !activeRun.ladderGrid
    ) return false;
    const nextGrid = activeRun.ladderGrid;
    const nextAssignments = assignLadderTopics(normalizedTopics(), nextGrid);
    roundSerialRef.current += 1;
    const nextRoundKey = `${activeRun.id}-${activeRun.version}-${roundSerialRef.current}`;

    aiRequestRef.current += 1;
    activeRoundKeyRef.current = nextRoundKey;
    setRound(nextRound);
    setGrid(nextGrid);
    setTopicAssignments(nextAssignments);
    setSelectedStartColumn(null);
    setRoundKey(nextRoundKey);
    setAiQuestion("");
    setAiQuestionState("idle");
    setPhase("reveal");
    return true;
  }

  async function startLadder() {
    if (runBusy || runConflict) return;
    clearRunError();
    const activeRun = run ?? await startRun(
      game.id,
      isAI ? "ai" : "solo",
      normalizedTopics(),
      locale,
    );
    if (activeRun) applyServerRound(activeRun, 1);
  }

  function prepareRound(nextRound: RoundNumber) {
    if (!run || runBusy || runConflict) return;
    clearRunError();
    applyServerRound(run, nextRound);
  }

  async function requestAIQuestion(
    assignment: LadderTopicAssignment,
    requestedRoundKey: string,
  ) {
    const requestId = aiRequestRef.current + 1;
    aiRequestRef.current = requestId;
    setAiQuestion("");
    setAiQuestionState("loading");

    let response: Awaited<ReturnType<typeof ask>> = null;
    try {
      response = await ask({
        action: "ladder:suggest",
        context: { topic: assignment.topic },
      });
    } catch {
      response = null;
    }

    if (
      aiRequestRef.current !== requestId
      || activeRoundKeyRef.current !== requestedRoundKey
    ) {
      return;
    }

    const nextQuestion = firstNonEmptyLine(response?.text);
    setAiQuestion(nextQuestion);
    setAiQuestionState(nextQuestion ? "ready" : "failed");
  }

  function chooseStart(startColumn: number) {
    if (phase !== "reveal") return;
    const assignment = topicAssignments.find(
      (candidate) => candidate.startColumn === startColumn,
    );
    if (!assignment) return;

    playSound("reveal");
    setSelectedStartColumn(startColumn);
    setPhase("compose");

    if (isAI) {
      const nextAIAssignment = topicAssignments.find(
        (candidate) => candidate.startColumn !== startColumn,
      );
      if (nextAIAssignment) {
        void requestAIQuestion(nextAIAssignment, roundKey);
      }
    }
  }

  async function confirmQuestion(question: string): Promise<boolean> {
    if (
      phase !== "compose" ||
      !selectedAssignment ||
      selectedStartColumn === null ||
      !run ||
      runBusy ||
      runConflict
    ) return false;

    clearRunError();
    const saved = await submitLadderQuestion(
      question,
      selectedStartColumn,
      locale,
      run,
    );
    if (!saved) return false;
    playSound("success");

    const record: LocalQuestionRecord = {
      round,
      startColumn: selectedAssignment.startColumn,
      destinationColumn: selectedAssignment.destinationColumn,
      topic: selectedAssignment.topic,
      question,
    };
    setQuestions((current) => [...current, record]);

    if (saved.result || saved.run.status === "SETTLED") {
      aiRequestRef.current += 1;
      activeRoundKeyRef.current = "";
      setPhase("done");
    } else {
      setPhase("round-summary");
    }
    return true;
  }

  function resetGame() {
    aiRequestRef.current += 1;
    activeRoundKeyRef.current = "";
    roundSerialRef.current = 0;
    setPhase("setup");
    setRound(1);
    setGrid(null);
    setTopicAssignments([]);
    setSelectedStartColumn(null);
    setQuestions([]);
    setRoundKey("local-round-1-0");
    setAiQuestion("");
    setAiQuestionState("idle");
    resetRun();
  }

  function handleBack() {
    if (backBlocked) return;
    aiRequestRef.current += 1;
    activeRoundKeyRef.current = "";
    resetRun();
    onBack();
  }

  function renderAIQuestion() {
    if (!isAI || !aiAssignment) return null;

    return (
      <section
        aria-label={text.aiFriendQuestion}
        className="min-w-0 space-y-3 rounded-lg border border-border bg-card p-4 text-card-foreground"
      >
        <div className="space-y-1">
          <h3 className="font-black text-foreground">{text.aiFriendQuestion}</h3>
          <p className="break-words text-sm font-bold text-emerald-700 dark:text-emerald-300">
            {aiAssignment.topic}
          </p>
        </div>
        {aiQuestionState === "loading" && (
          <p
            aria-live="polite"
            className="text-sm font-bold text-indigo-700 dark:text-indigo-300"
          >
            {text.aiFriendThinking}
          </p>
        )}
        {aiQuestionState === "ready" && (
          <p className="break-words text-sm leading-6 text-foreground">
            {aiQuestion}
          </p>
        )}
        {aiQuestionState === "failed" && (
          <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
            {text.ladderAIQuestionUnavailable}
          </p>
        )}
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 text-foreground">
      <header className="flex items-center gap-3">
        <button
          className="shrink-0 text-sm font-bold text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled={backBlocked}
          onClick={handleBack}
          type="button"
        >
          {text.backToList}
        </button>
        <div
          className="flex min-w-0 flex-1 items-center gap-4 rounded-lg px-5 py-4 text-white"
          style={{ background: game.gradientCss }}
        >
          <span aria-hidden="true" className="text-4xl">{game.emoji}</span>
          <div className="min-w-0">
            <h1 className="break-words text-xl font-black">{game.title}</h1>
            <p className="break-words text-sm text-white">{text.ladderSubtitle}</p>
          </div>
        </div>
        <LearningSoundToggle />
      </header>

      {runConflict && (
        <div className="space-y-3">
          <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            {runConflict}
          </div>
          <Button className="w-full" onClick={handleBack} type="button" variant="outline">
            {t("returnToGameSelection")}
          </Button>
        </div>
      )}

      {!runConflict && runError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200">
          {runError}
        </div>
      )}

      {!runConflict && phase === "setup" && (
        <section className="space-y-5 rounded-lg border border-border bg-card p-5 text-card-foreground">
          <div className="space-y-1">
            <h2 className="font-black text-foreground">
              {text.ladderSetupTitle(MAX_ROUNDS)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {text.ladderRoundProgress(1, MAX_ROUNDS)}
            </p>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {Array.from({ length: columnCount }, (_, index) => {
              const inputId = `local-ladder-topic-${index}`;
              return (
                <div className="min-w-0 space-y-1.5" key={inputId}>
                  <label
                    className="block break-words text-sm font-bold text-foreground"
                    htmlFor={inputId}
                  >
                    {text.ladderTopicInputLabel(index + 1)}
                  </label>
                  <Input
                    className="w-full rounded-lg border-input bg-background text-foreground placeholder:text-muted-foreground"
                    id={inputId}
                    maxLength={QUESTION_GAME_LIMITS.topic}
                    onChange={(event) => {
                      const nextTopics = [...topics];
                      nextTopics[index] = event.target.value;
                      setTopics(nextTopics);
                    }}
                    placeholder={text.defaultTopic(columnLetter(index))}
                    value={topics[index] ?? ""}
                  />
                </div>
              );
            })}
          </div>
          <Button
            className={PRIMARY_ACTION_CLASS}
            disabled={runBusy}
            onClick={() => void startLadder()}
            type="button"
          >
            {runPending === "create" ? text.loading : text.drawLadder}
          </Button>
        </section>
      )}

      {grid && phase !== "setup" && phase !== "done" && (
        <section className="space-y-5">
          <p className="text-center text-sm font-black text-violet-700 dark:text-violet-300">
            {text.ladderRoundProgress(round, MAX_ROUNDS)}
          </p>
          <LadderBoard
            assignments={boardAssignments}
            grid={grid}
            locale={locale}
            selectedStartColumn={selectedStartColumn}
          />

          {phase === "reveal" && (
            <section className="space-y-3 border-y border-border py-4">
              <h2 className="text-center font-black text-foreground">
                {text.ladderChooseStart}
              </h2>
              <div
                className={isAI
                  ? "grid grid-cols-2 gap-2"
                  : "grid grid-cols-2 gap-2 sm:grid-cols-4"}
              >
                {topicAssignments.map((assignment) => (
                  <Button
                    className="min-h-11 whitespace-normal rounded-lg border-border bg-background text-foreground"
                    key={assignment.startColumn}
                    onClick={() => chooseStart(assignment.startColumn)}
                    type="button"
                    variant="outline"
                  >
                    {text.ladderChooseStartButton(assignment.startColumn + 1)}
                  </Button>
                ))}
              </div>
            </section>
          )}

          {phase === "compose" && selectedAssignment && (
            <section className="space-y-4">
              <div className="min-w-0 border-y border-border py-4 text-center">
                <p className="text-sm font-bold text-muted-foreground">
                  {text.playerTopic(myName)}
                </p>
                <p className="break-words text-lg font-black text-emerald-700 dark:text-emerald-300">
                  {selectedAssignment.topic}
                </p>
              </div>
              <div className={isAI ? "grid min-w-0 gap-4 lg:grid-cols-2" : "min-w-0"}>
                <LadderQuestionComposer
                  inputLocked={runBusy || unconfirmedQuestion !== null || Boolean(runConflict)}
                  locale={locale}
                  onConfirm={confirmQuestion}
                  roundKey={roundKey}
                  topic={selectedAssignment.topic}
                />
                {renderAIQuestion()}
              </div>
            </section>
          )}

          {phase === "round-summary" && latestQuestion && (
            <section className="space-y-4 border-y border-border py-5 text-foreground">
              <h2 className="font-black text-foreground">
                {text.ladderRoundSummaryTitle(round)}
              </h2>
              <div className="min-w-0 space-y-1 border-y border-border py-3">
                <p className="break-words text-sm font-bold text-emerald-700 dark:text-emerald-300">
                  {latestQuestion.topic}
                </p>
                <p className="break-words leading-7 text-foreground">
                  {latestQuestion.question}
                </p>
              </div>
              {renderAIQuestion()}
              <Button
                className={PRIMARY_ACTION_CLASS}
                onClick={() => prepareRound((round + 1) as RoundNumber)}
                type="button"
              >
                {text.ladderNextRound}
              </Button>
            </section>
          )}
        </section>
      )}

      {phase === "done" && (
        <section className="space-y-5 rounded-lg border border-border bg-card p-5 text-card-foreground">
          <div className="space-y-1 text-center">
            <h2 className="text-xl font-black text-foreground">
              {text.ladderDoneTitle}
            </h2>
            <p className="text-sm text-muted-foreground">
              {text.ladderDoneDescription(MAX_ROUNDS)}
            </p>
          </div>
          <ol
            aria-label={text.ladderRecordedQuestions(MAX_ROUNDS)}
            className="divide-y divide-border border-y border-border"
          >
            {questions.map((record) => (
              <li className="min-w-0 space-y-2 py-4" key={record.round}>
                <p className="break-words text-xs font-bold text-muted-foreground">
                  {text.ladderQuestionRecordLabel(
                    record.round,
                    record.startColumn + 1,
                    columnLetter(record.destinationColumn),
                    record.topic,
                  )}
                </p>
                <p className="break-words leading-7 text-foreground">
                  {record.question}
                </p>
              </li>
            ))}
          </ol>
          {runResult && (
            <div
              role="status"
              className={`rounded-lg border px-4 py-3 text-sm ${
                runResult.awarded > 0
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                  : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
              }`}
            >
              <p className="font-bold">
                {runResult.preview
                  ? (t("previewCompletedWithoutPoints"))
                  : runResult.awarded > 0
                    ? (t("awardedPointsEarned", { awarded: runResult.awarded }))
                    : (t("theDailyPointLimitHas"))}
              </p>
              {!runResult.preview && runResult.dailyRemaining > 0 && (
                <p className="mt-1 text-xs">
                  {t("dailyremainingPointsAreStillAvailable", { dailyRemaining: runResult.dailyRemaining })}
                </p>
              )}
            </div>
          )}
          <GameLearningSummary
            mode={isAI ? "ai" : "solo"}
            completedActivities={questions.length}
            questions={questions.map((record) => record.question)}
            points={runResult?.awarded}
            accentColor={game.accentColor}
            embedded
          />
          <Button
            className="w-full whitespace-normal rounded-lg border-border bg-background text-foreground"
            onClick={resetGame}
            type="button"
            variant="outline"
          >
            {text.newGame}
          </Button>
        </section>
      )}
    </div>
  );
}

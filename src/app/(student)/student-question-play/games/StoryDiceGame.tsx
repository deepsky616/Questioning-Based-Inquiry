"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { GameHeader } from "./GameHeader";
import { useAIPlay } from "./useAIPlay";
import { useSingleAward, AwardBadge } from "./useSingleAward";
import {
  STORY_DICE_EMOJI, STORY_DICE_COLOR,
  pickFallbackWords, parseAIWords, getWordEmoji, StoryDiceWords, DiceCategory,
} from "@/lib/story-dice-data";
import { getQuestionGameText, getStoryDiceCategoryLabel } from "@/lib/question-game-i18n";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";

interface ChainItem { type: "story" | "question" | "answer"; text: string; author: string; isAI?: boolean }

interface Props { game: BuiltInGame; onBack: () => void; config: GameStartConfig }

function pickOne<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export default function StoryDiceGame({ game, onBack, config }: Props) {
  const locale = useLocale();
  const text = getQuestionGameText(locale);
  const { mode, players } = config;
  const isAI = mode === "ai";
  const isMulti = mode !== "solo";

  const myName = players[0]?.trim() || text.me;
  const aiName = "🤖 AI";

  const [phase, setPhase] = useState<"loading" | "rolling" | "story" | "qa" | "done">("loading");
  const [words, setWords] = useState<StoryDiceWords | null>(null);
  const [rolled, setRolled] = useState<{ protagonist: string; place: string; event: string } | null>(null);
  const [chain, setChain] = useState<ChainItem[]>([]);
  const [input, setInput] = useState("");
  const [rolling, setRolling] = useState<{ protagonist: string; place: string; event: string } | null>(null);
  const [animTick, setAnimTick] = useState(0);

  const initRef = useRef(false);
  const { ask, loading: aiLoading } = useAIPlay();
  const { award, result: awardResult, reset: resetAward } = useSingleAward();

  // 적립 (혼자/AI 모드)
  useEffect(() => {
    if (phase !== "done") return;
    if (mode !== "solo" && mode !== "ai") return;
    const myUtterances = chain.filter((c) => !c.isAI && c.type !== "story").length
      + chain.filter((c) => c.type === "story" && !c.isAI).length;
    award({
      mode: mode as "solo" | "ai",
      gameId: "story-dice",
      validQuestions: myUtterances,
      completed: chain.length >= 4,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // 1) 시작 시 단어 생성
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    (async () => {
      const res = await ask({ action: "story-dice:words" });
      const parsed = (res?.parsed as unknown as StoryDiceWords | undefined)
        ?? (res?.text ? parseAIWords(res.text) : null)
        ?? pickFallbackWords(8, locale);
      setWords(parsed);
      setPhase("rolling");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function rollDice() {
    if (!words || rolling) return;
    setRolling({ protagonist: "?", place: "?", event: "?" });
    let count = 0;
    const final = {
      protagonist: pickOne(words.protagonist),
      place: pickOne(words.place),
      event: pickOne(words.event),
    };
    const iv = setInterval(() => {
      setAnimTick((t) => t + 1);
      setRolling({
        protagonist: pickOne(words!.protagonist),
        place: pickOne(words!.place),
        event: pickOne(words!.event),
      });
      count++;
      if (count >= 14) {
        clearInterval(iv);
        setRolling(null);
        setRolled(final);
        setPhase("story");
      }
    }, 100);
  }

  async function submitStory() {
    const trimmed = input.trim();
    if (!trimmed) return;
    setChain([{ type: "story", text: trimmed, author: myName }]);
    setInput("");
    setPhase("qa");
    // AI 모드: 첫 질문은 AI가
    if (isAI && rolled) {
      setTimeout(() => askAIQuestion([{ type: "story", text: trimmed, author: myName }]), 400);
    }
  }

  async function askAIQuestion(currentChain: ChainItem[]) {
    if (!rolled) return;
    const history = currentChain
      .filter((c) => c.type !== "story")
      .map((c) => `${c.type === "question" ? "Q" : "A"}: ${c.text}`)
      .join("\n");
    const res = await ask({
      action: "story-dice:ai-question",
      context: {
        protagonist: rolled.protagonist, place: rolled.place, event: rolled.event,
        story: currentChain[0]?.text ?? "",
        history,
      },
    });
    if (res?.text) {
      const newItem: ChainItem = { type: "question", text: res.text.trim(), author: aiName, isAI: true };
      setChain((c) => [...c, newItem]);
    }
  }

  async function submitQuestion() {
    const trimmed = input.trim();
    if (!trimmed) return;
    const item: ChainItem = { type: "question", text: trimmed, author: myName };
    const newChain = [...chain, item];
    setChain(newChain);
    setInput("");
    // AI 모드: 술래가 학생일 때 AI는 질문자 → 여기는 학생이 질문 → 학생(술래)이 대답
    // 실제로는 AI 모드에서 술래=학생, 질문자=AI이므로 학생이 답변 차례.
  }

  async function submitAnswer() {
    const trimmed = input.trim();
    if (!trimmed) return;
    const item: ChainItem = { type: "answer", text: trimmed, author: myName };
    const newChain = [...chain, item];
    setChain(newChain);
    setInput("");
    // AI 모드: 다음 AI 질문 자동
    if (isAI) {
      setTimeout(() => askAIQuestion(newChain), 400);
    }
  }

  function endGame() { setPhase("done"); }

  /* ── 결과 ── */
  if (phase === "done") {
    const myQs = chain.filter((c) => c.type === "question" && !c.isAI).length;
    const myAs = chain.filter((c) => c.type === "answer" && !c.isAI).length;
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <GameHeader game={game} subtitle={text.storyCompleteSubtitle} onBack={onBack} />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center gap-3">
          <div className="text-6xl">📖</div>
          <h2 className="text-2xl font-black text-gray-800">{text.storyDoneTitle}</h2>
          <p className="text-gray-500 text-sm">{text.storyStats(myQs, myAs, chain.length)}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3 max-h-80 overflow-y-auto">
          <h3 className="font-black text-gray-700">{text.completedStory}</h3>
          {chain.map((c, i) => (
            <div key={i} className="flex gap-2 items-start">
              <span className="text-base">{c.type === "story" ? "📖" : c.type === "question" ? "?" : "💬"}</span>
              <div>
                <p className="text-xs text-gray-400">{c.author}</p>
                <p className="text-gray-800 text-sm">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
        <AwardBadge result={awardResult} />
        <Button className="w-full py-4 font-black text-white rounded-xl"
          style={{ background: game.gradientCss }}
          onClick={() => { resetAward(); onBack(); }}>
          {text.goOtherGame}
        </Button>
      </div>
    );
  }

  /* ── 단어 준비 중 ── */
  if (phase === "loading" || !words) {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <GameHeader game={game} subtitle={text.storyWordsLoading} onBack={onBack} />
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center space-y-3">
          <div className="text-6xl animate-bounce">🎲</div>
          <p className="text-gray-500 text-sm">
            {isAI && aiLoading ? text.storyAiWords : text.loading}
          </p>
        </div>
      </div>
    );
  }

  const lastChain = chain[chain.length - 1];
  const nextAction: "question" | "answer" =
    !lastChain || lastChain.type === "story" || lastChain.type === "answer" ? "question" : "answer";
  // 모드별 다음 입력자:
  //  - solo: 본인이 모두
  //  - friend: 다음 사람 (단순화)
  //  - ai: 학생(나)은 술래 → 이야기/대답, AI = 질문자
  const inputDisabled = isAI && nextAction === "question"; // AI 모드에서 질문은 AI 차례
  const inputPlaceholder =
    nextAction === "question"
      ? text.storyQuestionPlaceholder
      : text.storyAnswerPlaceholder;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <GameHeader game={game} subtitle={isAI ? text.storyWithAi : text.storyTogether} onBack={onBack} />

      {/* 단어 풀 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <h3 className="text-xs font-black text-gray-600">{text.storyWordPool}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {(["protagonist", "place", "event"] as DiceCategory[]).map((cat) => (
            <div key={cat} className="rounded-xl p-2 border"
              style={{ borderColor: STORY_DICE_COLOR[cat] + "40", background: STORY_DICE_COLOR[cat] + "08" }}>
              <p className="text-xs font-bold text-center mb-1" style={{ color: STORY_DICE_COLOR[cat] }}>
                {STORY_DICE_EMOJI[cat]} {getStoryDiceCategoryLabel(locale, cat)}
              </p>
              <div className="flex flex-wrap gap-1 justify-center">
                {words[cat].map((w) => (
                  <span key={w} className="text-[11px] bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-600">
                    {getWordEmoji(w, cat, words?.emojis)} {w}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 주사위 결과 */}
      {(rolled || rolling) && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-200 p-4 grid grid-cols-3 gap-3">
          {(["protagonist", "place", "event"] as DiceCategory[]).map((cat) => {
            const value = rolling ? rolling[cat] : rolled![cat];
            return (
              <div key={cat} className="text-center">
                <p className="text-xs font-bold mb-1" style={{ color: STORY_DICE_COLOR[cat] }}>
                  {STORY_DICE_EMOJI[cat]} {getStoryDiceCategoryLabel(locale, cat)}
                </p>
                <div className="rounded-2xl py-3 text-white shadow-md flex flex-col items-center gap-0.5"
                  style={{
                    background: STORY_DICE_COLOR[cat],
                    transform: rolling ? `rotate(${animTick * 5}deg)` : "none",
                    transition: "transform 0.1s",
                  }}>
                  <span className="text-3xl leading-none">
                    {value === "?" ? "🎲" : getWordEmoji(value, cat, words?.emojis)}
                  </span>
                  <span className="text-lg font-black">{value}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 단계별 UI */}
      {phase === "rolling" && (
        <Button className="w-full py-4 text-lg font-black text-white rounded-2xl"
          style={{ background: "linear-gradient(135deg, #FB923C, #EF4444)" }}
          onClick={rollDice} disabled={!!rolling}>
          {rolling ? text.diceRolling : text.storyRoll3}
        </Button>
      )}

      {phase === "story" && rolled && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <p className="text-sm font-bold text-gray-700">{text.storyMakeSentence}</p>
          <textarea
            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none h-24"
            placeholder={text.storyPlaceholder(rolled.protagonist, rolled.place, rolled.event)}
            value={input} onChange={(e) => setInput(e.target.value)}
            autoFocus />
          <Button className="w-full font-bold text-white rounded-xl"
            style={{ background: "linear-gradient(135deg, #FB923C, #EF4444)" }}
            disabled={!input.trim()}
            onClick={submitStory}>
            {text.storyStart}
          </Button>
        </div>
      )}

      {phase === "qa" && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2 max-h-72 overflow-y-auto">
            {chain.map((c, i) => (
              <div key={i} className="flex gap-2.5 items-start">
                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white"
                  style={{ background: c.type === "story" ? "#f59e0b" : c.isAI ? "#6366f1" : "#ef4444" }}>
                  {c.type === "story" ? "📖" : c.type === "question" ? "?" : "💬"}
                </div>
                <div className="flex-1 rounded-xl px-3 py-2 text-sm"
                  style={{
                    background: c.type === "story" ? "#fef3c7" : c.isAI ? "#eef2ff" : "#fff7ed",
                    border: i === chain.length - 1 ? "2px solid #fdba74" : "none",
                  }}>
                  <p className="text-[11px] font-bold mb-0.5" style={{ color: c.isAI ? "#6366f1" : "#ef4444" }}>
                    {c.author} ({c.type === "story" ? text.story : c.type === "question" ? text.question : text.answer})
                  </p>
                  {c.text}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="flex items-center gap-2 text-indigo-500 text-sm pl-9 py-1">
                <span className="w-3 h-3 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
                {text.aiThinking}
              </div>
            )}
          </div>

          {!inputDisabled && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <textarea
                className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none h-20"
                placeholder={inputPlaceholder}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={aiLoading}
                autoFocus />
              <Button className="w-full font-bold text-white rounded-xl"
                style={{ background: "linear-gradient(135deg, #FB923C, #EF4444)" }}
                disabled={!input.trim() || aiLoading}
                onClick={nextAction === "question" ? submitQuestion : submitAnswer}>
                {nextAction === "question" ? text.storySubmitQuestion : text.storySubmitAnswer}
              </Button>
            </div>
          )}

          {isAI && inputDisabled && !aiLoading && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center text-indigo-600 text-sm">
              {text.storyAiWillAsk}
            </div>
          )}

          {chain.length >= 4 && (
            <Button variant="outline" className="w-full rounded-xl text-gray-500"
              onClick={endGame}>
              {text.storyFinish}
            </Button>
          )}
        </>
      )}

      {!isMulti && phase === "qa" && (
        <p className="text-xs text-gray-400 text-center">
          {text.storySoloHint}
        </p>
      )}
    </div>
  );
}

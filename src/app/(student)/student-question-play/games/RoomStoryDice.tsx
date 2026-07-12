"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RoomHeader, WaitingBanner, playerColorById } from "./roomShared";
import RoomResult from "./RoomResult";
import { useAIPlay } from "./useAIPlay";
import {
  STORY_DICE_LABEL, STORY_DICE_EMOJI, STORY_DICE_COLOR, getWordEmoji,
  pickFallbackWords, parseAIWords, StoryDiceWords, DiceCategory,
} from "@/lib/story-dice-data";
import type { BuiltInGame, GameRoom, RoomActionHandler } from "@/lib/question-games-data";

interface ChainItem { type: "story" | "question" | "answer"; text: string; playerId: string; playerName: string }
interface StoryDiceState {
  phase: "rolling" | "story" | "qa" | "done";
  words: StoryDiceWords | null;
  rolled: { protagonist: string; place: string; event: string } | null;
  chain: ChainItem[];           // story → q → a → q → a ...
  taggerId: string;             // 술래
  nextQuestionerIdx: number;    // 술래 제외 학생들 중 다음 질문자 인덱스
}

interface Props {
  game: BuiltInGame; room: GameRoom; myId: string; actionLoading: boolean;
  onAction: RoomActionHandler;
  onLeave: () => void;
}

function shuffleArr<T>(arr: T[]): T[] { return [...arr].sort(() => Math.random() - 0.5); }
function pickOne<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export default function RoomStoryDice({ game, room, myId, actionLoading, onAction, onLeave }: Props) {
  const isHost = room.hostId === myId;
  const state = room.gameState as unknown as StoryDiceState;
  const hasState = state && typeof state.phase === "string";
  const { ask, loading: aiLoading } = useAIPlay();

  const initRef = useRef(false);

  const [input, setInput] = useState("");
  const [rolling, setRolling] = useState<{ protagonist: string; place: string; event: string } | null>(null);
  const [animTick, setAnimTick] = useState(0);

  // 술래·차례 계산
  const tagger = state?.taggerId ? room.players.find((p) => p.id === state.taggerId) : null;
  const nonTaggers = room.players.filter((p) => p.id !== state?.taggerId);
  const currentQuestioner = nonTaggers.length > 0
    ? nonTaggers[(state?.nextQuestionerIdx ?? 0) % Math.max(nonTaggers.length, 1)]
    : null;
  const lastChain = state?.chain?.[state.chain.length - 1];
  // 다음 행동: story 끝나면 question, question 끝나면 answer, answer 끝나면 다음 question
  const nextAction: "question" | "answer" =
    !lastChain || lastChain.type === "story" || lastChain.type === "answer" ? "question" : "answer";

  const amTagger = state?.taggerId === myId;
  const isMyTurn =
    nextAction === "answer" ? amTagger
    : currentQuestioner?.id === myId;

  /* ── 방장 초기화 ── */
  useEffect(() => {
    if (!isHost || hasState || initRef.current || room.status !== "playing") return;
    initRef.current = true;

    (async () => {
      // AI로 단어 생성, 실패 시 폴백
      const res = await ask({ action: "story-dice:words" });
      const parsed = (res?.parsed as unknown as StoryDiceWords | undefined)
        ?? (res?.text ? parseAIWords(res.text) : null)
        ?? pickFallbackWords(8);

      const init: StoryDiceState = {
        phase: "rolling",
        words: parsed,
        rolled: null,
        chain: [],
        taggerId: room.players[0]?.id ?? myId,
        nextQuestionerIdx: 0,
      };
      await onAction("set-state", { state: init, turnIndex: 0 });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, hasState, room.status]);

  /* ── 주사위 굴리기 애니메이션 (술래만) ── */
  function rollDice() {
    if (!state.words || rolling) return;
    setRolling({ protagonist: "?", place: "?", event: "?" });
    let count = 0;
    const final = {
      protagonist: pickOne(state.words.protagonist),
      place: pickOne(state.words.place),
      event: pickOne(state.words.event),
    };
    const iv = setInterval(() => {
      setAnimTick((t) => t + 1);
      setRolling({
        protagonist: pickOne(state.words!.protagonist),
        place: pickOne(state.words!.place),
        event: pickOne(state.words!.event),
      });
      count++;
      if (count >= 14) {
        clearInterval(iv);
        setRolling(final);
        setTimeout(() => {
          onAction("update-state", {
            patch: { rolled: final, phase: "story" },
          });
          setRolling(null);
        }, 600);
      }
    }, 100);
  }

  async function submitStory() {
    const trimmed = input.trim();
    if (!trimmed || actionLoading) return;
    const entry: ChainItem = {
      type: "story", text: trimmed, playerId: myId, playerName: tagger?.name ?? "술래",
    };
    const result = await onAction("update-state", {
      patch: { phase: "qa", chain: [entry] },
    });
    if (result.ok) setInput("");
  }

  async function submitQuestion() {
    const trimmed = input.trim();
    if (!trimmed || actionLoading || !currentQuestioner) return;
    const entry: ChainItem = {
      type: "question", text: trimmed, playerId: myId, playerName: currentQuestioner.name,
    };
    const result = await onAction("update-state", {
      patch: { chain: [...(state.chain ?? []), entry] },
    });
    if (result.ok) setInput("");
  }

  async function submitAnswer() {
    const trimmed = input.trim();
    if (!trimmed || actionLoading) return;
    const entry: ChainItem = {
      type: "answer", text: trimmed, playerId: myId, playerName: tagger?.name ?? "술래",
    };
    const result = await onAction("update-state", {
      patch: {
        chain: [...(state.chain ?? []), entry],
        // 다음 질문자로 인덱스 전진
        nextQuestionerIdx: ((state.nextQuestionerIdx ?? 0) + 1) % Math.max(nonTaggers.length, 1),
      },
    });
    if (result.ok) setInput("");
  }

  /* ── 결과 화면 ── */
  if (room.status === "ended" || state?.phase === "done") {
    const scores = room.players.map((p) => ({
      playerId: p.id, name: p.name,
      score: (state?.chain ?? []).filter((c) => c.playerId === p.id && c.type !== "story").length,
    }));
    const questions = (state?.chain ?? [])
      .filter((c) => c.type !== "story")
      .map((c) => ({ playerId: c.playerId, playerName: c.playerName, question: c.text }));
    return (
      <RoomResult game={game} room={room} myId={myId}
        scoreLabel="발화 수" scoreUnit="개"
        scores={scores} questions={questions}
        onAction={onAction} onLeave={onLeave} />
    );
  }

  /* ── 준비 중 ── */
  if (!hasState || !state.words) {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <RoomHeader game={game} room={room} subtitle="이야기 주사위 준비 중" onLeave={onLeave} />
        <WaitingBanner text={isHost && aiLoading ? "AI가 주사위 단어를 만드는 중..." : "잠시만 기다려주세요..."} />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <RoomHeader game={game} room={room}
        subtitle={tagger ? `술래: ${tagger.name}` : ""}
        onLeave={onLeave} />

      {/* 주사위 단어 풀 (한 번 정해지면 끝까지) */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <h3 className="text-xs font-black text-gray-600">🎲 주사위 단어 (게임 끝까지 유지)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {(["protagonist", "place", "event"] as DiceCategory[]).map((cat) => (
            <div key={cat} className="rounded-xl p-2 border"
              style={{ borderColor: STORY_DICE_COLOR[cat] + "40", background: STORY_DICE_COLOR[cat] + "08" }}>
              <p className="text-xs font-bold text-center mb-1" style={{ color: STORY_DICE_COLOR[cat] }}>
                {STORY_DICE_EMOJI[cat]} {STORY_DICE_LABEL[cat]}
              </p>
              <div className="flex flex-wrap gap-1 justify-center">
                {state.words![cat].map((w) => (
                  <span key={w} className="text-[11px] bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-600">
                    {getWordEmoji(w, cat, state.words?.emojis)} {w}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 주사위 굴림 결과 */}
      {(state.rolled || rolling) && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-200 p-4 grid grid-cols-3 gap-3">
          {(["protagonist", "place", "event"] as DiceCategory[]).map((cat) => {
            const value = rolling ? rolling[cat] : state.rolled![cat];
            return (
              <div key={cat} className="text-center">
                <p className="text-xs font-bold mb-1" style={{ color: STORY_DICE_COLOR[cat] }}>
                  {STORY_DICE_EMOJI[cat]} {STORY_DICE_LABEL[cat]}
                </p>
                <div
                  className="rounded-2xl py-3 text-white shadow-md flex flex-col items-center gap-0.5"
                  style={{
                    background: STORY_DICE_COLOR[cat],
                    transform: rolling ? `rotate(${animTick * 5}deg) scale(${1 + (animTick % 2) * 0.05})` : "none",
                    transition: "transform 0.1s",
                  }}>
                  <span className="text-3xl leading-none">
                    {value === "?" ? "🎲" : getWordEmoji(value, cat, state.words?.emojis)}
                  </span>
                  <span className="text-lg font-black">{value}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 단계별 UI */}
      {state.phase === "rolling" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3 text-center">
          <p className="text-sm font-bold text-gray-700">
            🎲 술래({tagger?.name})가 주사위 3개를 굴려요!
          </p>
          {amTagger ? (
            <Button className="w-full py-4 text-lg font-black text-white rounded-2xl"
              style={{ background: "linear-gradient(135deg, #FB923C, #EF4444)" }}
              onClick={rollDice} disabled={!!rolling || actionLoading}>
              {rolling ? "굴리는 중..." : "🎲 주사위 굴리기!"}
            </Button>
          ) : (
            <WaitingBanner text={`${tagger?.name}님이 주사위를 굴리는 중...`} />
          )}
        </div>
      )}

      {state.phase === "story" && state.rolled && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <p className="text-sm font-bold text-gray-700">
            ✏️ 술래({tagger?.name})가 세 단어로 이야기 한 문장을 만들어요!
          </p>
          <p className="text-xs text-gray-500">
            힌트: <span className="font-bold text-red-500">{state.rolled.protagonist}</span>
            가/이 <span className="font-bold text-emerald-600">{state.rolled.place}</span>에서
            <span className="font-bold text-violet-600"> {state.rolled.event}</span>을(를) ...
          </p>
          {amTagger ? (
            <>
              <textarea
                className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none h-24"
                placeholder="단어를 모두 사용해 짧은 이야기를 한 문장으로 만들어보세요..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus />
              <Button className="w-full font-bold text-white rounded-xl"
                style={{ background: "linear-gradient(135deg, #FB923C, #EF4444)" }}
                disabled={!input.trim() || actionLoading}
                onClick={submitStory}>
                이야기 시작! →
              </Button>
            </>
          ) : (
            <WaitingBanner text={`${tagger?.name}님이 이야기를 만드는 중...`} />
          )}
        </div>
      )}

      {state.phase === "qa" && (
        <>
          {/* 이야기 + Q&A 체인 */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2 max-h-72 overflow-y-auto">
            {state.chain.map((c, i) => (
              <div key={i} className="flex gap-2.5 items-start">
                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white"
                  style={{ background: c.type === "story" ? "#f59e0b" : playerColorById(room, c.playerId) }}>
                  {c.type === "story" ? "📖" : c.type === "question" ? "?" : "💬"}
                </div>
                <div className="flex-1 rounded-xl px-3 py-2 text-sm"
                  style={{
                    background: c.type === "story" ? "#fef3c7"
                      : c.type === "question" ? `${playerColorById(room, c.playerId)}12`
                      : "#f3f4f6",
                    border: i === state.chain.length - 1 ? `2px solid ${c.type === "story" ? "#f59e0b" : playerColorById(room, c.playerId)}` : "none",
                  }}>
                  <p className="text-[11px] font-bold mb-0.5" style={{ color: playerColorById(room, c.playerId) }}>
                    {c.playerName} {c.type === "story" ? "(이야기)" : c.type === "question" ? "(질문)" : "(대답)"}
                  </p>
                  {c.text}
                </div>
              </div>
            ))}
          </div>

          {/* 현재 차례 안내 */}
          <div className="rounded-xl px-4 py-3 text-center font-bold"
            style={{
              background: isMyTurn ? `${game.accentColor}15` : "#f9fafb",
              color: isMyTurn ? game.accentColor : "#9ca3af",
            }}>
            {isMyTurn
              ? (nextAction === "question" ? "🙋 내 차례! 이야기에 어울리는 질문을 만들어요" : "💬 내 차례! 학생의 질문에 대답해요")
              : nextAction === "question"
                ? `⏳ ${currentQuestioner?.name}님이 질문을 만드는 중...`
                : `⏳ ${tagger?.name}님이 대답하는 중...`}
          </div>

          {/* 입력 */}
          {isMyTurn ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <textarea
                className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none h-20"
                placeholder={
                  nextAction === "question"
                    ? "이야기/앞 대답에 어울리는 질문을 만들어보세요..."
                    : "학생의 질문에 어울리는 대답을 한 문장으로 해보세요..."
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus />
              <Button className="w-full font-bold text-white rounded-xl"
                style={{
                  background: "linear-gradient(135deg, #FB923C, #EF4444)",
                  opacity: input.trim() && !actionLoading ? 1 : 0.5,
                }}
                disabled={!input.trim() || actionLoading}
                onClick={nextAction === "question" ? submitQuestion : submitAnswer}>
                {nextAction === "question" ? "질문 제출 →" : "대답 제출 →"}
              </Button>
            </div>
          ) : null}

          {/* 방장 종료 */}
          {isHost && state.chain.length >= 4 && (
            <Button variant="outline" className="w-full rounded-xl text-gray-500"
              onClick={() => onAction("update-state", { patch: { phase: "done" }, status: "ended" })}>
              🏁 이야기 마치기
            </Button>
          )}
        </>
      )}
    </div>
  );
}

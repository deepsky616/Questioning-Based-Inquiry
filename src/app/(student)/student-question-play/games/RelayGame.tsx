"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useAIPlay } from "./useAIPlay";
import { useSingleAward, AwardBadge } from "./useSingleAward";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";

const PRESET_TOPICS = [
  "바다", "날씨", "우주", "학교", "음식",
  "동물", "계절", "가족", "미래", "환경",
  "물", "빛", "시간", "꿈", "친구",
];

const PLAYER_COLORS = ["#F97316", "#3B82F6", "#10B981", "#8B5CF6", "#EF4444"];
const AI_COLOR = "#6366f1";

interface ChainItem { question: string; player: string; isAI?: boolean }

function isQuestionForm(text: string): boolean {
  const t = text.trim();
  return /[?？]/.test(t) ||
    /(나요|인가요|할까요|까요|니요|니까|가요|는지요|를까요)\s*$/.test(t);
}

interface Props { game: BuiltInGame; onBack: () => void; config: GameStartConfig }

export default function RelayGame({ game, onBack, config }: Props) {
  const { mode, players } = config;
  const isAI = mode === "ai";
  const isMulti = mode !== "solo";

  const [phase, setPhase] = useState<"setup" | "playing" | "done">("setup");
  const [topic, setTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [chain, setChain] = useState<ChainItem[]>([]);
  const [inputQ, setInputQ] = useState("");
  const [playerIdx, setPlayerIdx] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const chainEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { ask, loading: aiLoading } = useAIPlay();

  const finalTopic = customTopic.trim() || topic;
  const myPlayerName = players[0] ?? "나";
  // 친구 모드에서의 현재 플레이어
  const currentFriendPlayer = players[playerIdx] ?? "나";
  const playerColor = useCallback((name: string) => {
    const i = players.indexOf(name);
    return i >= 0 ? PLAYER_COLORS[i % PLAYER_COLORS.length] : "#9ca3af";
  }, [players]);

  // 체인 끝으로 자동 스크롤
  useEffect(() => {
    chainEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chain, aiLoading]);

  // AI 응답 후 입력창 포커스
  useEffect(() => {
    if (!aiLoading && phase === "playing") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [aiLoading, phase]);

  const { award, result: awardResult } = useSingleAward();

  // 적립 (혼자/AI 모드)
  useEffect(() => {
    if (phase !== "done") return;
    if (mode !== "solo" && mode !== "ai") return;
    const myCount = chain.filter((c) => c.player === myPlayerName).length;
    award({
      mode: mode as "solo" | "ai",
      gameId: "relay",
      validQuestions: myCount,
      completed: chain.length >= 4,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function startGame() {
    if (!finalTopic) return;
    setChain([]);
    setInputQ("");
    setPlayerIdx(0);
    setLocalError(null);
    setPhase("playing");
  }

  // AI가 다음 질문 생성 (체인 추가까지 완료)
  const runAITurn = useCallback(async (currentChain: ChainItem[], t: string) => {
    const prev = currentChain[currentChain.length - 1]?.question ?? "";
    const history = currentChain.map((c) => `"${c.question}"`).join(", ");
    const res = await ask({
      action: "relay:ai-turn",
      context: { topic: t, prev, history },
    });
    if (res?.text) {
      setChain((c) => [...c, { question: res.text.trim(), player: "🤖 AI", isAI: true }]);
    }
  }, [ask]);

  async function submitQuestion() {
    const trimmed = inputQ.trim();
    if (!trimmed || aiLoading) return;

    setLocalError(null);

    // 질문 형식 검사
    if (!isQuestionForm(trimmed)) {
      setLocalError("질문 형태로 써야 해요! (~나요? ~인가요? ~할까요?)");
      return;
    }

    // 중복 검사
    if (chain.some((c) => c.question.trim() === trimmed)) {
      setLocalError("이미 나온 질문이에요! 새로운 질문을 만들어봐요.");
      return;
    }

    // 학생/친구 질문 체인에 추가
    const playerName = isAI ? myPlayerName : currentFriendPlayer;
    const newChain: ChainItem[] = [...chain, { question: trimmed, player: playerName }];
    setChain(newChain);
    setInputQ("");

    if (isAI) {
      // AI가 즉시 다음 질문 생성
      await runAITurn(newChain, finalTopic);
    } else if (isMulti) {
      // 친구 모드: 다음 플레이어로 교대
      setPlayerIdx((i) => (i + 1) % players.length);
    }
  }

  function endGame() {
    setPhase("done");
  }

  const lastItem = chain[chain.length - 1];
  // AI 모드: 직전 질문 (연결 기준)
  const prevForHint = chain.length > 0 ? lastItem : null;

  /* ─── 설정 화면 ─── */
  if (phase === "setup") {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">← 목록</button>
          <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
            style={{ background: game.gradientCss }}>
            <span className="text-4xl">{game.emoji}</span>
            <div>
              <h1 className="text-xl font-black">{game.title}</h1>
              <p className="text-white/80 text-sm">질문만 이어가는 릴레이! 대답 금지 🚫</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
          {/* 규칙 */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-1.5">
            <p className="text-orange-700 font-black text-sm">📜 게임 규칙</p>
            {[
              "앞 질문과 반드시 연결된 새 질문을 만들어요",
              "대답은 절대 금지! 질문만 이어가요",
              "같은 질문 반복 금지!",
            ].map((r, i) => (
              <p key={i} className="text-orange-600 text-sm flex items-start gap-2">
                <span className="flex-shrink-0">•</span>{r}
              </p>
            ))}
            {isAI && (
              <p className="text-indigo-600 text-sm font-bold mt-2 bg-indigo-50 rounded-lg px-3 py-1.5">
                🤖 학생 → AI → 학생 → AI … 순서로 질문이 이어져요
              </p>
            )}
          </div>

          {/* 주제 선택 */}
          <div>
            <p className="text-sm font-black text-gray-700 mb-3">🎯 주제를 골라요!</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {PRESET_TOPICS.map((t) => (
                <button key={t}
                  className="px-3 py-1.5 rounded-full text-sm font-bold border-2 transition-all"
                  style={{
                    borderColor: topic === t ? game.accentColor : "#e5e7eb",
                    background: topic === t ? game.accentColor : "white",
                    color: topic === t ? "white" : "#374151",
                  }}
                  onClick={() => { setTopic(t); setCustomTopic(""); }}>
                  {t}
                </button>
              ))}
            </div>
            <input
              type="text"
              className="w-full border-2 rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors"
              style={{ borderColor: customTopic ? game.accentColor : "#e5e7eb" }}
              onFocus={(e) => { e.target.style.borderColor = game.accentColor; setTopic(""); }}
              onBlur={(e) => { if (!customTopic) e.target.style.borderColor = "#e5e7eb"; }}
              placeholder="직접 입력하기 (예: 공룡, 로봇, 초콜릿...)"
              value={customTopic}
              onChange={(e) => { setCustomTopic(e.target.value); setTopic(""); }}
            />
          </div>

          {finalTopic && (
            <div className="rounded-xl px-4 py-3 text-white text-center font-bold"
              style={{ background: game.gradientCss }}>
              🎯 선택한 주제: <span className="text-xl">{finalTopic}</span>
            </div>
          )}

          <Button className="w-full py-4 font-black text-white rounded-xl text-lg"
            style={{ background: game.gradientCss, opacity: finalTopic ? 1 : 0.4 }}
            disabled={!finalTopic}
            onClick={startGame}>
            🏃 질문 릴레이 시작!
          </Button>
        </div>
      </div>
    );
  }

  /* ─── 결과 화면 ─── */
  if (phase === "done") {
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">← 목록</button>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center gap-4">
          <div className="text-6xl">🏆</div>
          <h2 className="text-2xl font-black text-gray-800">릴레이 완성!</h2>
          <p className="text-gray-500 text-sm">주제: <span className="font-bold text-orange-500">{finalTopic}</span></p>
          <p className="text-gray-500 text-sm">
            총 <span className="text-3xl font-black" style={{ color: game.accentColor }}>{chain.length}</span>개의 질문이 이어졌어요!
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
          <h3 className="font-black text-gray-700">📜 전체 질문 체인</h3>
          {chain.map((item, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white mt-0.5"
                style={{ background: item.isAI ? AI_COLOR : playerColor(item.player) }}>
                {i + 1}
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold mb-0.5" style={{ color: item.isAI ? AI_COLOR : playerColor(item.player) }}>
                  {item.player}
                </p>
                <p className="text-gray-800 text-sm leading-relaxed">{item.question}</p>
              </div>
            </div>
          ))}
        </div>

        <AwardBadge result={awardResult} />
        <Button className="w-full py-4 font-black text-white rounded-xl"
          style={{ background: game.gradientCss }}
          onClick={() => { setPhase("setup"); setTopic(""); setCustomTopic(""); }}>
          🔄 다시 하기
        </Button>
      </div>
    );
  }

  /* ─── 게임 진행 화면 ─── */
  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">← 목록</button>
        <div className="flex-1 rounded-2xl py-3 px-5 text-white flex items-center justify-between"
          style={{ background: game.gradientCss }}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{game.emoji}</span>
            <div>
              <p className="font-black">{game.title}</p>
              <p className="text-white/80 text-xs">주제: {finalTopic}</p>
            </div>
          </div>
          <div className="text-white text-right">
            <p className="text-2xl font-black">{chain.length}</p>
            <p className="text-xs opacity-80">연결됨</p>
          </div>
        </div>
      </div>

      {/* 친구 모드 턴 표시 */}
      {isMulti && !isAI && (
        <div className="flex gap-2">
          {players.map((p, i) => (
            <div key={i}
              className="flex-1 rounded-xl py-2 px-3 text-center text-sm font-bold transition-all"
              style={{
                background: i === playerIdx ? game.accentColor : "#f3f4f6",
                color: i === playerIdx ? "white" : "#9ca3af",
              }}>
              {p} {i === playerIdx && "🏃"}
            </div>
          ))}
        </div>
      )}

      {/* AI 모드 턴 표시 */}
      {isAI && (
        <div className="flex gap-2">
          <div className="flex-1 rounded-xl py-2 px-3 text-center text-sm font-bold transition-all"
            style={{
              background: !aiLoading ? game.accentColor : "#f3f4f6",
              color: !aiLoading ? "white" : "#9ca3af",
            }}>
            {myPlayerName} {!aiLoading && "🏃"}
          </div>
          <div className="flex-1 rounded-xl py-2 px-3 text-center text-sm font-bold transition-all flex items-center justify-center gap-1.5"
            style={{
              background: aiLoading ? AI_COLOR : "#f3f4f6",
              color: aiLoading ? "white" : "#9ca3af",
            }}>
            🤖 AI {aiLoading && (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
            )}
          </div>
        </div>
      )}

      {/* 질문 체인 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 max-h-72 overflow-y-auto space-y-2">
        {chain.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            <p className="text-3xl mb-2">🎯</p>
            <p>주제 <strong className="text-orange-500">{finalTopic}</strong>에 대한 첫 질문을 만들어봐요!</p>
          </div>
        ) : (
          chain.map((item, i) => (
            <div key={i} className="flex gap-2.5 items-start">
              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white"
                style={{ background: item.isAI ? AI_COLOR : playerColor(item.player) }}>
                {i + 1}
              </div>
              <div
                className={`flex-1 rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  i === chain.length - 1 ? "border-2 font-medium" : "bg-gray-50 text-gray-600"
                }`}
                style={i === chain.length - 1 ? {
                  borderColor: item.isAI ? AI_COLOR : game.accentColor,
                  background: item.isAI ? "#eef2ff" : `${game.accentColor}10`,
                  color: "#1f2937",
                } : {}}>
                <span className="text-xs font-bold mr-1.5"
                  style={{ color: item.isAI ? AI_COLOR : playerColor(item.player) }}>
                  {item.player}
                </span>
                {item.question}
              </div>
            </div>
          ))
        )}

        {/* AI 응답 대기 중 */}
        {aiLoading && (
          <div className="flex gap-2.5 items-start">
            <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white"
              style={{ background: AI_COLOR }}>
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
            </div>
            <div className="flex-1 bg-indigo-50 border-2 border-indigo-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
              <p className="text-indigo-500 text-sm font-medium">🤖 AI가 질문을 만드는 중...</p>
            </div>
          </div>
        )}

        <div ref={chainEndRef} />
      </div>

      {/* 앞 질문 연결 힌트 (AI 응답 후 학생 차례) */}
      {prevForHint && !aiLoading && (
        <div className="rounded-xl border-2 px-4 py-3"
          style={{
            borderColor: lastItem?.isAI ? AI_COLOR : game.accentColor,
            background: lastItem?.isAI ? "#eef2ff" : `${game.accentColor}08`,
          }}>
          <p className="text-xs font-bold mb-1"
            style={{ color: lastItem?.isAI ? AI_COLOR : game.accentColor }}>
            ↳ 이 질문과 연결된 질문을 만들어요
          </p>
          <p className="text-gray-800 text-sm font-medium">{prevForHint.question}</p>
        </div>
      )}

      {/* 입력 영역 — 항상 학생 차례 (AI가 응답 중일 때만 비활성화) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        {localError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-600 text-sm">
            ❌ {localError}
          </div>
        )}

        <textarea
          ref={inputRef}
          className="w-full border-2 rounded-xl p-3 text-sm resize-none focus:outline-none h-24 transition-colors"
          style={{ borderColor: "#e5e7eb", opacity: aiLoading ? 0.5 : 1 }}
          onFocus={(e) => { if (!aiLoading) { e.target.style.borderColor = game.accentColor; setLocalError(null); } }}
          onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
          placeholder={
            aiLoading
              ? "AI가 질문을 만드는 중이에요..."
              : chain.length === 0
              ? `'${finalTopic}'과 관련된 첫 번째 질문을 만들어보세요...`
              : "앞 질문과 연결된 새 질문을 써보세요..."
          }
          value={inputQ}
          onChange={(e) => { if (!aiLoading) { setInputQ(e.target.value); setLocalError(null); } }}
          disabled={aiLoading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !aiLoading) {
              e.preventDefault();
              submitQuestion();
            }
          }}
        />

        <div className="flex gap-2">
          <Button
            className="flex-1 font-bold text-white rounded-xl"
            style={{ background: game.gradientCss, opacity: inputQ.trim() && !aiLoading ? 1 : 0.4 }}
            disabled={!inputQ.trim() || aiLoading}
            onClick={submitQuestion}>
            {isAI ? "질문 제출 → AI 차례" : "질문 연결 →"}
          </Button>
          {chain.length >= 4 && !aiLoading && (
            <Button variant="outline" className="rounded-xl px-4 text-sm text-gray-400" onClick={endGame}>
              마치기
            </Button>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center">
          💡 질문 형태로 써야 해요 (~나요? ~인가요? ~할까요?) · Enter 키로 빠르게 제출
        </p>
      </div>
    </div>
  );
}

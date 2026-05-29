"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useAIPlay } from "./useAIPlay";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";

const PRESET_TOPICS = [
  "바다", "날씨", "우주", "학교", "음식",
  "동물", "계절", "가족", "미래", "환경",
  "물", "빛", "시간", "꿈", "친구",
];

const COLORS = ["#F97316", "#3B82F6", "#10B981", "#8B5CF6", "#EF4444"];

interface ChainItem { question: string; player: string; isAI?: boolean }
interface AIFeedback { verdict: "연결돼요" | "연결 안 돼요"; reason: string; cheer: string }

function parseRelayFeedback(text: string): AIFeedback {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let verdict: "연결돼요" | "연결 안 돼요" = "연결돼요";
  let reason = "";
  let cheer = "";
  for (const line of lines) {
    if (line.startsWith("판정:")) verdict = line.includes("연결돼요") ? "연결돼요" : "연결 안 돼요";
    if (line.startsWith("이유:")) reason = line.replace("이유:", "").trim();
    if (line.startsWith("격려:")) cheer = line.replace("격려:", "").trim();
  }
  return { verdict, reason: reason || "확인했어요!", cheer: cheer || "잘하고 있어요! 👍" };
}

function isQuestionForm(text: string): boolean {
  const t = text.trim();
  return /[?？]/.test(t) ||
    /(나요|인가요|할까요|까요|니요|니까|가요|나요\?|는지요|를까요)\s*$/.test(t);
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
  const [feedback, setFeedback] = useState<AIFeedback | null>(null);
  const [inputPhase, setInputPhase] = useState<"write" | "checking" | "result">("write");
  const [localError, setLocalError] = useState<string | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const chainEndRef = useRef<HTMLDivElement>(null);

  const { ask, loading: aiLoading } = useAIPlay();

  const finalTopic = customTopic.trim() || topic;
  const currentPlayer = players[playerIdx] ?? "나";
  const isAITurn = isAI && playerIdx === 1;
  const prevQuestion = chain.length > 0 ? chain[chain.length - 1].question : null;

  // 체인 끝으로 자동 스크롤
  useEffect(() => {
    chainEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chain]);

  function startGame() {
    if (!finalTopic) return;
    setChain([]);
    setInputQ("");
    setPlayerIdx(0);
    setFeedback(null);
    setInputPhase("write");
    setLocalError(null);
    setGaveUp(false);
    setPhase("playing");
  }

  const addAIQuestion = useCallback(async (currentChain: ChainItem[], currentTopic: string) => {
    const prev = currentChain[currentChain.length - 1]?.question ?? "";
    const history = currentChain.map((c) => c.question).join(" / ");
    const res = await ask({
      action: "relay:ai-turn",
      context: { topic: currentTopic, prev, history },
    });
    if (res?.text) {
      const aiQ = res.text.trim();
      setChain((c) => [...c, { question: aiQ, player: "🤖 AI", isAI: true }]);
      setPlayerIdx(0);
      setInputPhase("write");
    }
  }, [ask]);

  async function submitQuestion() {
    const trimmed = inputQ.trim();
    if (!trimmed) return;

    setLocalError(null);

    // 1) 질문 형식 검사
    if (!isQuestionForm(trimmed)) {
      setLocalError("질문 형태로 써야 해요! (~나요? ~인가요? ~할까요?)");
      return;
    }

    // 2) 중복 검사
    if (chain.some((c) => c.question.trim() === trimmed)) {
      setLocalError("이미 나온 질문이에요! 새로운 질문을 만들어봐요.");
      return;
    }

    // 3) 관련성 검사
    if (isAI && prevQuestion) {
      setInputPhase("checking");
      const res = await ask({
        action: "relay:check",
        context: { prev: prevQuestion, next: trimmed },
      });
      const fb = res?.text ? parseRelayFeedback(res.text) : null;

      if (fb) {
        setFeedback(fb);
        setInputPhase("result");

        if (fb.verdict === "연결돼요") {
          const newChain: ChainItem[] = [...chain, { question: trimmed, player: currentPlayer }];
          setChain(newChain);
          setInputQ("");

          // AI 차례 자동 진행
          setTimeout(() => {
            setFeedback(null);
            setInputPhase("write");
            addAIQuestion(newChain, finalTopic);
          }, 2000);
        }
        // "연결 안 돼요"이면 피드백 보여주고 다시 시도 가능
      }
    } else {
      // 솔로/친구 모드: 기본 검사만
      const newChain: ChainItem[] = [...chain, { question: trimmed, player: currentPlayer }];
      setChain(newChain);
      setInputQ("");
      setFeedback(null);
      if (isMulti) setPlayerIdx((i) => (i + 1) % players.length);
    }
  }

  function retryQuestion() {
    setFeedback(null);
    setInputPhase("write");
    setInputQ("");
  }

  function endGame() {
    setGaveUp(true);
    setPhase("done");
  }

  const playerColor = (name: string) => {
    const idx = players.indexOf(name);
    return idx >= 0 ? COLORS[idx % COLORS.length] : "#6b7280";
  };

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
          {/* 규칙 안내 */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-1.5">
            <p className="text-orange-700 font-black text-sm flex items-center gap-2">📜 게임 규칙</p>
            <ul className="space-y-1">
              {[
                "앞 질문과 반드시 연결된 새 질문을 만들어요",
                "대답은 절대 금지! 질문만 이어가요",
                "같은 질문 반복 금지!",
              ].map((r, i) => (
                <li key={i} className="text-orange-600 text-sm flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5">•</span>{r}
                </li>
              ))}
            </ul>
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
            <div className="relative">
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
          <div className="text-center">
            <p className="text-gray-500 text-sm">주제: <span className="font-bold text-orange-500">{finalTopic}</span></p>
            <p className="text-gray-500 text-sm mt-1">
              총 <span className="text-2xl font-black" style={{ color: game.accentColor }}>{chain.length}</span>개의 질문이 이어졌어요!
            </p>
          </div>
        </div>
        {/* 전체 체인 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
          <h3 className="font-black text-gray-700">📜 전체 질문 체인</h3>
          {chain.map((item, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white mt-0.5"
                style={{ background: item.isAI ? "#6366f1" : playerColor(item.player) }}>
                {i + 1}
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium mb-0.5" style={{ color: item.isAI ? "#6366f1" : playerColor(item.player) }}>
                  {item.player}
                </p>
                <p className="text-gray-800 text-sm leading-relaxed">{item.question}</p>
              </div>
            </div>
          ))}
        </div>
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
              <p className="font-black text-base">{game.title}</p>
              <p className="text-white/80 text-xs">주제: {finalTopic}</p>
            </div>
          </div>
          <div className="text-white text-right">
            <p className="text-2xl font-black">{chain.length}</p>
            <p className="text-xs opacity-80">연결됨</p>
          </div>
        </div>
      </div>

      {/* 플레이어 턴 표시 (멀티/AI) */}
      {isMulti && (
        <div className="flex gap-2">
          {players.map((p, i) => (
            <div key={i}
              className="flex-1 rounded-xl py-2 px-3 text-center text-sm font-bold transition-all"
              style={{
                background: i === playerIdx ? (p === "🤖 AI" ? "#6366f1" : game.accentColor) : "#f3f4f6",
                color: i === playerIdx ? "white" : "#9ca3af",
              }}>
              {p} {i === playerIdx && (aiLoading ? "⏳" : "🏃")}
            </div>
          ))}
        </div>
      )}

      {/* 질문 체인 뷰어 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 max-h-64 overflow-y-auto space-y-2">
        {chain.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            <p className="text-3xl mb-2">🎯</p>
            <p>주제 <strong className="text-orange-500">{finalTopic}</strong>에 대한 첫 질문을 만들어봐요!</p>
          </div>
        ) : (
          chain.map((item, i) => (
            <div key={i} className="flex gap-2.5 items-start">
              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black text-white"
                style={{ background: item.isAI ? "#6366f1" : playerColor(item.player) }}>
                {i + 1}
              </div>
              <div className={`flex-1 rounded-xl px-3 py-2 text-sm leading-relaxed ${
                i === chain.length - 1
                  ? "border-2 font-medium"
                  : "bg-gray-50 text-gray-600"
              }`}
                style={i === chain.length - 1 ? {
                  borderColor: item.isAI ? "#6366f1" : game.accentColor,
                  background: item.isAI ? "#eef2ff" : `${game.accentColor}10`,
                  color: "#1f2937",
                } : {}}>
                <span className="text-xs font-bold mr-1.5" style={{ color: item.isAI ? "#6366f1" : playerColor(item.player) }}>
                  {item.player}
                </span>
                {item.question}
              </div>
            </div>
          ))
        )}
        <div ref={chainEndRef} />
      </div>

      {/* 앞 질문 강조 (체인이 있을 때) */}
      {prevQuestion && inputPhase === "write" && (
        <div className="rounded-xl border-2 px-4 py-3" style={{ borderColor: game.accentColor, background: `${game.accentColor}08` }}>
          <p className="text-xs font-bold mb-1" style={{ color: game.accentColor }}>
            ↳ 이 질문과 연결하세요
          </p>
          <p className="text-gray-800 text-sm font-medium">{prevQuestion}</p>
        </div>
      )}

      {/* AI 자동 생성 중 */}
      {isAI && aiLoading && inputPhase === "write" && isAITurn && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-4 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <p className="text-indigo-600 font-bold text-sm">🤖 AI가 다음 질문을 만드는 중...</p>
        </div>
      )}

      {/* AI 확인 중 */}
      {inputPhase === "checking" && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <p className="text-amber-600 font-bold text-sm">🤖 AI가 연결성을 확인하는 중...</p>
        </div>
      )}

      {/* AI 피드백 결과 */}
      {inputPhase === "result" && feedback && (
        <div className={`rounded-2xl p-4 space-y-2 ${
          feedback.verdict === "연결돼요"
            ? "bg-green-50 border-2 border-green-200"
            : "bg-orange-50 border-2 border-orange-200"
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{feedback.verdict === "연결돼요" ? "✅" : "🔄"}</span>
            <p className={`text-xl font-black ${
              feedback.verdict === "연결돼요" ? "text-green-600" : "text-orange-500"
            }`}>
              {feedback.verdict}
            </p>
          </div>
          <p className="text-gray-600 text-sm">{feedback.reason}</p>
          <p className="text-blue-600 text-sm font-medium bg-blue-50 rounded-lg px-3 py-2">
            💬 {feedback.cheer}
          </p>
          {feedback.verdict === "연결 안 돼요" && (
            <Button variant="outline" className="w-full mt-2 rounded-xl" onClick={retryQuestion}>
              다시 시도하기 →
            </Button>
          )}
        </div>
      )}

      {/* 입력 */}
      {inputPhase === "write" && !isAITurn && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          {localError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-red-600 text-sm">
              ❌ {localError}
            </div>
          )}
          <textarea
            className="w-full border-2 rounded-xl p-3 text-sm resize-none focus:outline-none h-24"
            style={{ borderColor: "#e5e7eb" }}
            onFocus={(e) => { e.target.style.borderColor = game.accentColor; setLocalError(null); }}
            onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
            placeholder={
              chain.length === 0
                ? `'${finalTopic}'과 관련된 첫 번째 질문을 만들어보세요...`
                : "앞 질문과 연결된 새 질문을 써보세요..."
            }
            value={inputQ}
            onChange={(e) => { setInputQ(e.target.value); setLocalError(null); }}
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              className="flex-1 font-bold text-white rounded-xl"
              style={{ background: game.gradientCss, opacity: inputQ.trim() && !aiLoading ? 1 : 0.4 }}
              disabled={!inputQ.trim() || aiLoading}
              onClick={submitQuestion}>
              {isAI ? "🤖 AI에게 확인받기" : "질문 연결 →"}
            </Button>
            {chain.length >= 3 && (
              <Button variant="outline" className="rounded-xl px-4 text-sm text-gray-400" onClick={endGame}>
                마치기
              </Button>
            )}
          </div>
          {/* 힌트 */}
          <p className="text-xs text-gray-400 text-center">
            💡 질문 형태로 써야 해요 (~나요? ~인가요? ~할까요?)
          </p>
        </div>
      )}
    </div>
  );
}

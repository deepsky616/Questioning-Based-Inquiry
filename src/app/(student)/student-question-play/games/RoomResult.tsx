"use client";

import { Button } from "@/components/ui/button";
import { useAIPlay } from "./useAIPlay";
import { RoomHeader, playerColorById } from "./roomShared";
import type { BuiltInGame, GameRoom } from "@/lib/question-games-data";

export interface ScoreEntry { playerId: string; name: string; score: number }
export interface QInfo { playerName: string; question: string }
interface AIVerdict { best: string; student: string; comment: string }

function parseBest(text: string): AIVerdict {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let best = "", student = "", comment = "";
  for (const line of lines) {
    if (line.startsWith("베스트:")) best = line.replace("베스트:", "").trim();
    if (line.startsWith("학생:")) student = line.replace("학생:", "").trim();
    if (line.startsWith("총평:")) comment = line.replace("총평:", "").trim();
  }
  return { best: best || "(없음)", student, comment: comment || "모두 좋은 질문이었어요!" };
}

const MEDALS = ["🥇", "🥈", "🥉"];

interface Props {
  game: BuiltInGame;
  room: GameRoom;
  myId: string;
  scoreLabel: string;            // 예: "맞힌 질문", "이어간 질문"
  scoreUnit: string;             // 예: "개"
  scores: ScoreEntry[];
  questions: QInfo[];            // AI 베스트용 (빈 배열이면 AI 버튼 숨김)
  onAction: (action: string, extra?: Record<string, unknown>) => Promise<GameRoom | null>;
  onLeave: () => void;
}

export default function RoomResult({
  game, room, myId, scoreLabel, scoreUnit, scores, questions, onAction, onLeave,
}: Props) {
  const { ask, loading: aiLoading } = useAIPlay();
  const isHost = room.hostId === myId;

  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const topScore = sorted[0]?.score ?? 0;
  const winners = sorted.filter((s) => s.score === topScore && topScore > 0);
  const aiVerdict = (room.gameState as { aiVerdict?: AIVerdict }).aiVerdict;

  async function runAIBest() {
    const qText = questions.map((q) => `${q.playerName}: ${q.question}`).join("\n");
    const res = await ask({ action: "game:best", context: { questions: qText } });
    if (res?.text) {
      await onAction("update-state", { patch: { aiVerdict: parseBest(res.text) } });
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <RoomHeader game={game} room={room} subtitle="게임 종료!" onLeave={onLeave} />

      {/* 승자 발표 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center gap-3">
        <div className="text-6xl">🏆</div>
        {winners.length > 0 ? (
          <>
            <h2 className="text-2xl font-black text-gray-800">
              {winners.length === 1 ? "우승!" : "공동 우승!"}
            </h2>
            <div className="flex flex-wrap justify-center gap-2">
              {winners.map((w) => (
                <span key={w.playerId}
                  className="px-4 py-2 rounded-full text-white font-black text-lg"
                  style={{ background: game.gradientCss }}>
                  👑 {w.name}
                </span>
              ))}
            </div>
            <p className="text-gray-400 text-sm">{topScore}{scoreUnit} {scoreLabel}</p>
          </>
        ) : (
          <h2 className="text-xl font-black text-gray-600">모두 수고했어요!</h2>
        )}
      </div>

      {/* 점수판 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-2">
        <h3 className="font-black text-gray-700 mb-1">📊 점수판</h3>
        {sorted.map((s, i) => {
          const isWinner = s.score === topScore && topScore > 0;
          return (
            <div key={s.playerId}
              className="flex items-center gap-3 rounded-xl p-3 transition-all"
              style={{ background: isWinner ? `${game.accentColor}12` : "#f9fafb" }}>
              <span className="text-lg w-6 text-center">{MEDALS[i] ?? `${i + 1}`}</span>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-sm"
                style={{ background: playerColorById(room, s.playerId) }}>
                {s.name.charAt(0)}
              </div>
              <span className="font-bold text-gray-800 flex-1">
                {s.name}{s.playerId === myId && <span className="text-xs text-gray-400 ml-1">(나)</span>}
              </span>
              <span className="font-black" style={{ color: game.accentColor }}>
                {s.score}{scoreUnit}
              </span>
            </div>
          );
        })}
      </div>

      {/* AI 베스트 질문 */}
      {questions.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
          <h3 className="font-black text-gray-700 flex items-center gap-2">🤖 AI 베스트 질문</h3>
          {aiVerdict ? (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 space-y-2">
              <p className="text-gray-800 font-bold text-lg">&ldquo;{aiVerdict.best}&rdquo;</p>
              {aiVerdict.student && (
                <p className="text-blue-600 text-sm font-medium">✨ {aiVerdict.student} 학생</p>
              )}
              <p className="text-gray-500 text-sm bg-white rounded-lg px-3 py-2">💬 {aiVerdict.comment}</p>
            </div>
          ) : isHost ? (
            <Button className="w-full font-bold text-white rounded-xl"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              disabled={aiLoading} onClick={runAIBest}>
              {aiLoading ? "AI가 채점하는 중..." : "🤖 AI가 베스트 질문 뽑기!"}
            </Button>
          ) : (
            <p className="text-gray-400 text-sm text-center">방장이 AI 채점을 누르면 베스트 질문이 표시돼요</p>
          )}
        </div>
      )}

      {/* 대기실 복귀 */}
      {isHost ? (
        <Button className="w-full py-4 font-black text-white rounded-xl"
          style={{ background: game.gradientCss }}
          onClick={() => onAction("restart")}>
          🔄 대기실로 돌아가기
        </Button>
      ) : (
        <p className="text-center text-gray-400 text-sm">방장이 다음 게임을 준비하고 있어요...</p>
      )}
    </div>
  );
}

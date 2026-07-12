"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RoomHeader, WaitingBanner, PLAYER_COLORS, playerColorById } from "./roomShared";
import RoomResult from "./RoomResult";
import type { BuiltInGame, GameRoom, RoomActionHandler } from "@/lib/question-games-data";

const ROWS = 10;

function generateLadder(n: number): boolean[][] {
  const grid: boolean[][] = Array.from({ length: ROWS }, () => Array(Math.max(n - 1, 1)).fill(false));
  for (let row = 0; row < ROWS; row++) {
    let col = 0;
    while (col < n - 1) {
      if (Math.random() < 0.42) { grid[row][col] = true; col += 2; }
      else col++;
    }
  }
  return grid;
}
function tracePath(start: number, grid: boolean[][]): number {
  let col = start;
  for (let row = 0; row < grid.length; row++) {
    if (col > 0 && grid[row][col - 1]) col--;
    else if (col < grid[0].length && grid[row][col]) col++;
  }
  return col;
}

interface Assignment { playerId: string; playerName: string; topic: string }
interface LadderQuestion { playerId: string; playerName: string; topic: string; question: string }
interface LadderState {
  topics: string[];
  grid: boolean[][];
  assignments: Assignment[];
  questions: LadderQuestion[];
}

interface Props {
  game: BuiltInGame; room: GameRoom; myId: string; actionLoading: boolean;
  onAction: RoomActionHandler;
  onLeave: () => void;
}

export default function RoomLadder({ game, room, myId, actionLoading, onAction, onLeave }: Props) {
  const n = room.players.length;
  const [topicInputs, setTopicInputs] = useState<string[]>(Array(n).fill(""));
  const [questionInput, setQuestionInput] = useState("");

  const isHost = room.hostId === myId;
  const state = room.gameState as unknown as LadderState;
  const hasState = Array.isArray(state?.assignments) && state.assignments.length > 0;

  function buildLadder() {
    const topics = topicInputs.map((t, i) => t.trim() || `주제 ${String.fromCharCode(65 + i)}`);
    const grid = generateLadder(n);
    const assignments: Assignment[] = room.players.map((p, i) => ({
      playerId: p.id, playerName: p.name, topic: topics[tracePath(i, grid)],
    }));
    void onAction("set-state", { state: { topics, grid, assignments, questions: [] } });
  }

  // ─── 종료 ───
  if (room.status === "ended") {
    const qs = state?.questions ?? [];
    const scores = room.players.map((p) => ({
      playerId: p.id, name: p.name,
      score: qs.filter((q) => q.playerId === p.id).length,
    }));
    const questions = qs.map((q) => ({ playerId: q.playerId, playerName: q.playerName, question: q.question }));
    return (
      <RoomResult game={game} room={room} myId={myId}
        scoreLabel="만든 질문" scoreUnit="개"
        scores={scores} questions={questions}
        onAction={onAction} onLeave={onLeave} />
    );
  }

  // ─── 주제 설정 (방장) ───
  if (!hasState) {
    if (isHost) {
      return (
        <div className="max-w-lg mx-auto space-y-5">
          <RoomHeader game={game} room={room} subtitle="주제 정하기" onLeave={onLeave} />
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
            <p className="text-sm font-black text-gray-700">📌 주제 {n}개를 입력해요 (사다리로 무작위 배정돼요)</p>
            <div className="space-y-2">
              {Array.from({ length: n }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-600 text-xs flex items-center justify-center font-bold flex-shrink-0">
                    {String.fromCharCode(65 + i)}
                  </div>
                  <Input placeholder={`주제 ${String.fromCharCode(65 + i)}`} value={topicInputs[i] ?? ""}
                    onChange={(e) => { const t = [...topicInputs]; t[i] = e.target.value; setTopicInputs(t); }}
                    className="h-9 text-sm rounded-lg" />
                </div>
              ))}
            </div>
            <Button className="w-full py-4 font-black text-white rounded-xl text-lg"
              style={{ background: game.gradientCss }} disabled={actionLoading}
              onClick={buildLadder}>
              🪜 사다리 만들기!
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="max-w-lg mx-auto space-y-5">
        <RoomHeader game={game} room={room} subtitle="대기 중..." onLeave={onLeave} />
        <WaitingBanner text="방장이 주제를 정하는 중..." />
      </div>
    );
  }

  // ─── 게임 진행 (사다리 + 내 주제 + 질문) ───
  const myAssignment = state.assignments.find((a) => a.playerId === myId);
  const myQuestion = state.questions.find((q) => q.playerId === myId);
  const myIndex = room.players.findIndex((p) => p.id === myId);

  // SVG 좌표
  const SVG_W = Math.max(n * 80, 280);
  const SVG_H = 360;
  const TOP = 50, BOT = 50;
  const colX = (i: number) => 40 + i * ((SVG_W - 80) / Math.max(n - 1, 1));
  const rowY = (r: number) => TOP + (r / ROWS) * (SVG_H - TOP - BOT);

  async function submitQuestion() {
    const trimmed = questionInput.trim();
    if (!trimmed || actionLoading || !myAssignment) return;
    const q: LadderQuestion = {
      playerId: myId, playerName: myAssignment.playerName,
      topic: myAssignment.topic, question: trimmed,
    };
    const res = await onAction("update-state", { patch: { questions: [...state.questions, q] } });
    if (res.ok) setQuestionInput("");
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <RoomHeader game={game} room={room} subtitle="사다리 결과" onLeave={onLeave} />

      {/* 사다리 SVG */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 overflow-x-auto">
        <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="mx-auto block">
          {room.players.map((p, i) => (
            <text key={i} x={colX(i)} y={28} textAnchor="middle" fontSize="12" fontWeight="bold"
              fill={PLAYER_COLORS[i % PLAYER_COLORS.length]}>
              {p.name.length > 4 ? p.name.slice(0, 4) : p.name}
            </text>
          ))}
          {state.topics.map((t, i) => (
            <text key={i} x={colX(i)} y={SVG_H - 8} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#6b7280">
              {t.length > 5 ? t.slice(0, 5) : t}
            </text>
          ))}
          {Array.from({ length: n }, (_, i) => (
            <line key={i} x1={colX(i)} y1={TOP} x2={colX(i)} y2={SVG_H - BOT}
              stroke={i === myIndex ? PLAYER_COLORS[i % PLAYER_COLORS.length] : "#d1d5db"}
              strokeWidth={i === myIndex ? 3 : 2} />
          ))}
          {state.grid.map((row, ri) => row.map((has, ci) => has ? (
            <line key={`${ri}-${ci}`} x1={colX(ci)} y1={rowY(ri + 0.5)} x2={colX(ci + 1)} y2={rowY(ri + 0.5)}
              stroke="#9ca3af" strokeWidth="2" />
          ) : null))}
        </svg>
      </div>

      {/* 내 주제 */}
      {myAssignment && (
        <div className="rounded-2xl border-2 p-4 text-center"
          style={{ borderColor: PLAYER_COLORS[myIndex % PLAYER_COLORS.length] }}>
          <p className="text-sm text-gray-500 mb-1">
            <span className="font-bold" style={{ color: PLAYER_COLORS[myIndex % PLAYER_COLORS.length] }}>
              {myAssignment.playerName}
            </span>님의 주제
          </p>
          <p className="text-2xl font-black text-gray-800">📌 {myAssignment.topic}</p>
        </div>
      )}

      {/* 질문 작성 */}
      {myQuestion ? (
        <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 text-center">
          <p className="text-green-600 font-bold text-sm mb-1">✅ 내 질문 완성!</p>
          <p className="text-gray-700 text-sm">{myQuestion.question}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
          <p className="text-sm font-bold text-gray-700">내 주제로 질문을 만들어요!</p>
          <textarea
            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none h-20"
            placeholder={`'${myAssignment?.topic}'에 대한 질문을 써보세요...`}
            value={questionInput} onChange={(e) => setQuestionInput(e.target.value)} />
          <Button className="w-full font-bold text-white rounded-xl"
            style={{ background: game.gradientCss, opacity: questionInput.trim() && !actionLoading ? 1 : 0.5 }}
            disabled={!questionInput.trim() || actionLoading} onClick={submitQuestion}>
            질문 제출 ✓
          </Button>
        </div>
      )}

      {/* 제출 현황 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <p className="text-xs text-gray-400 font-medium mb-2">
          질문 작성: {state.questions.length} / {n}명
        </p>
        <div className="space-y-1.5">
          {state.assignments.map((a) => {
            const done = state.questions.some((q) => q.playerId === a.playerId);
            return (
              <div key={a.playerId} className="flex items-center gap-2 text-sm">
                <span>{done ? "✅" : "⏳"}</span>
                <span className="font-bold" style={{ color: playerColorById(room, a.playerId) }}>{a.playerName}</span>
                <span className="text-gray-400 text-xs">📌 {a.topic}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 방장 종료 */}
      {isHost && (
        <Button variant="outline" className="w-full rounded-xl text-gray-500"
          onClick={() => void onAction("update-state", { patch: {}, status: "ended" })}>
          🏁 결과 보기 (게임 마치기)
        </Button>
      )}
    </div>
  );
}

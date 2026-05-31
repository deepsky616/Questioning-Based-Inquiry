"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAIPlay } from "./useAIPlay";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";

const COLORS = ["#7C3AED","#2563EB","#059669","#D97706","#DC2626","#DB2777"];

function generateLadder(n: number, rows: number): boolean[][] {
  // grid[row][col] = true → col번과 col+1번 사이에 가로 연결
  const grid: boolean[][] = Array.from({ length: rows }, () => Array(n - 1).fill(false));
  for (let row = 0; row < rows; row++) {
    let col = 0;
    while (col < n - 1) {
      if (Math.random() < 0.42) {
        grid[row][col] = true;
        col += 2; // 인접 중복 방지
      } else {
        col++;
      }
    }
  }
  return grid;
}

function tracePath(startCol: number, grid: boolean[][]): number[] {
  const path: number[] = [startCol];
  let col = startCol;
  for (let row = 0; row < grid.length; row++) {
    if (col > 0 && grid[row][col - 1]) {
      col--;
    } else if (col < grid[0].length && grid[row][col]) {
      col++;
    }
    path.push(col);
  }
  return path;
}

interface Props { game: BuiltInGame; onBack: () => void; config: GameStartConfig }

export default function LadderGame({ game, onBack, config }: Props) {
  const { mode } = config;
  const isAI = mode === "ai";
  const isSolo = mode === "solo";
  const AI_NAME = "🤖 AI";
  const myName = config.players[0]?.trim() || "나";

  const { ask, loading: aiLoading } = useAIPlay();
  const [phase, setPhase] = useState<"setup" | "reveal" | "result">("setup");
  const [names, setNames] = useState(["", "", "", ""]);
  const [topics, setTopics] = useState(["", "", "", ""]);
  const [count, setCount] = useState(isAI ? 2 : isSolo ? 3 : 4);
  const [grid, setGrid] = useState<boolean[][]>([]);
  const [paths, setPaths] = useState<number[][]>([]);
  const [revealedIdx, setRevealedIdx] = useState<number>(-1);
  const [assignments, setAssignments] = useState<{ name: string; topic: string }[]>([]);
  const [aiQuestions, setAiQuestions] = useState<Record<number, string>>({});

  const ROWS = 10;
  const aiQGenRef = useRef(false);

  // 모드별 초기 참가자 이름 설정
  useEffect(() => {
    if (isAI) {
      // 학생 + AI 2명
      setNames([myName, AI_NAME, "", ""]);
    } else if (isSolo) {
      // 솔로: 본인이 여러 역할 (이름은 자유롭게 입력 가능)
      setNames([myName, "", "", ""]);
    }
    // friend 모드: config.players를 채워줄 수도 있음
    if (mode === "friend" && config.players.length > 0) {
      const arr = config.players.slice(0, 6);
      const padded = [...arr];
      while (padded.length < 4) padded.push("");
      setNames(padded);
      setCount(arr.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 결과 공개 후 AI가 자기 도착 주제로 자동 질문 생성
  useEffect(() => {
    if (!isAI || phase !== "result" || aiQGenRef.current) return;
    aiQGenRef.current = true;
    const aiIdx = names.findIndex((n) => n === AI_NAME);
    if (aiIdx < 0) return;
    const myTopic = assignments[aiIdx]?.topic;
    if (!myTopic) return;
    (async () => {
      const res = await ask({
        action: "ladder:suggest",
        context: { topic: myTopic },
      });
      if (res?.text) {
        // 첫 줄을 AI 질문으로 사용
        const first = res.text.split("\n").filter((l) => l.trim()).map((l) => l.trim())[0] ?? "";
        setAiQuestions((q) => ({ ...q, [aiIdx]: first }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function buildLadder() {
    const n = count;
    const validNames = names.slice(0, n).map((v, i) => v.trim() || `학생 ${i + 1}`);
    const validTopics = topics.slice(0, n).map((v, i) => v.trim() || `주제 ${i + 1}`);
    const g = generateLadder(n, ROWS);
    const ps = Array.from({ length: n }, (_, i) => tracePath(i, g));
    const asgn = validNames.map((name, i) => ({
      name,
      topic: validTopics[ps[i][ps[i].length - 1]],
    }));
    setGrid(g);
    setPaths(ps);
    setAssignments(asgn);
    setRevealedIdx(-1);
    setAiQuestions({});
    aiQGenRef.current = false;
    setPhase("reveal");
  }

  const SVG_W = Math.max(count * 90, 320);
  const SVG_H = 400;
  const TOP_PAD = 60;
  const BOT_PAD = 60;
  const LADDER_H = SVG_H - TOP_PAD - BOT_PAD;
  const colX = (i: number) => 45 + i * ((SVG_W - 90) / Math.max(count - 1, 1));
  const rowY = (r: number) => TOP_PAD + (r / ROWS) * LADDER_H;

  const activePaths: Set<number> = new Set();
  if (revealedIdx >= 0) {
    paths[revealedIdx]?.forEach((c) => activePaths.add(c));
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">← 목록</button>
        <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
          style={{ background: game.gradientCss }}>
          <span className="text-4xl">{game.emoji}</span>
          <div>
            <h1 className="text-xl font-black">{game.title}</h1>
            <p className="text-white/80 text-sm">사다리를 타고 질문 주제를 정해요!</p>
          </div>
        </div>
      </div>

      {phase === "setup" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-gray-800">참가자 수 선택</h2>
            <div className="flex gap-2">
              {[2,3,4,5,6].map((n) => (
                <button key={n}
                  className="w-9 h-9 rounded-xl font-bold text-sm transition-all"
                  style={{ background: count === n ? game.accentColor : "#f3f4f6", color: count === n ? "white" : "#374151" }}
                  onClick={() => setCount(n)}>{n}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-bold text-gray-600 mb-2">👤 참가자 이름</p>
              <div className="space-y-2">
                {Array.from({ length: count }, (_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-bold flex-shrink-0"
                      style={{ background: COLORS[i] }}>{i+1}</div>
                    <Input placeholder={`학생 ${i+1}`} value={names[i] ?? ""}
                      onChange={(e) => {
                        const n2 = [...names]; n2[i] = e.target.value; setNames(n2);
                      }} className="h-8 text-sm rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-600 mb-2">📌 질문 주제</p>
              <div className="space-y-2">
                {Array.from({ length: count }, (_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 text-xs flex items-center justify-center font-bold flex-shrink-0">
                      {String.fromCharCode(65 + i)}
                    </div>
                    <Input placeholder={`주제 ${String.fromCharCode(65+i)}`} value={topics[i] ?? ""}
                      onChange={(e) => {
                        const t2 = [...topics]; t2[i] = e.target.value; setTopics(t2);
                      }} className="h-8 text-sm rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Button className="w-full py-4 font-black text-white rounded-xl text-lg"
            style={{ background: game.gradientCss }}
            onClick={buildLadder}>
            🪜 사다리 그리기!
          </Button>
        </div>
      )}

      {(phase === "reveal" || phase === "result") && (
        <div className="space-y-4">
          {/* SVG 사다리 */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 overflow-x-auto">
            <svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="mx-auto block">
              {/* 이름 (상단) */}
              {Array.from({ length: count }, (_, i) => (
                <text key={i} x={colX(i)} y={36} textAnchor="middle"
                  fontSize="13" fontWeight="bold" fill={COLORS[i]}>
                  {names[i]?.trim() || `학생${i+1}`}
                </text>
              ))}
              {/* 주제 (하단) */}
              {Array.from({ length: count }, (_, i) => (
                <text key={i} x={colX(i)} y={SVG_H - 10} textAnchor="middle"
                  fontSize="12" fontWeight="bold" fill="#6b7280">
                  {topics[i]?.trim() || `주제${String.fromCharCode(65+i)}`}
                </text>
              ))}

              {/* 세로 라인 */}
              {Array.from({ length: count }, (_, i) => (
                <line key={i}
                  x1={colX(i)} y1={TOP_PAD} x2={colX(i)} y2={SVG_H - BOT_PAD}
                  stroke={revealedIdx === i ? COLORS[i] : "#d1d5db"}
                  strokeWidth={revealedIdx === i ? 3 : 2} />
              ))}

              {/* 가로 연결 */}
              {grid.map((row, ri) =>
                row.map((has, ci) => has ? (
                  <line key={`${ri}-${ci}`}
                    x1={colX(ci)} y1={rowY(ri + 0.5)}
                    x2={colX(ci + 1)} y2={rowY(ri + 0.5)}
                    stroke="#9ca3af" strokeWidth="2" />
                ) : null)
              )}

              {/* 경로 강조 (선택된 경우) */}
              {revealedIdx >= 0 && paths[revealedIdx] && paths[revealedIdx].slice(0, -1).map((col, ri) => {
                const nextCol = paths[revealedIdx][ri + 1];
                const y1 = rowY(ri);
                const y2 = rowY(ri + 1);
                const midY = rowY(ri + 0.5);
                const x1 = colX(col);
                const x2 = colX(nextCol);
                return (
                  <g key={ri}>
                    {col === nextCol ? (
                      <line x1={x1} y1={y1} x2={x1} y2={y2}
                        stroke={COLORS[revealedIdx]} strokeWidth="4" strokeLinecap="round" />
                    ) : (
                      <>
                        <line x1={x1} y1={y1} x2={x1} y2={midY}
                          stroke={COLORS[revealedIdx]} strokeWidth="4" strokeLinecap="round" />
                        <line x1={x1} y1={midY} x2={x2} y2={midY}
                          stroke={COLORS[revealedIdx]} strokeWidth="4" strokeLinecap="round" />
                        <line x1={x2} y1={midY} x2={x2} y2={y2}
                          stroke={COLORS[revealedIdx]} strokeWidth="4" strokeLinecap="round" />
                      </>
                    )}
                  </g>
                );
              })}

              {/* 결과 원 */}
              {phase === "result" && assignments.map((_, i) => {
                const finalCol = paths[i][paths[i].length - 1];
                return (
                  <circle key={i} cx={colX(finalCol)} cy={SVG_H - BOT_PAD + 2}
                    r="8" fill={COLORS[i]} />
                );
              })}
            </svg>
          </div>

          {/* 참가자 선택 버튼 */}
          {phase === "reveal" && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-600 text-center">사다리를 탈 친구를 선택하세요</p>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: count }, (_, i) => (
                  <button key={i}
                    className="py-3 rounded-xl font-bold text-white text-sm transition-all hover:opacity-90 hover:scale-105"
                    style={{ background: COLORS[i] }}
                    onClick={() => setRevealedIdx(i)}>
                    {names[i]?.trim() || `학생 ${i+1}`}
                  </button>
                ))}
              </div>
              {revealedIdx >= 0 && (
                <div className="bg-white rounded-xl border-2 p-4 text-center"
                  style={{ borderColor: COLORS[revealedIdx] }}>
                  <p className="text-sm text-gray-500 mb-1">
                    <span className="font-bold" style={{ color: COLORS[revealedIdx] }}>
                      {names[revealedIdx]?.trim() || `학생 ${revealedIdx+1}`}
                    </span> 의 주제
                  </p>
                  <p className="text-xl font-black text-gray-800">
                    {assignments[revealedIdx]?.topic}
                  </p>
                </div>
              )}
              <Button className="w-full py-4 font-black text-white rounded-xl"
                style={{ background: game.gradientCss }}
                onClick={() => setPhase("result")}>
                🎉 전체 결과 공개!
              </Button>
            </div>
          )}

          {/* 전체 결과 */}
          {phase === "result" && (
            <div className="space-y-3">
              {assignments.map((a, i) => {
                const isAIRow = names[i]?.trim() === AI_NAME;
                const aiQ = aiQuestions[i];
                return (
                  <div key={i} className="bg-white rounded-xl border-2 p-4 flex flex-col gap-2"
                    style={{ borderColor: COLORS[i] }}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black"
                        style={{ background: COLORS[i] }}>
                        {names[i]?.trim().charAt(0) || (i+1)}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-800">{names[i]?.trim() || `학생 ${i+1}`}</p>
                        <p className="text-sm" style={{ color: COLORS[i] }}>📌 {a.topic}</p>
                      </div>
                    </div>
                    {isAIRow && (
                      <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-sm">
                        {aiQ ? (
                          <>
                            <p className="text-xs font-bold text-indigo-600 mb-0.5">🤖 AI 친구의 질문</p>
                            <p className="text-gray-700">{aiQ}</p>
                          </>
                        ) : aiLoading ? (
                          <div className="flex items-center gap-2 text-indigo-500">
                            <span className="w-3 h-3 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs">AI 친구가 질문을 만드는 중...</span>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { setPhase("reveal"); setRevealedIdx(-1); }}>
                  사다리 다시 보기
                </Button>
                <Button className="flex-1 font-bold text-white rounded-xl" style={{ background: game.gradientCss }}
                  onClick={() => setPhase("setup")}>
                  🔄 새로 하기
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

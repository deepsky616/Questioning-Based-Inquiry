"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { BuiltInGame } from "@/lib/question-games-data";

interface ItemProps {
  isLiving: boolean; isAnimal: boolean; isPlant: boolean;
  isEdible: boolean; isSmall: boolean; isLarge: boolean;
  isColorful: boolean; isIndoor: boolean; hasLegs: boolean;
  canFly: boolean; isMadeByHuman: boolean; isHard: boolean;
  isWet: boolean; isRound: boolean;
}

interface MysteryItem { name: string; hint: string; emoji: string; props: ItemProps }

const ITEMS: MysteryItem[] = [
  { name: "사과", hint: "과일", emoji: "🍎", props: { isLiving: false, isAnimal: false, isPlant: true, isEdible: true, isSmall: true, isLarge: false, isColorful: true, isIndoor: false, hasLegs: false, canFly: false, isMadeByHuman: false, isHard: false, isWet: false, isRound: true } },
  { name: "강아지", hint: "동물", emoji: "🐶", props: { isLiving: true, isAnimal: true, isPlant: false, isEdible: false, isSmall: true, isLarge: false, isColorful: false, isIndoor: true, hasLegs: true, canFly: false, isMadeByHuman: false, isHard: false, isWet: false, isRound: false } },
  { name: "책", hint: "물건", emoji: "📚", props: { isLiving: false, isAnimal: false, isPlant: false, isEdible: false, isSmall: true, isLarge: false, isColorful: true, isIndoor: true, hasLegs: false, canFly: false, isMadeByHuman: true, isHard: false, isWet: false, isRound: false } },
  { name: "자동차", hint: "탈것", emoji: "🚗", props: { isLiving: false, isAnimal: false, isPlant: false, isEdible: false, isSmall: false, isLarge: true, isColorful: true, isIndoor: false, hasLegs: false, canFly: false, isMadeByHuman: true, isHard: true, isWet: false, isRound: false } },
  { name: "나비", hint: "동물", emoji: "🦋", props: { isLiving: true, isAnimal: true, isPlant: false, isEdible: false, isSmall: true, isLarge: false, isColorful: true, isIndoor: false, hasLegs: true, canFly: true, isMadeByHuman: false, isHard: false, isWet: false, isRound: false } },
  { name: "피아노", hint: "악기", emoji: "🎹", props: { isLiving: false, isAnimal: false, isPlant: false, isEdible: false, isSmall: false, isLarge: true, isColorful: false, isIndoor: true, hasLegs: true, canFly: false, isMadeByHuman: true, isHard: true, isWet: false, isRound: false } },
  { name: "태양", hint: "우주", emoji: "☀️", props: { isLiving: false, isAnimal: false, isPlant: false, isEdible: false, isSmall: false, isLarge: true, isColorful: true, isIndoor: false, hasLegs: false, canFly: false, isMadeByHuman: false, isHard: false, isWet: false, isRound: true } },
  { name: "딸기", hint: "과일", emoji: "🍓", props: { isLiving: false, isAnimal: false, isPlant: true, isEdible: true, isSmall: true, isLarge: false, isColorful: true, isIndoor: false, hasLegs: false, canFly: false, isMadeByHuman: false, isHard: false, isWet: true, isRound: true } },
  { name: "로켓", hint: "탈것", emoji: "🚀", props: { isLiving: false, isAnimal: false, isPlant: false, isEdible: false, isSmall: false, isLarge: true, isColorful: false, isIndoor: false, hasLegs: false, canFly: true, isMadeByHuman: true, isHard: true, isWet: false, isRound: false } },
  { name: "해바라기", hint: "식물", emoji: "🌻", props: { isLiving: true, isAnimal: false, isPlant: true, isEdible: false, isSmall: false, isLarge: false, isColorful: true, isIndoor: false, hasLegs: false, canFly: false, isMadeByHuman: false, isHard: false, isWet: false, isRound: false } },
  { name: "눈사람", hint: "만들기", emoji: "⛄", props: { isLiving: false, isAnimal: false, isPlant: false, isEdible: false, isSmall: false, isLarge: false, isColorful: false, isIndoor: false, hasLegs: false, canFly: false, isMadeByHuman: true, isHard: false, isWet: true, isRound: true } },
  { name: "드래곤", hint: "상상의 동물", emoji: "🐉", props: { isLiving: true, isAnimal: true, isPlant: false, isEdible: false, isSmall: false, isLarge: true, isColorful: true, isIndoor: false, hasLegs: true, canFly: true, isMadeByHuman: false, isHard: true, isWet: false, isRound: false } },
];

const MAX_QUESTIONS = 20;

type Answer = "네" | "아니오" | "잘 모르겠어요";

function detectAnswer(q: string, item: MysteryItem): Answer {
  const keywords: [string[], keyof ItemProps][] = [
    [["살아있","생물","살아 있","살고 있"], "isLiving"],
    [["동물","짐승","creature"], "isAnimal"],
    [["식물","나무","꽃","풀"], "isPlant"],
    [["먹을 수","먹는","음식","맛있","먹어","식재료"], "isEdible"],
    [["작은","손에 들","주머니","소형","작아"], "isSmall"],
    [["큰","자동차보다","코끼리보다","사람보다 크","대형"], "isLarge"],
    [["알록달록","색깔","예쁜 색","화려","색이","컬러"], "isColorful"],
    [["실내","집안","방 안","실내에","집에서"], "isIndoor"],
    [["다리","발이","발을","다리가"], "hasLegs"],
    [["날 수","날개","하늘","비행","난다"], "canFly"],
    [["사람이 만든","인공","제품","발명","제조"], "isMadeByHuman"],
    [["딱딱","단단","굳은","딱딱한"], "isHard"],
    [["젖은","물기","액체","축축","촉촉"], "isWet"],
    [["동그란","원형","공처럼","둥근","원"], "isRound"],
  ];
  for (const [kws, prop] of keywords) {
    if (kws.some((k) => q.includes(k))) return item.props[prop] ? "네" : "아니오";
  }
  return "잘 모르겠어요";
}

interface QAEntry { question: string; answer: Answer }
interface Props { game: BuiltInGame; onBack: () => void }

export default function MysteryBoxGame({ game, onBack }: Props) {
  const [phase, setPhase] = useState<"start" | "playing" | "guessing" | "win" | "lose">("start");
  const [item, setItem] = useState<MysteryItem | null>(null);
  const [qaList, setQaList] = useState<QAEntry[]>([]);
  const [inputQ, setInputQ] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [isGuessing, setIsGuessing] = useState(false);
  const [boxShaking, setBoxShaking] = useState(false);

  const remaining = MAX_QUESTIONS - qaList.length;

  function startGame() {
    const picked = ITEMS[Math.floor(Math.random() * ITEMS.length)];
    setItem(picked);
    setQaList([]);
    setInputQ("");
    setGuessInput("");
    setIsGuessing(false);
    setPhase("playing");
  }

  function askQuestion() {
    if (!inputQ.trim() || !item) return;
    const ans = detectAnswer(inputQ, item);
    setQaList((q) => [...q, { question: inputQ, answer: ans }]);
    setInputQ("");
    if (qaList.length + 1 >= MAX_QUESTIONS) {
      setPhase("guessing");
    }
    setBoxShaking(true);
    setTimeout(() => setBoxShaking(false), 500);
  }

  function makeGuess() {
    if (!guessInput.trim() || !item) return;
    const correct = guessInput.trim().replace(/\s/g, "").includes(item.name) ||
      item.name.includes(guessInput.trim());
    setPhase(correct ? "win" : "lose");
  }

  const answerColor = (a: Answer) =>
    a === "네" ? "#10b981" : a === "아니오" ? "#ef4444" : "#9ca3af";

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">← 목록</button>
        <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
          style={{ background: game.gradientCss }}>
          <span className="text-4xl">{game.emoji}</span>
          <div>
            <h1 className="text-xl font-black">{game.title}</h1>
            <p className="text-white/80 text-sm">질문으로 상자 안의 물건을 맞혀요!</p>
          </div>
        </div>
      </div>

      {/* 시작 화면 */}
      {phase === "start" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex flex-col items-center gap-6">
          <div className="text-8xl">📦</div>
          <div className="text-center">
            <h2 className="text-2xl font-black text-gray-800">미스터리 박스</h2>
            <p className="text-gray-500 mt-2 text-sm leading-relaxed">
              상자 안에 무언가 숨어있어요!<br/>
              네/아니오로 대답할 수 있는 질문만으로<br/>
              {MAX_QUESTIONS}번 안에 정체를 밝혀보세요!
            </p>
          </div>
          <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 w-full text-sm text-pink-700">
            <p className="font-bold mb-1">💡 좋은 질문 예시</p>
            <p>• 살아있는 것인가요?</p>
            <p>• 먹을 수 있나요?</p>
            <p>• 날 수 있나요?</p>
            <p>• 동그란 모양인가요?</p>
          </div>
          <Button className="w-full py-5 text-xl font-black text-white rounded-2xl"
            style={{ background: "linear-gradient(135deg, #F472B6, #E11D48)" }}
            onClick={startGame}>
            📦 상자 열기!
          </Button>
        </div>
      )}

      {/* 게임 화면 */}
      {(phase === "playing" || phase === "guessing") && (
        <div className="space-y-4">
          {/* 상자 + 카운터 */}
          <div className="bg-white rounded-2xl shadow-sm border-2 p-6 flex items-center justify-between"
            style={{ borderColor: game.accentColor }}>
            <div className="text-center">
              <div className="text-6xl" style={{
                animation: boxShaking ? "none" : undefined,
                transform: boxShaking ? "translateX(4px)" : "none",
                transition: "transform 0.1s"
              }}>📦</div>
              <p className="text-gray-400 text-xs mt-1">미스터리 박스</p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-black" style={{ color: remaining <= 5 ? "#ef4444" : game.accentColor }}>
                {remaining}
              </div>
              <p className="text-gray-500 text-xs">질문 남음</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-700">{qaList.length}</div>
              <p className="text-gray-400 text-xs">질문함</p>
            </div>
          </div>

          {/* 진행 바 */}
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className="h-2 rounded-full transition-all duration-300"
              style={{ background: game.gradientCss, width: `${(qaList.length / MAX_QUESTIONS) * 100}%` }} />
          </div>

          {/* Q&A 목록 */}
          {qaList.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 max-h-52 overflow-y-auto space-y-2">
              {qaList.map((qa, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-xs text-gray-400 w-5 flex-shrink-0 mt-0.5 font-medium">{i+1}</span>
                  <div className="flex-1">
                    <p className="text-sm text-gray-700">{qa.question}</p>
                  </div>
                  <span className="font-black text-sm flex-shrink-0 px-2.5 py-0.5 rounded-full text-white"
                    style={{ background: answerColor(qa.answer) }}>
                    {qa.answer}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 입력 */}
          {phase === "playing" && !isGuessing && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
              <textarea
                className="w-full border-2 rounded-xl p-3 text-sm resize-none focus:outline-none h-20"
                style={{ borderColor: "#e5e7eb" }}
                onFocus={(e) => e.target.style.borderColor = game.accentColor}
                onBlur={(e) => e.target.style.borderColor = "#e5e7eb"}
                placeholder="네/아니오로 대답할 수 있는 질문을 입력하세요..."
                value={inputQ}
                onChange={(e) => setInputQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askQuestion(); } }}
              />
              <div className="flex gap-2">
                <Button className="flex-1 font-bold text-white rounded-xl"
                  style={{ background: game.gradientCss, opacity: inputQ.trim() ? 1 : 0.5 }}
                  disabled={!inputQ.trim()}
                  onClick={askQuestion}>
                  질문하기 →
                </Button>
                <Button variant="outline" className="rounded-xl px-4 text-sm"
                  onClick={() => setIsGuessing(true)}>
                  정답 맞추기!
                </Button>
              </div>
            </div>
          )}

          {/* 정답 맞추기 */}
          {(isGuessing || phase === "guessing") && (
            <div className="bg-white rounded-xl border-2 p-5 space-y-3"
              style={{ borderColor: game.accentColor }}>
              <h3 className="font-black text-gray-800">🎯 정답을 맞혀보세요!</h3>
              <input
                className="w-full border-2 rounded-xl px-4 py-3 text-sm focus:outline-none"
                style={{ borderColor: game.accentColor }}
                placeholder="상자 안에 있는 것의 이름을 써보세요..."
                value={guessInput}
                onChange={(e) => setGuessInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") makeGuess(); }}
                autoFocus
              />
              <div className="flex gap-2">
                <Button className="flex-1 font-bold text-white rounded-xl"
                  style={{ background: "linear-gradient(135deg, #F472B6, #E11D48)" }}
                  disabled={!guessInput.trim()}
                  onClick={makeGuess}>
                  정답 제출!
                </Button>
                {isGuessing && phase !== "guessing" && (
                  <Button variant="outline" className="rounded-xl" onClick={() => setIsGuessing(false)}>
                    계속 질문
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 성공 화면 */}
      {phase === "win" && item && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex flex-col items-center gap-5">
          <div className="text-8xl animate-bounce">{item.emoji}</div>
          <div
            className="text-white font-black text-2xl px-8 py-3 rounded-full"
            style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
            정답! 🎉
          </div>
          <h2 className="text-4xl font-black text-gray-800">{item.name}</h2>
          <p className="text-gray-500 text-sm text-center">
            {qaList.length}개의 질문으로 맞혔어요!<br/>
            <span className="text-green-500 font-bold">훌륭한 탐정 질문 실력이에요!</span>
          </p>
          <Button className="w-full py-4 font-black text-white rounded-xl"
            style={{ background: "linear-gradient(135deg, #F472B6, #E11D48)" }}
            onClick={startGame}>
            🔄 다시 하기
          </Button>
        </div>
      )}

      {/* 실패 화면 */}
      {phase === "lose" && item && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex flex-col items-center gap-5">
          <div className="text-8xl">{item.emoji}</div>
          <div className="text-white font-black text-xl px-6 py-2 rounded-full" style={{ background: "#ef4444" }}>
            아쉬워요...
          </div>
          <div className="text-center">
            <p className="text-gray-500 text-sm mb-2">정답은</p>
            <h2 className="text-4xl font-black text-gray-800">{item.name}</h2>
            <p className="text-gray-400 text-sm mt-1">({item.hint})</p>
          </div>
          <p className="text-gray-500 text-sm text-center">
            {qaList.length}개의 질문을 했어요.<br/>
            더 좋은 질문으로 도전해보세요!
          </p>
          <Button className="w-full py-4 font-black text-white rounded-xl"
            style={{ background: "linear-gradient(135deg, #F472B6, #E11D48)" }}
            onClick={startGame}>
            🔄 다시 도전!
          </Button>
        </div>
      )}
    </div>
  );
}

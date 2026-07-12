"use client";

import { useState, useEffect } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { useAIPlay } from "./useAIPlay";
import { useSingleAward, AwardBadge } from "./useSingleAward";
import { GameResultReview } from "./GameResultReview";
import { getQuestionGameText } from "@/lib/question-game-i18n";
import type { BuiltInGame } from "@/lib/question-games-data";
import type { GameStartConfig } from "../[gameId]/page";

/* ── 내장 아이템 (솔로/친구 모드 fallback) ── */
interface ItemProps { isLiving:boolean;isAnimal:boolean;isPlant:boolean;isEdible:boolean;isSmall:boolean;isLarge:boolean;isColorful:boolean;isIndoor:boolean;hasLegs:boolean;canFly:boolean;isMadeByHuman:boolean;isHard:boolean;isWet:boolean;isRound:boolean }
interface MysteryItem { name:string;hint:string;emoji:string;props:ItemProps }

const ITEMS: MysteryItem[] = [
  { name:"사과", hint:"과일", emoji:"🍎", props:{isLiving:false,isAnimal:false,isPlant:true,isEdible:true,isSmall:true,isLarge:false,isColorful:true,isIndoor:false,hasLegs:false,canFly:false,isMadeByHuman:false,isHard:false,isWet:false,isRound:true}},
  { name:"강아지", hint:"동물", emoji:"🐶", props:{isLiving:true,isAnimal:true,isPlant:false,isEdible:false,isSmall:true,isLarge:false,isColorful:false,isIndoor:true,hasLegs:true,canFly:false,isMadeByHuman:false,isHard:false,isWet:false,isRound:false}},
  { name:"책", hint:"물건", emoji:"📚", props:{isLiving:false,isAnimal:false,isPlant:false,isEdible:false,isSmall:true,isLarge:false,isColorful:true,isIndoor:true,hasLegs:false,canFly:false,isMadeByHuman:true,isHard:false,isWet:false,isRound:false}},
  { name:"자동차", hint:"탈것", emoji:"🚗", props:{isLiving:false,isAnimal:false,isPlant:false,isEdible:false,isSmall:false,isLarge:true,isColorful:true,isIndoor:false,hasLegs:false,canFly:false,isMadeByHuman:true,isHard:true,isWet:false,isRound:false}},
  { name:"나비", hint:"동물", emoji:"🦋", props:{isLiving:true,isAnimal:true,isPlant:false,isEdible:false,isSmall:true,isLarge:false,isColorful:true,isIndoor:false,hasLegs:true,canFly:true,isMadeByHuman:false,isHard:false,isWet:false,isRound:false}},
  { name:"피아노", hint:"악기", emoji:"🎹", props:{isLiving:false,isAnimal:false,isPlant:false,isEdible:false,isSmall:false,isLarge:true,isColorful:false,isIndoor:true,hasLegs:true,canFly:false,isMadeByHuman:true,isHard:true,isWet:false,isRound:false}},
  { name:"태양", hint:"우주", emoji:"☀️", props:{isLiving:false,isAnimal:false,isPlant:false,isEdible:false,isSmall:false,isLarge:true,isColorful:true,isIndoor:false,hasLegs:false,canFly:false,isMadeByHuman:false,isHard:false,isWet:false,isRound:true}},
  { name:"딸기", hint:"과일", emoji:"🍓", props:{isLiving:false,isAnimal:false,isPlant:true,isEdible:true,isSmall:true,isLarge:false,isColorful:true,isIndoor:false,hasLegs:false,canFly:false,isMadeByHuman:false,isHard:false,isWet:true,isRound:true}},
  { name:"로켓", hint:"탈것", emoji:"🚀", props:{isLiving:false,isAnimal:false,isPlant:false,isEdible:false,isSmall:false,isLarge:true,isColorful:false,isIndoor:false,hasLegs:false,canFly:true,isMadeByHuman:true,isHard:true,isWet:false,isRound:false}},
  { name:"해바라기", hint:"식물", emoji:"🌻", props:{isLiving:true,isAnimal:false,isPlant:true,isEdible:false,isSmall:false,isLarge:false,isColorful:true,isIndoor:false,hasLegs:false,canFly:false,isMadeByHuman:false,isHard:false,isWet:false,isRound:false}},
  { name:"눈사람", hint:"만들기", emoji:"⛄", props:{isLiving:false,isAnimal:false,isPlant:false,isEdible:false,isSmall:false,isLarge:false,isColorful:false,isIndoor:false,hasLegs:false,canFly:false,isMadeByHuman:true,isHard:false,isWet:true,isRound:true}},
  { name:"드래곤", hint:"상상", emoji:"🐉", props:{isLiving:true,isAnimal:true,isPlant:false,isEdible:false,isSmall:false,isLarge:true,isColorful:true,isIndoor:false,hasLegs:true,canFly:true,isMadeByHuman:false,isHard:true,isWet:false,isRound:false}},
];

const ITEMS_EN: MysteryItem[] = [
  { name:"apple", hint:"fruit", emoji:"🍎", props:{isLiving:false,isAnimal:false,isPlant:true,isEdible:true,isSmall:true,isLarge:false,isColorful:true,isIndoor:false,hasLegs:false,canFly:false,isMadeByHuman:false,isHard:false,isWet:false,isRound:true}},
  { name:"puppy", hint:"animal", emoji:"🐶", props:{isLiving:true,isAnimal:true,isPlant:false,isEdible:false,isSmall:true,isLarge:false,isColorful:false,isIndoor:true,hasLegs:true,canFly:false,isMadeByHuman:false,isHard:false,isWet:false,isRound:false}},
  { name:"book", hint:"object", emoji:"📚", props:{isLiving:false,isAnimal:false,isPlant:false,isEdible:false,isSmall:true,isLarge:false,isColorful:true,isIndoor:true,hasLegs:false,canFly:false,isMadeByHuman:true,isHard:false,isWet:false,isRound:false}},
  { name:"car", hint:"vehicle", emoji:"🚗", props:{isLiving:false,isAnimal:false,isPlant:false,isEdible:false,isSmall:false,isLarge:true,isColorful:true,isIndoor:false,hasLegs:false,canFly:false,isMadeByHuman:true,isHard:true,isWet:false,isRound:false}},
  { name:"butterfly", hint:"animal", emoji:"🦋", props:{isLiving:true,isAnimal:true,isPlant:false,isEdible:false,isSmall:true,isLarge:false,isColorful:true,isIndoor:false,hasLegs:true,canFly:true,isMadeByHuman:false,isHard:false,isWet:false,isRound:false}},
  { name:"piano", hint:"instrument", emoji:"🎹", props:{isLiving:false,isAnimal:false,isPlant:false,isEdible:false,isSmall:false,isLarge:true,isColorful:false,isIndoor:true,hasLegs:true,canFly:false,isMadeByHuman:true,isHard:true,isWet:false,isRound:false}},
  { name:"sun", hint:"space", emoji:"☀️", props:{isLiving:false,isAnimal:false,isPlant:false,isEdible:false,isSmall:false,isLarge:true,isColorful:true,isIndoor:false,hasLegs:false,canFly:false,isMadeByHuman:false,isHard:false,isWet:false,isRound:true}},
  { name:"strawberry", hint:"fruit", emoji:"🍓", props:{isLiving:false,isAnimal:false,isPlant:true,isEdible:true,isSmall:true,isLarge:false,isColorful:true,isIndoor:false,hasLegs:false,canFly:false,isMadeByHuman:false,isHard:false,isWet:true,isRound:true}},
  { name:"rocket", hint:"vehicle", emoji:"🚀", props:{isLiving:false,isAnimal:false,isPlant:false,isEdible:false,isSmall:false,isLarge:true,isColorful:false,isIndoor:false,hasLegs:false,canFly:true,isMadeByHuman:true,isHard:true,isWet:false,isRound:false}},
  { name:"sunflower", hint:"plant", emoji:"🌻", props:{isLiving:true,isAnimal:false,isPlant:true,isEdible:false,isSmall:false,isLarge:false,isColorful:true,isIndoor:false,hasLegs:false,canFly:false,isMadeByHuman:false,isHard:false,isWet:false,isRound:false}},
  { name:"snowman", hint:"made thing", emoji:"⛄", props:{isLiving:false,isAnimal:false,isPlant:false,isEdible:false,isSmall:false,isLarge:false,isColorful:false,isIndoor:false,hasLegs:false,canFly:false,isMadeByHuman:true,isHard:false,isWet:true,isRound:true}},
  { name:"dragon", hint:"imaginary", emoji:"🐉", props:{isLiving:true,isAnimal:true,isPlant:false,isEdible:false,isSmall:false,isLarge:true,isColorful:true,isIndoor:false,hasLegs:true,canFly:true,isMadeByHuman:false,isHard:true,isWet:false,isRound:false}},
];

type Answer = "네"|"아니오"|"잘 모르겠어요"|"Yes"|"No"|"Not sure";

function detectAnswer(q: string, item: MysteryItem, locale: string): Answer {
  const checks: [string[], keyof ItemProps][] = locale === "en" ? [
    [["alive", "living"], "isLiving"],
    [["animal", "creature"], "isAnimal"],
    [["plant", "tree", "flower"], "isPlant"],
    [["eat", "food", "edible", "delicious"], "isEdible"],
    [["small", "pocket", "tiny"], "isSmall"],
    [["big", "large", "huge"], "isLarge"],
    [["color", "colorful", "bright"], "isColorful"],
    [["inside", "indoor", "room", "house"], "isIndoor"],
    [["leg", "foot", "feet"], "hasLegs"],
    [["fly", "wing", "sky"], "canFly"],
    [["human made", "made by people", "man made", "invented"], "isMadeByHuman"],
    [["hard", "solid"], "isHard"],
    [["wet", "water"], "isWet"],
    [["round", "circle", "ball"], "isRound"],
  ] : [
    [["살아있","생물","살아 있"], "isLiving"],
    [["동물","짐승"], "isAnimal"],
    [["식물","나무","꽃","풀"], "isPlant"],
    [["먹을 수","먹는","음식","맛있"], "isEdible"],
    [["작은","손에 들","주머니","소형"], "isSmall"],
    [["큰","자동차보다","코끼리보다","대형"], "isLarge"],
    [["알록달록","색깔","예쁜 색","화려"], "isColorful"],
    [["실내","집안","방 안"], "isIndoor"],
    [["다리","발이","발을"], "hasLegs"],
    [["날 수","날개","하늘","비행"], "canFly"],
    [["사람이 만든","인공","제품","발명"], "isMadeByHuman"],
    [["딱딱","단단","굳은"], "isHard"],
    [["젖은","물기","액체","축축"], "isWet"],
    [["동그란","원형","공처럼","둥근"], "isRound"],
  ];
  const normalized = q.toLowerCase();
  for (const [kws, prop] of checks) {
    if (kws.some((k) => normalized.includes(k))) return item.props[prop] ? (locale === "en" ? "Yes" : "네") : (locale === "en" ? "No" : "아니오");
  }
  return locale === "en" ? "Not sure" : "잘 모르겠어요";
}

const MAX_Q = 20;
const AI_NAME = "🤖 AI";
const AI_THINK_MS = 1000;
interface QAEntry { asker: string; question: string; answer: Answer | string }
interface AIItem { name: string; category: string; emoji: string }
interface Props { game: BuiltInGame; onBack: () => void; config: GameStartConfig }

export default function MysteryBoxGame({ game, onBack, config }: Props) {
  const locale = useLocale();
  const text = getQuestionGameText(locale);
  const isAI = config.mode === "ai";
  const isSolo = config.mode === "solo";
  const { ask, loading: aiLoading } = useAIPlay();
  const { award, result: awardResult } = useSingleAward();

  // 참가자 구성 (혼자=1명 / AI=나+AI / 친구=명단)
  const playersList = (() => {
    if (isSolo) return [config.players[0]?.trim() || text.me];
    if (isAI) return [config.players[0]?.trim() || text.me, AI_NAME];
    return config.players.length > 0 ? config.players : [text.me];
  })();
  const hasTurns = playersList.length > 1;

  const [phase, setPhase] = useState<"start"|"playing"|"guessing"|"win"|"lose">("start");
  const [localItem, setLocalItem] = useState<MysteryItem | null>(null);
  const [aiItem, setAiItem] = useState<AIItem | null>(null);
  const [qaList, setQaList] = useState<QAEntry[]>([]);
  const [inputQ, setInputQ] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [isGuessing, setIsGuessing] = useState(false);
  const [aiSetupError, setAiSetupError] = useState("");
  const [turnIdx, setTurnIdx] = useState(0);
  const [winner, setWinner] = useState<string | null>(null);

  const item = isAI ? aiItem : localItem;
  const itemName = isAI ? (aiItem?.name ?? "") : (localItem?.name ?? "");
  const remaining = MAX_Q - qaList.length;
  const currentPlayer = playersList[turnIdx % playersList.length] ?? text.me;
  const isAITurn = isAI && currentPlayer === AI_NAME;
  const isHumanTurn = !isAITurn;

  // 적립 (혼자/AI 모드). AI 모드는 사람이 이겼을 때만 completed
  useEffect(() => {
    if (phase !== "win" && phase !== "lose") return;
    if (!isSolo && !isAI) return;
    award({
      mode: isAI ? "ai" : "solo",
      gameId: "mystery-box",
      validQuestions: qaList.filter((qa) => qa.asker !== AI_NAME).length,
      completed: phase === "win",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function startGame() {
    setQaList([]);
    setInputQ("");
    setGuessInput("");
    setIsGuessing(false);
    setAiSetupError("");
    setTurnIdx(0);
    setWinner(null);

    if (isAI) {
      // AI 모드: 게임이 비밀 물건을 고른다(AI는 이름을 모른 채 추측, 답변만 AI가 정직하게)
      const res = await ask({ action: "mystery-box:setup", context: {} });
      if (!res) { setAiSetupError(text.aiSetupError); return; }
      if (res.parsed) {
        setAiItem({ name: res.parsed.name ?? "?", category: res.parsed.category ?? "", emoji: res.parsed.emoji ?? "📦" });
      } else {
        const source = locale === "en" ? ITEMS_EN : ITEMS;
        const pick = source[Math.floor(Math.random() * source.length)];
        setAiItem({ name: pick.name, category: pick.hint, emoji: pick.emoji });
      }
    } else {
      const source = locale === "en" ? ITEMS_EN : ITEMS;
      setLocalItem(source[Math.floor(Math.random() * source.length)]);
    }
    setPhase("playing");
  }

  // 질문 1건 답을 얻는다 (AI 모드는 AI 지킴이, 그 외는 규칙 기반)
  async function answerFor(question: string): Promise<string> {
    if (isAI && aiItem) {
      const res = await ask({ action: "mystery-box:answer", context: { itemName: aiItem.name, question } });
      return res?.text ?? text.notSure;
    }
    if (localItem) return detectAnswer(question, localItem, locale);
    return text.notSure;
  }

  function advanceTurnAfter(newList: QAEntry[]) {
    if (newList.length >= MAX_Q) { setPhase("guessing"); return; }
    if (hasTurns) setTurnIdx((t) => t + 1);
  }

  // 사람 차례: 질문하기
  async function askQuestion() {
    if (!inputQ.trim() || aiLoading || !isHumanTurn) return;
    const q = inputQ.trim();
    const ans = await answerFor(q);
    const newList = [...qaList, { asker: currentPlayer, question: q, answer: ans }];
    setQaList(newList);
    setInputQ("");
    advanceTurnAfter(newList);
  }

  // AI 차례: 스스로 질문을 만들고, 확신하면 추측까지 (turnIdx 변화로 1회 실행)
  useEffect(() => {
    if (!isAITurn || phase !== "playing" || !aiItem) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const history = qaList.map((qa, i) => `${i + 1}. (${qa.asker}) ${qa.question} → ${qa.answer}`).join("\n");
      const turnRes = await ask({ action: "mystery-box:ai-turn", context: { history } });
      if (cancelled) return;

      const guess = (turnRes?.parsed?.guess ?? "").trim();
      if (guess) {
        const correct = guess.includes(aiItem.name) || aiItem.name.includes(guess);
        if (correct) { setWinner(AI_NAME); setPhase("lose"); return; }
        // 틀린 추측 → 차례 한 번 소모
        const missList = [...qaList, { asker: AI_NAME, question: locale === "en" ? `"${guess}" ${text.guessSuffix}` : `“${guess}” ${text.guessSuffix}`, answer: text.wrongGuess }];
        setQaList(missList);
        advanceTurnAfter(missList);
        return;
      }

      const q = (turnRes?.parsed?.question ?? "").trim() || text.aiQuestionFallback;
      const ans = await answerFor(q);
      if (cancelled) return;
      const newList = [...qaList, { asker: AI_NAME, question: q, answer: ans }];
      setQaList(newList);
      advanceTurnAfter(newList);
    }, AI_THINK_MS);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAITurn, phase, turnIdx]);

  function makeGuess() {
    if (!guessInput.trim() || !item) return;
    const g = guessInput.trim();
    const correct = g.includes(itemName) || itemName.includes(g);
    if (correct) { setWinner(currentPlayer); setPhase("win"); return; }
    // 틀림
    if (phase === "guessing") { setPhase("lose"); return; }  // 마지막 강제 추측 실패
    if (hasTurns) {
      // 차례 모드: 추측 실패 = 차례 넘김
      const missList = [...qaList, { asker: currentPlayer, question: locale === "en" ? `"${g}" ${text.guessSuffix}` : `“${g}” ${text.guessSuffix}`, answer: text.wrongGuess }];
      setQaList(missList);
      setGuessInput("");
      setIsGuessing(false);
      advanceTurnAfter(missList);
    } else {
      setPhase("lose");  // 솔로: 자발적 추측 실패 = 종료
    }
  }

  const answerColor = (a: string) =>
    a === "네" || a === "Yes" ? "#10b981" : a === "아니오" || a === "No" ? "#ef4444" : "#9ca3af";

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-600 text-sm">{text.backToList}</button>
        <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
          style={{ background: game.gradientCss }}>
          <span className="text-4xl">{game.emoji}</span>
          <div>
            <h1 className="text-xl font-black">{game.title}</h1>
            <p className="text-white/80 text-sm">
              {isAI ? text.mysteryAiSubtitle
                : hasTurns ? text.mysteryTurnSubtitle
                : text.mysterySoloSubtitle}
            </p>
          </div>
        </div>
      </div>

      {/* 시작 */}
      {phase === "start" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex flex-col items-center gap-6">
          <div className="text-8xl">📦</div>
          {isAI ? (
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black text-gray-800">{text.mysteryAiTitle}</h2>
              <p className="text-gray-500 text-sm">{text.mysteryAiDesc(MAX_Q)}</p>
              <div className="flex items-center justify-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2 mt-2">
                <span className="text-xl">🤖</span>
                <p className="text-indigo-600 text-sm font-medium">{text.mysteryAiAlso}</p>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <h2 className="text-2xl font-black text-gray-800">{text.mysteryTitle}</h2>
              <p className="text-gray-500 text-sm mt-2">
                {text.mysteryDesc(playersList.length, MAX_Q, hasTurns)}
              </p>
            </div>
          )}
          {hasTurns && !isAI && (
            <div className="flex flex-wrap justify-center gap-2">
              {playersList.map((p, i) => (
                <span key={p} className="px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700">{i + 1}. {p}</span>
              ))}
            </div>
          )}
          {aiSetupError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm text-center">
              {aiSetupError}
            </div>
          )}
          <Button className="w-full py-5 text-xl font-black text-white rounded-2xl"
            style={{ background: "linear-gradient(135deg, #F472B6, #E11D48)" }}
            disabled={aiLoading} onClick={startGame}>
            {aiLoading ? text.aiPickingItem : text.start}
          </Button>
        </div>
      )}

      {/* 게임 */}
      {(phase === "playing" || phase === "guessing") && (
        <div className="space-y-4">
          {/* 차례 표시 (AI/친구 모드) */}
          {hasTurns && phase === "playing" && (
            <div className="flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold"
              style={{ background: `${game.accentColor}1a`, color: game.accentColor }}>
              <span>{isAITurn ? "🤖" : "🙋"}</span>
              <span>{text.turnOf(currentPlayer)}</span>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border-2 p-6 flex items-center justify-between"
            style={{ borderColor: game.accentColor }}>
            <div className="text-center">
              <div className="text-6xl">📦</div>
              {isAI && <p className="text-gray-400 text-xs mt-1">{text.secretItem}</p>}
            </div>
            <div className="text-center">
              <div className="text-4xl font-black" style={{ color: remaining <= 5 ? "#ef4444" : game.accentColor }}>
                {remaining}
              </div>
              <p className="text-gray-500 text-xs">{text.questionsLeft}</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-700">{qaList.length}</div>
              <p className="text-gray-400 text-xs">{text.questionsAsked}</p>
            </div>
          </div>

          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div className="h-2 rounded-full transition-all"
              style={{ background: game.gradientCss, width: `${(qaList.length / MAX_Q) * 100}%` }} />
          </div>

          {qaList.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 max-h-52 overflow-y-auto space-y-2">
              {qaList.map((qa, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-xs text-gray-400 w-5 flex-shrink-0 mt-0.5 font-medium">{i+1}</span>
                  <div className="flex-1 min-w-0">
                    {hasTurns && (
                      <span className={`mr-1 text-xs font-bold ${qa.asker === AI_NAME ? "text-indigo-500" : "text-gray-500"}`}>
                        {qa.asker}
                      </span>
                    )}
                    <span className="text-sm text-gray-700">{qa.question}</span>
                  </div>
                  <span className="font-black text-sm flex-shrink-0 px-2.5 py-0.5 rounded-full text-white"
                    style={{ background: answerColor(qa.answer as string) }}>
                    {qa.answer}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* AI 생각 중 */}
          {isAITurn && phase === "playing" && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
              <div className="flex items-center justify-center gap-2 text-indigo-600">
                <span className="w-4 h-4 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-bold">{text.aiMakingQuestion}</p>
              </div>
            </div>
          )}

          {/* 사람 차례 입력 */}
          {phase === "playing" && isHumanTurn && !isGuessing && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
              <textarea
                className="w-full border-2 rounded-xl p-3 text-sm resize-none focus:outline-none h-20"
                style={{ borderColor: "#e5e7eb" }}
                onFocus={(e) => (e.target.style.borderColor = game.accentColor)}
                onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
                placeholder={text.yesNoPlaceholder(hasTurns ? currentPlayer : undefined)}
                value={inputQ}
                onChange={(e) => setInputQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askQuestion(); }}}
              />
              <div className="flex gap-2">
                <Button className="flex-1 font-bold text-white rounded-xl"
                  style={{ background: game.gradientCss, opacity: inputQ.trim() && !aiLoading ? 1 : 0.5 }}
                  disabled={!inputQ.trim() || aiLoading} onClick={askQuestion}>
                  {aiLoading ? text.answerLoading : text.askQuestion}
                </Button>
                <Button variant="outline" className="rounded-xl px-4 text-sm" onClick={() => setIsGuessing(true)}>
                  {text.guessAnswer}
                </Button>
              </div>
            </div>
          )}

          {(isGuessing || phase === "guessing") && (
            <div className="bg-white rounded-xl border-2 p-5 space-y-3" style={{ borderColor: game.accentColor }}>
              <h3 className="font-black text-gray-800">🎯 {hasTurns && phase === "playing" ? `${currentPlayer}, ` : ""}{text.guessPrompt}</h3>
              <input className="w-full border-2 rounded-xl px-4 py-3 text-sm focus:outline-none"
                style={{ borderColor: game.accentColor }}
                placeholder={text.guessInputPlaceholder}
                value={guessInput}
                onChange={(e) => setGuessInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") makeGuess(); }}
                autoFocus />
              <div className="flex gap-2">
                <Button className="flex-1 font-bold text-white rounded-xl"
                  style={{ background: "linear-gradient(135deg, #F472B6, #E11D48)" }}
                  disabled={!guessInput.trim()} onClick={makeGuess}>
                  {text.submitAnswer}
                </Button>
                {isGuessing && phase !== "guessing" && (
                  <Button variant="outline" className="rounded-xl" onClick={() => { setIsGuessing(false); setGuessInput(""); }}>{text.keepAsking}</Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 성공 */}
      {phase === "win" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex flex-col items-center gap-5">
          <div className="text-8xl animate-bounce">{isAI ? aiItem?.emoji : localItem?.emoji}</div>
          <div className="text-white font-black text-2xl px-8 py-3 rounded-full"
            style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>{text.correct} 🎉</div>
          <h2 className="text-4xl font-black text-gray-800">{itemName}</h2>
          <p className="text-gray-500 text-sm text-center">
            {hasTurns && winner ? text.win(winner) : text.solvedWithQuestions(qaList.length)}
            {isAI && <><br/><span className="text-indigo-500 font-bold">{text.beatAi} 🏆</span></>}
          </p>
          <GameResultReview
            title={text.exchangedQuestions}
            accentColor={game.accentColor}
            entries={qaList.map((qa) => ({ q: hasTurns ? `${qa.asker} · ${qa.question}` : qa.question, a: String(qa.answer) }))}
          />
          <AwardBadge result={awardResult} />
          <Button className="w-full py-4 font-black text-white rounded-xl"
            style={{ background: "linear-gradient(135deg, #F472B6, #E11D48)" }} onClick={startGame}>
            {text.retry}
          </Button>
        </div>
      )}

      {/* 실패 */}
      {phase === "lose" && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex flex-col items-center gap-5">
          <div className="text-8xl">{isAI ? aiItem?.emoji : localItem?.emoji}</div>
          <div className="text-white font-black text-xl px-6 py-2 rounded-full" style={{ background: "#ef4444" }}>
            {winner === AI_NAME ? text.aiWon : text.close}
          </div>
          <div className="text-center">
            <p className="text-gray-500 text-sm mb-2">{text.answerWas}</p>
            <h2 className="text-4xl font-black text-gray-800">{itemName}</h2>
            <p className="text-gray-400 text-sm mt-1">({isAI ? aiItem?.category : localItem?.hint})</p>
          </div>
          <GameResultReview
            title={text.exchangedQuestions}
            accentColor={game.accentColor}
            entries={qaList.map((qa) => ({ q: hasTurns ? `${qa.asker} · ${qa.question}` : qa.question, a: String(qa.answer) }))}
          />
          <AwardBadge result={awardResult} />
          <Button className="w-full py-4 font-black text-white rounded-xl"
            style={{ background: "linear-gradient(135deg, #F472B6, #E11D48)" }} onClick={startGame}>
            {text.tryAgain}
          </Button>
        </div>
      )}
    </div>
  );
}

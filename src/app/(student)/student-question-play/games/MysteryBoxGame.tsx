"use client";

import { useState, useEffect, useRef } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { useAIPlay } from "./useAIPlay";
import { getQuestionGameText } from "@/lib/question-game-i18n";
import {
  QUESTION_GAME_LIMITS,
  QUESTION_GAME_RULES,
} from "@/lib/question-game-rules";
import {
  isMysteryGuessCorrect,
  isMysteryNameMatch,
  MYSTERY_ITEMS,
  type MysteryLocale,
} from "@/lib/mystery-box-rules";
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

const AI_NAME = "🤖 AI";
const AI_THINK_MS = 1000;
interface QAEntry {
  kind: "question" | "guess";
  asker: string;
  question: string;
  answer: Answer | string;
}
type AnswerResult =
  | { ok: true; answer: string }
  | { ok: false };
interface AIItem { name: string; category: string; emoji: string }
interface Props { game: BuiltInGame; onBack: () => void; config: GameStartConfig }

function matchesMysteryItem(
  guess: string,
  answer: string,
  locale: MysteryLocale,
): boolean {
  const builtInItem = MYSTERY_ITEMS.find((candidate) =>
    isMysteryGuessCorrect(answer, candidate, locale),
  );
  return builtInItem
    ? isMysteryGuessCorrect(guess, builtInItem, locale)
    : isMysteryNameMatch(guess, answer, locale);
}

export default function MysteryBoxGame({ game, onBack, config }: Props) {
  const locale = useLocale();
  const mysteryLocale: MysteryLocale = locale === "en" ? "en" : "ko";
  const text = getQuestionGameText(locale);
  const isAI = config.mode === "ai";
  const isSolo = config.mode === "solo";
  const maxActivities = QUESTION_GAME_RULES["mystery-box"].targets[
    isAI ? "ai" : "solo"
  ].count;
  const activityDescription = locale === "en"
    ? isAI
      ? `Take turns with AI. Each question or guess uses one of ${maxActivities} activities.`
      : `Use questions or guesses to solve it within ${maxActivities} activities.`
    : isAI
      ? `인공지능과 번갈아 진행해요. 질문이나 추측을 합쳐 ${maxActivities}번 안에 맞혀 보세요.`
      : `질문이나 추측을 합쳐 ${maxActivities}번 안에 맞혀 보세요.`;
  const { ask, loading: aiLoading } = useAIPlay();

  // 참가자 구성 (혼자=1명 / AI=나+AI / 친구=명단)
  const playersList = (() => {
    if (isSolo) return [config.players[0]?.trim() || text.me];
    if (isAI) return [config.players[0]?.trim() || text.me, AI_NAME];
    return config.players.length > 0 ? config.players : [text.me];
  })();
  const hasTurns = playersList.length > 1;

  const [phase, setPhase] = useState<"start"|"playing"|"win"|"lose">("start");
  const [localItem, setLocalItem] = useState<MysteryItem | null>(null);
  const [aiItem, setAiItem] = useState<AIItem | null>(null);
  const [qaList, setQaList] = useState<QAEntry[]>([]);
  const [inputQ, setInputQ] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [isGuessing, setIsGuessing] = useState(false);
  const [aiSetupError, setAiSetupError] = useState("");
  const [turnIdx, setTurnIdx] = useState(0);
  const [winner, setWinner] = useState<string | null>(null);
  const [activityPending, setActivityPending] = useState(false);
  const activityLockRef = useRef(false);
  const unlockAfterActivityRef = useRef(false);
  const gameRunRef = useRef(0);

  const item = isAI ? aiItem : localItem;
  const itemName = isAI ? (aiItem?.name ?? "") : (localItem?.name ?? "");
  const remaining = Math.max(0, maxActivities - qaList.length);
  const currentPlayer = playersList[turnIdx % playersList.length] ?? text.me;
  const isAITurn = isAI && currentPlayer === AI_NAME;
  const isHumanTurn = !isAITurn;

  useEffect(() => {
    if (!unlockAfterActivityRef.current) return;
    unlockAfterActivityRef.current = false;
    activityLockRef.current = false;
    setActivityPending(false);
  }, [qaList, phase, turnIdx]);

  async function startGame() {
    const gameRun = gameRunRef.current + 1;
    gameRunRef.current = gameRun;
    activityLockRef.current = false;
    unlockAfterActivityRef.current = false;
    setActivityPending(false);
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
      if (gameRunRef.current !== gameRun) return;
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
  async function answerFor(question: string): Promise<AnswerResult> {
    if (isAI && aiItem) {
      const res = await ask({ action: "mystery-box:answer", context: { itemName: aiItem.name, question } });
      if (!res) return { ok: false };
      return { ok: true, answer: res.text?.trim() || text.notSure };
    }
    if (localItem) {
      return { ok: true, answer: detectAnswer(question, localItem, locale) };
    }
    return { ok: true, answer: text.notSure };
  }

  function recordActivity(newList: QAEntry[]) {
    setQaList(newList);
    if (newList.length >= maxActivities) {
      setIsGuessing(false);
      setPhase("lose");
      return;
    }
    if (hasTurns) setTurnIdx((t) => t + 1);
  }

  // 사람 차례: 질문하기
  async function askQuestion() {
    if (
      !inputQ.trim() ||
      aiLoading ||
      !isHumanTurn ||
      activityLockRef.current
    ) return;
    const q = inputQ.trim();
    const gameRun = gameRunRef.current;
    activityLockRef.current = true;
    setActivityPending(true);
    try {
      const result = await answerFor(q);
      if (gameRunRef.current !== gameRun) return;
      if (!result.ok) return;
      const newList: QAEntry[] = [
        ...qaList,
        {
          kind: "question",
          asker: currentPlayer,
          question: q,
          answer: result.answer,
        },
      ];
      setInputQ("");
      recordActivity(newList);
    } catch {
      // 입력을 보존해 학생이 그대로 다시 시도할 수 있게 한다.
    } finally {
      if (gameRunRef.current === gameRun) {
        activityLockRef.current = false;
        setActivityPending(false);
      }
    }
  }

  // AI 차례: 스스로 질문을 만들고, 확신하면 추측까지 (turnIdx 변화로 1회 실행)
  useEffect(() => {
    if (!isAITurn || phase !== "playing" || !aiItem) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const history = qaList.map((qa, i) => `${i + 1}. (${qa.asker}) ${qa.question} → ${qa.answer}`).join("\n");
        const turnRes = await ask({ action: "mystery-box:ai-turn", context: { history } });
        if (cancelled) return;
        if (!turnRes) {
          setTurnIdx((turn) => turn + 1);
          return;
        }

        const guess = (turnRes.parsed?.guess ?? "").trim();
        if (guess) {
          const correct = matchesMysteryItem(guess, aiItem.name, mysteryLocale);
          const guessList: QAEntry[] = [
            ...qaList,
            {
              kind: "guess",
              asker: AI_NAME,
              question: locale === "en"
                ? `"${guess}" ${text.guessSuffix}`
                : `“${guess}” ${text.guessSuffix}`,
              answer: correct ? text.correct : text.wrongGuess,
            },
          ];
          if (correct) {
            setQaList(guessList);
            setWinner(AI_NAME);
            setPhase("lose");
            return;
          }
          // 틀린 추측 → 차례 한 번 소모
          recordActivity(guessList);
          return;
        }

        const q = (turnRes.parsed?.question ?? "").trim() || text.aiQuestionFallback;
        const result = await answerFor(q);
        if (cancelled) return;
        if (!result.ok) {
          setTurnIdx((turn) => turn + 1);
          return;
        }
        const newList: QAEntry[] = [
          ...qaList,
          {
            kind: "question",
            asker: AI_NAME,
            question: q,
            answer: result.answer,
          },
        ];
        recordActivity(newList);
      } catch {
        if (!cancelled) setTurnIdx((turn) => turn + 1);
      }
    }, AI_THINK_MS);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAITurn, phase, turnIdx]);

  function makeGuess() {
    if (!guessInput.trim() || !item || activityLockRef.current) return;
    activityLockRef.current = true;
    unlockAfterActivityRef.current = true;
    setActivityPending(true);
    const g = guessInput.trim();
    try {
      const correct = matchesMysteryItem(g, itemName, mysteryLocale);
      const guessList: QAEntry[] = [
        ...qaList,
        {
          kind: "guess",
          asker: currentPlayer,
          question: locale === "en"
            ? `"${g}" ${text.guessSuffix}`
            : `“${g}” ${text.guessSuffix}`,
          answer: correct ? text.correct : text.wrongGuess,
        },
      ];
      setGuessInput("");
      setIsGuessing(false);
      if (correct) {
        setQaList(guessList);
        setWinner(currentPlayer);
        setPhase("win");
        return;
      }
      recordActivity(guessList);
    } catch {
      unlockAfterActivityRef.current = false;
      activityLockRef.current = false;
      setActivityPending(false);
    }
  }

  const answerClass = (answer: string) =>
    answer === "네" || answer === "Yes" || answer === text.correct
      ? "bg-emerald-700 text-white dark:bg-emerald-300 dark:text-emerald-950"
      : answer === "아니오" || answer === "No" || answer === text.wrongGuess
        ? "bg-rose-700 text-white dark:bg-rose-300 dark:text-rose-950"
        : "bg-muted text-foreground";

  return (
    <div className="mx-auto max-w-xl space-y-5 text-foreground">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">{text.backToList}</button>
        <div className="flex-1 rounded-2xl py-4 px-6 text-white flex items-center gap-4"
          style={{ background: game.gradientCss }}>
          <span className="text-4xl">{game.emoji}</span>
          <div>
            <h1 className="text-xl font-black">{game.title}</h1>
            <p className="text-white text-sm">
              {isAI ? text.mysteryAiSubtitle
                : hasTurns ? text.mysteryTurnSubtitle
                : text.mysterySoloSubtitle}
            </p>
          </div>
        </div>
      </div>

      {/* 시작 */}
      {phase === "start" && (
        <div className="flex flex-col items-center gap-6 rounded-lg border border-border bg-card p-10 text-card-foreground shadow-sm">
          <div className="text-8xl">📦</div>
          {isAI ? (
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black text-foreground">{text.mysteryAiTitle}</h2>
              <p className="text-sm text-muted-foreground">{activityDescription}</p>
              <div className="mt-2 flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 dark:border-indigo-700 dark:bg-indigo-950">
                <span className="text-xl">🤖</span>
                <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200">{text.mysteryAiAlso}</p>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <h2 className="text-2xl font-black text-foreground">{text.mysteryTitle}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {activityDescription}
              </p>
            </div>
          )}
          {hasTurns && !isAI && (
            <div className="flex flex-wrap justify-center gap-2">
              {playersList.map((p, i) => (
                <span key={p} className="rounded-lg bg-muted px-3 py-1 text-xs font-bold text-foreground">{i + 1}. {p}</span>
              ))}
            </div>
          )}
          {aiSetupError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
              {aiSetupError}
            </div>
          )}
          <Button className="w-full py-5 text-xl font-black text-white rounded-2xl"
            style={{ background: "linear-gradient(135deg, #BE185D, #BE123C)" }}
            disabled={aiLoading} onClick={startGame}>
            {aiLoading ? text.aiPickingItem : text.start}
          </Button>
        </div>
      )}

      {/* 게임 */}
      {phase === "playing" && (
        <div className="space-y-4">
          {/* 차례 표시 (AI/친구 모드) */}
          {hasTurns && (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-sm font-bold text-foreground">
              <span>{isAITurn ? "🤖" : "🙋"}</span>
              <span>{text.turnOf(currentPlayer)}</span>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border-2 bg-card p-6 text-card-foreground shadow-sm"
            style={{ borderColor: game.accentColor }}>
            <div className="text-center">
              <div className="text-6xl">📦</div>
              {isAI && <p className="mt-1 text-xs text-muted-foreground">{text.secretItem}</p>}
            </div>
            <div className="text-center">
              <div className="text-4xl font-black text-foreground">
                {remaining}
              </div>
              <p className="text-xs text-muted-foreground">
                {locale === "en" ? "Activities left" : "남은 활동"}
              </p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{qaList.length}</div>
              <p className="text-xs text-muted-foreground">
                {locale === "en" ? "Activities used" : "사용한 활동"}
              </p>
            </div>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-2 rounded-full transition-all"
              style={{ background: game.gradientCss, width: `${(qaList.length / maxActivities) * 100}%` }} />
          </div>

          {qaList.length > 0 && (
            <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-border bg-card p-4 text-card-foreground">
              {qaList.map((qa, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 w-5 flex-shrink-0 text-xs font-medium text-muted-foreground">{i+1}</span>
                  <div className="flex-1 min-w-0">
                    {hasTurns && (
                      <span className={`mr-1 text-xs font-bold ${qa.asker === AI_NAME ? "text-indigo-700 dark:text-indigo-300" : "text-muted-foreground"}`}>
                        {qa.asker}
                      </span>
                    )}
                    <span className="text-sm text-foreground">{qa.question}</span>
                  </div>
                  <span className={`flex-shrink-0 rounded-lg px-2.5 py-0.5 text-sm font-black ${answerClass(String(qa.answer))}`}>
                    {qa.answer}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* AI 생각 중 */}
          {isAITurn && phase === "playing" && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-center dark:border-indigo-700 dark:bg-indigo-950">
              <div className="flex items-center justify-center gap-2 text-indigo-800 dark:text-indigo-200">
                <span className="w-4 h-4 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-bold">{text.aiMakingQuestion}</p>
              </div>
            </div>
          )}

          {/* 사람 차례 입력 */}
          {phase === "playing" && isHumanTurn && !isGuessing && (
            <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
              <textarea
                aria-label={locale === "en" ? "Yes-or-no question" : "예 또는 아니오 질문"}
                maxLength={QUESTION_GAME_LIMITS.question}
                className="h-20 w-full resize-none rounded-lg border-2 border-input bg-background p-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-pink-500"
                placeholder={text.yesNoPlaceholder(hasTurns ? currentPlayer : undefined)}
                value={inputQ}
                disabled={activityPending}
                onChange={(e) => setInputQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); askQuestion(); }}}
              />
              <div className="flex gap-2">
                <Button className="flex-1 rounded-lg font-bold text-white"
                  style={{ background: game.gradientCss, opacity: inputQ.trim() && !aiLoading && !activityPending ? 1 : 0.5 }}
                  disabled={!inputQ.trim() || aiLoading || activityPending} onClick={askQuestion}>
                  {aiLoading || activityPending ? text.answerLoading : text.askQuestion}
                </Button>
                <Button
                  variant="outline"
                  className="rounded-lg px-4 text-sm"
                  disabled={activityPending}
                  onClick={() => {
                    if (!activityLockRef.current) setIsGuessing(true);
                  }}
                >
                  {text.guessAnswer}
                </Button>
              </div>
            </div>
          )}

          {isGuessing && (
            <div className="space-y-3 rounded-lg border-2 bg-card p-5 text-card-foreground" style={{ borderColor: game.accentColor }}>
              <h3 className="font-black text-foreground">🎯 {hasTurns ? `${currentPlayer}, ` : ""}{text.guessPrompt}</h3>
              <input
                aria-label={locale === "en" ? "Answer guess" : "정답 추측"}
                maxLength={QUESTION_GAME_LIMITS.shortWord}
                className="w-full rounded-lg border-2 bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                style={{ borderColor: game.accentColor }}
                placeholder={text.guessInputPlaceholder}
                value={guessInput}
                disabled={activityPending}
                onChange={(e) => setGuessInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") makeGuess(); }}
                autoFocus />
              <div className="flex gap-2">
                <Button className="flex-1 rounded-lg font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #BE185D, #BE123C)" }}
                  disabled={!guessInput.trim() || activityPending} onClick={makeGuess}>
                  {text.submitAnswer}
                </Button>
                <Button variant="outline" className="rounded-lg" disabled={activityPending} onClick={() => { setIsGuessing(false); setGuessInput(""); }}>{text.keepAsking}</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 성공 */}
      {phase === "win" && (
        <div className="flex flex-col items-center gap-5 rounded-lg border border-border bg-card p-10 text-card-foreground shadow-sm">
          <div className="text-8xl animate-bounce">{isAI ? aiItem?.emoji : localItem?.emoji}</div>
          <div className="text-white font-black text-2xl px-8 py-3 rounded-full"
            style={{ background: "linear-gradient(135deg, #047857, #065F46)" }}>{text.correct} 🎉</div>
          <h2 className="text-4xl font-black text-foreground">{itemName}</h2>
          <p className="text-center text-sm text-muted-foreground">
            {hasTurns && winner
              ? text.win(winner)
              : locale === "en"
                ? `Solved in ${qaList.length} activities!`
                : `${qaList.length}회 활동으로 맞혔어요!`}
            {isAI && <><br/><span className="font-bold text-indigo-700 dark:text-indigo-300">{text.beatAi} 🏆</span></>}
          </p>
          <ActivityReview entries={qaList} hasTurns={hasTurns} locale={locale} />
          <Button className="w-full py-4 font-black text-white rounded-xl"
            style={{ background: "linear-gradient(135deg, #BE185D, #BE123C)" }} onClick={startGame}>
            {text.retry}
          </Button>
        </div>
      )}

      {/* 실패 */}
      {phase === "lose" && (
        <div className="flex flex-col items-center gap-5 rounded-lg border border-border bg-card p-10 text-card-foreground shadow-sm">
          <div className="text-8xl">{isAI ? aiItem?.emoji : localItem?.emoji}</div>
          <div className="text-white font-black text-xl px-6 py-2 rounded-full" style={{ background: "#B91C1C" }}>
            {winner === AI_NAME ? text.aiWon : text.close}
          </div>
          <div className="text-center">
            <p className="mb-2 text-sm text-muted-foreground">{text.answerWas}</p>
            <h2 className="text-4xl font-black text-foreground">{itemName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">({isAI ? aiItem?.category : localItem?.hint})</p>
          </div>
          <ActivityReview entries={qaList} hasTurns={hasTurns} locale={locale} />
          <Button className="w-full py-4 font-black text-white rounded-xl"
            style={{ background: "linear-gradient(135deg, #BE185D, #BE123C)" }} onClick={startGame}>
            {text.tryAgain}
          </Button>
        </div>
      )}
    </div>
  );
}

function ActivityReview({
  entries,
  hasTurns,
  locale,
}: {
  entries: QAEntry[];
  hasTurns: boolean;
  locale: string;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="w-full border-y border-border py-4 text-left text-foreground">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black">
          {locale === "en" ? "Activity history" : "활동 기록"}
        </h3>
        <span className="text-xs font-semibold text-muted-foreground">
          {entries.length}{locale === "en" ? " activities" : "개"}
        </span>
      </div>
      <ol className="mt-3 max-h-72 divide-y divide-border overflow-y-auto border-y border-border">
        {entries.map((entry, index) => (
          <li key={index} className="py-3 text-sm">
            <p className="break-words font-bold text-foreground">
              <span className="mr-2 text-pink-700 dark:text-pink-300">{index + 1}.</span>
              {hasTurns ? `${entry.asker} · ` : ""}{entry.question}
            </p>
            <p className="mt-1 break-words pl-6 text-muted-foreground">
              {entry.answer}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

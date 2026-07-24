import {
  CURRENT_MYSTERY_KNOWLEDGE_VERSION,
  MYSTERY_ITEMS,
  classifyMysteryQuestion,
  getMysteryItem,
  isMysteryAnswerEvidence,
  isMysteryGuessCorrect,
  mysteryItemsForVersion,
  resolveMysteryAnswerEvidence,
  type MysteryAnswer,
  type MysteryAnswerResolution,
  type MysteryAnswerEvidence,
  type MysteryFact,
  type MysteryItem,
  type MysteryKnowledgeVersion,
  type MysteryLocale,
} from "@/lib/mystery-box-rules";
import {
  QUESTION_GAME_LIMITS,
  QUESTION_GAME_RULES,
} from "@/lib/question-game-rules";
import { isQuestionFormForLocale } from "@/lib/question-game-i18n";
import type {
  EngineStateBase,
  QuestionGameEngineResult,
  QuestionGameRoomEngine,
  QuestionGameRoomEngineContext,
  QuestionGameRoomLeaveContext,
} from "@/lib/question-game-room-engine";
import type { GameRoom } from "@/lib/question-games-data";

export type MysteryHistoryItem =
  | {
      kind: "question";
      playerId: string;
      playerName: string;
      locale: MysteryLocale;
      question: string;
      answer: MysteryAnswer;
      answerSource?: "ai" | "fallback";
      answerEvidence?: MysteryAnswerEvidence;
      attribute?: MysteryFact;
      negated?: boolean;
    }
  | {
      kind: "guess";
      playerId: string;
      playerName: string;
      locale: MysteryLocale;
      guess: string;
      correct: boolean;
    };

export interface MysteryRoomState extends EngineStateBase {
  game: "mystery-box";
  knowledgeVersion: MysteryKnowledgeVersion;
  phase: "setup" | "play" | "done";
  round: number;
  maxRounds: 20;
  turnOrder: string[];
  currentTurnIdx: number;
  history: MysteryHistoryItem[];
  scores: Record<string, number>;
  winnerId?: string;
  answer?: { ko: string; en: string };
  private?: { itemId: string };
}

export type MysteryPublicRoomState = Pick<
  MysteryRoomState,
  | "stateVersion"
  | "game"
  | "knowledgeVersion"
  | "phase"
  | "recentCommandIds"
  | "roundId"
  | "round"
  | "maxRounds"
  | "turnOrder"
  | "currentTurnIdx"
  | "history"
  | "scores"
  | "winnerId"
  | "answer"
  | "endReason"
> & {
  private?: never;
};

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RECENT_COMMAND_LIMIT = 64;
const MYSTERY_STATE_REQUIRED_KEYS = [
  "stateVersion",
  "game",
  "phase",
  "recentCommandIds",
  "round",
  "maxRounds",
  "turnOrder",
  "currentTurnIdx",
  "history",
  "scores",
] as const;
const MYSTERY_STATE_OPTIONAL_KEYS = [
  "roundId",
  "endReason",
  "winnerId",
  "answer",
  "private",
  "knowledgeVersion",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  ) && keys.every((key) => allowed.has(key));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(
    (item) => typeof item === "string" && item.length > 0,
  );
}

function isScoreMap(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(
    (score) => Number.isInteger(score) && (score as number) >= 0,
  );
}

function isBoundedStoredText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim();
}

function isMysteryHistoryItem(value: unknown): value is MysteryHistoryItem {
  if (
    !isRecord(value) ||
    !isBoundedStoredText(value.playerId, QUESTION_GAME_LIMITS.shortWord) ||
    typeof value.playerName !== "string"
  ) {
    return false;
  }
  if (value.kind === "question") {
    return hasExactKeys(
      value,
      [
        "kind",
        "playerId",
        "playerName",
        "locale",
        "question",
        "answer",
      ],
      ["answerSource", "answerEvidence", "attribute", "negated"],
    ) &&
      (value.locale === "ko" || value.locale === "en") &&
      isBoundedStoredText(value.question, QUESTION_GAME_LIMITS.question) &&
      /[?？]/u.test(value.question) &&
      (value.answer === "yes" ||
        value.answer === "no" ||
        value.answer === "unknown") &&
      (value.answerSource === undefined ||
        value.answerSource === "ai" ||
        (value.answerSource === "fallback" && value.answer === "unknown")) &&
      (value.answerEvidence === undefined ||
        isMysteryAnswerEvidence(
          value.answerEvidence,
          CURRENT_MYSTERY_KNOWLEDGE_VERSION,
        )) &&
      ((value.attribute === undefined && value.negated === undefined) ||
        (typeof value.attribute === "string" && typeof value.negated === "boolean")) &&
      !(value.answerEvidence !== undefined && value.attribute !== undefined);
  }
  return value.kind === "guess" &&
    hasExactKeys(value, [
      "kind",
      "playerId",
      "playerName",
      "locale",
      "guess",
      "correct",
    ]) &&
    (value.locale === "ko" || value.locale === "en") &&
    isBoundedStoredText(value.guess, QUESTION_GAME_LIMITS.shortWord) &&
    typeof value.correct === "boolean";
}

function isLocalizedAnswer(
  value: unknown,
): value is { ko: string; en: string } {
  return isRecord(value) &&
    hasExactKeys(value, ["ko", "en"]) &&
    isBoundedStoredText(value.ko, QUESTION_GAME_LIMITS.shortWord) &&
    isBoundedStoredText(value.en, QUESTION_GAME_LIMITS.shortWord);
}

function hasUniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function isValidPrivateState(
  value: unknown,
): value is { itemId: string } {
  return isRecord(value) &&
    Object.keys(value).length === 1 &&
    typeof value.itemId === "string" &&
    getMysteryItem(value.itemId) !== null;
}

function hasValidScores(state: MysteryRoomState): boolean {
  const questionCounts = new Map<string, number>();
  let questionCount = 0;
  for (const item of state.history) {
    if (item.kind !== "question") continue;
    questionCount += 1;
    questionCounts.set(
      item.playerId,
      (questionCounts.get(item.playerId) ?? 0) + 1,
    );
  }
  if (
    questionCount >
      QUESTION_GAME_RULES["mystery-box"].score.maxValidQuestionsPerRoom
  ) {
    return false;
  }
  const scorePlayerIds = Object.keys(state.scores);
  if (
    scorePlayerIds.length !== state.turnOrder.length ||
    !state.turnOrder.every((playerId) =>
      Object.prototype.hasOwnProperty.call(state.scores, playerId)
    )
  ) {
    return false;
  }
  return Object.entries(state.scores).every(
    ([playerId, score]) => score === (questionCounts.get(playerId) ?? 0),
  );
}

function hasValidTurn(state: MysteryRoomState): boolean {
  return hasUniqueStrings(state.turnOrder) &&
    (state.turnOrder.length === 0
      ? state.currentTurnIdx === 0
      : state.currentTurnIdx < state.turnOrder.length);
}

function hasExpectedAnswer(
  state: MysteryRoomState,
  itemId: string,
): boolean {
  const item = getMysteryItem(itemId);
  return item !== null &&
    state.answer?.ko === item.names.ko &&
    state.answer.en === item.names.en;
}

function hasValidHistorySemantics(state: MysteryRoomState): boolean {
  if (!state.private) return state.history.length === 0;
  const item = getMysteryItem(state.private.itemId);
  if (!item) return false;

  return state.history.every((historyItem) => {
    if (historyItem.kind === "question") {
      if (historyItem.answerSource === "ai") {
        const evidence = historyItem.answerEvidence ?? (
          historyItem.attribute !== undefined && historyItem.negated !== undefined
            ? {
                attribute: historyItem.attribute,
                negated: historyItem.negated,
                confidence: "high" as const,
              }
            : null
        );
        if (!evidence) return state.knowledgeVersion < 3;
        return isMysteryAnswerEvidence(evidence, state.knowledgeVersion) &&
          (state.knowledgeVersion < 4 || "kind" in evidence) &&
          classifyMysteryQuestion(
            historyItem.question,
            item,
            historyItem.locale,
            state.knowledgeVersion,
          ) === "unknown" &&
          resolveMysteryAnswerEvidence(
            item,
            evidence,
            historyItem.question,
            state.knowledgeVersion,
          ) === historyItem.answer;
      }
      if (historyItem.answerSource === "fallback") {
        return historyItem.answer === "unknown";
      }
      return classifyMysteryQuestion(
        historyItem.question,
        item,
        historyItem.locale,
        state.knowledgeVersion,
      ) === historyItem.answer;
    }
    return isMysteryGuessCorrect(
      historyItem.guess,
      item,
      historyItem.locale,
    ) === historyItem.correct;
  });
}

function hasValidPhase(state: MysteryRoomState): boolean {
  const guesses = state.history.filter(
    (item): item is Extract<MysteryHistoryItem, { kind: "guess" }> =>
      item.kind === "guess",
  );
  const correctGuesses = guesses.filter(({ correct }) => correct);
  const lastHistoryItem = state.history.at(-1);
  const activityCount = state.history.length;
  if (activityCount > state.maxRounds || correctGuesses.length > 1) {
    return false;
  }

  if (state.phase === "setup") {
    return state.round === 0 &&
      state.roundId === undefined &&
      state.turnOrder.length === 0 &&
      state.history.length === 0 &&
      Object.keys(state.scores).length === 0 &&
      state.private === undefined &&
      state.winnerId === undefined &&
      state.answer === undefined &&
      state.endReason === undefined;
  }

  if (
    state.phase === "done" &&
    state.endReason === "insufficient-players" &&
    state.round === 0
  ) {
    return state.roundId === undefined &&
      state.turnOrder.length === 0 &&
      state.history.length === 0 &&
      Object.keys(state.scores).length === 0 &&
      state.private === undefined &&
      state.winnerId === undefined &&
      state.answer === undefined;
  }

  if (
    typeof state.roundId !== "string" ||
    !UUID_V4_PATTERN.test(state.roundId) ||
    state.turnOrder.length === 0 ||
    !state.private
  ) {
    return false;
  }
  if (state.phase === "play") {
    return activityCount < state.maxRounds &&
      correctGuesses.length === 0 &&
      state.round === activityCount + 1 &&
      state.winnerId === undefined &&
      state.answer === undefined &&
      state.endReason === undefined;
  }

  if (state.endReason === "insufficient-players") {
    return activityCount < state.maxRounds &&
      correctGuesses.length === 0 &&
      state.round === activityCount + 1 &&
      state.winnerId === undefined &&
      hasExpectedAnswer(state, state.private.itemId);
  }
  if (state.endReason !== "completed" ||
    !hasExpectedAnswer(state, state.private.itemId)) {
    return false;
  }
  const lastGuess = guesses.at(-1);
  if (correctGuesses.length === 1) {
    return activityCount > 0 &&
      state.round === activityCount &&
      lastGuess?.correct === true &&
      lastHistoryItem === lastGuess &&
      state.winnerId === lastGuess.playerId;
  }
  return activityCount === state.maxRounds &&
    state.round === state.maxRounds &&
    state.winnerId === undefined &&
    lastHistoryItem !== undefined;
}

export function readMysteryState(value: unknown): MysteryRoomState | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      MYSTERY_STATE_REQUIRED_KEYS,
      MYSTERY_STATE_OPTIONAL_KEYS,
    ) ||
    value.stateVersion !== 2 ||
    value.game !== "mystery-box" ||
    (value.phase !== "setup" && value.phase !== "play" && value.phase !== "done") ||
    !isStringArray(value.recentCommandIds) ||
    value.recentCommandIds.length > RECENT_COMMAND_LIMIT ||
    !hasUniqueStrings(value.recentCommandIds) ||
    !value.recentCommandIds.every((id) => UUID_V4_PATTERN.test(id)) ||
    !Number.isInteger(value.round) ||
    (value.round as number) < 0 ||
    value.maxRounds !== QUESTION_GAME_RULES["mystery-box"].targets.room.count ||
    !isStringArray(value.turnOrder) ||
    !Number.isInteger(value.currentTurnIdx) ||
    (value.currentTurnIdx as number) < 0 ||
    !Array.isArray(value.history) ||
    !value.history.every(isMysteryHistoryItem) ||
    !isScoreMap(value.scores) ||
    (value.roundId !== undefined &&
      (typeof value.roundId !== "string" ||
        !UUID_V4_PATTERN.test(value.roundId))) ||
    (value.winnerId !== undefined &&
      (typeof value.winnerId !== "string" || value.winnerId.length === 0)) ||
    (value.answer !== undefined && !isLocalizedAnswer(value.answer)) ||
    (value.endReason !== undefined &&
      value.endReason !== "completed" &&
      value.endReason !== "insufficient-players") ||
    (value.private !== undefined && !isValidPrivateState(value.private))
    || (value.knowledgeVersion !== undefined &&
      value.knowledgeVersion !== 1 &&
      value.knowledgeVersion !== 2 &&
      value.knowledgeVersion !== 3 &&
      value.knowledgeVersion !== 4)
  ) {
    return null;
  }
  const state = {
    ...value,
    knowledgeVersion: (value.knowledgeVersion ?? 1) as MysteryKnowledgeVersion,
  } as unknown as MysteryRoomState;
  return hasValidTurn(state) &&
      hasValidScores(state) &&
      hasValidHistorySemantics(state) &&
      hasValidPhase(state)
    ? state
    : null;
}

export function readMysteryPublicState(
  value: unknown,
): MysteryPublicRoomState | null {
  if (
    !isRecord(value) ||
    Object.prototype.hasOwnProperty.call(value, "private")
  ) {
    return null;
  }
  if (value.phase === "setup") {
    return readMysteryState(value) as MysteryPublicRoomState | null;
  }
  if (
    value.phase === "done" &&
    value.endReason === "insufficient-players" &&
    value.round === 0
  ) {
    const candidate: Record<string, unknown> = { ...value, phase: "setup" };
    delete candidate.endReason;
    return readMysteryState(candidate)
      ? value as MysteryPublicRoomState
      : null;
  }

  const publicAnswer = isLocalizedAnswer(value.answer) ? value.answer : null;
  const candidateItems = value.phase === "done" && publicAnswer
    ? MYSTERY_ITEMS.filter(
        ({ names }) =>
          names.ko === publicAnswer.ko && names.en === publicAnswer.en,
      )
    : MYSTERY_ITEMS;
  return candidateItems.some((item) => readMysteryState({
    ...value,
    private: { itemId: item.id },
  }))
    ? value as MysteryPublicRoomState
    : null;
}

function projectMysteryHistoryItem(
  value: unknown,
): MysteryHistoryItem | null {
  if (!isRecord(value)) return null;
  const common = {
    playerId: value.playerId,
    playerName: value.playerName,
    locale: value.locale,
  };
  const candidate = value.kind === "question"
    ? {
        kind: value.kind,
        ...common,
        question: value.question,
        answer: value.answer,
        ...(value.answerSource === "ai" || value.answerSource === "fallback"
          ? { answerSource: value.answerSource }
          : {}),
        ...(isMysteryAnswerEvidence(
          value.answerEvidence,
          CURRENT_MYSTERY_KNOWLEDGE_VERSION,
        )
          ? "kind" in value.answerEvidence
            ? { answerEvidence: value.answerEvidence }
            : {
                attribute: value.answerEvidence.attribute,
                negated: value.answerEvidence.negated,
              }
          : {}),
      }
    : value.kind === "guess"
      ? {
          kind: value.kind,
          ...common,
          guess: value.guess,
          correct: value.correct,
        }
      : null;
  return candidate && isMysteryHistoryItem(candidate) ? candidate : null;
}

function projectLocalizedAnswer(
  value: unknown,
): { ko: string; en: string } | null {
  if (!isRecord(value)) return null;
  const answer = { ko: value.ko, en: value.en };
  return isLocalizedAnswer(answer) ? answer : null;
}

export function toPublicMysteryState(
  value: unknown,
): Record<string, unknown> {
  if (!isRecord(value)) return {};

  const state: Record<string, unknown> = {};
  if (value.stateVersion === 2) state.stateVersion = value.stateVersion;
  if (
    value.knowledgeVersion === 1 ||
    value.knowledgeVersion === 2 ||
    value.knowledgeVersion === 3 ||
    value.knowledgeVersion === 4
  ) {
    state.knowledgeVersion = value.knowledgeVersion;
  }
  if (value.game === "mystery-box") state.game = value.game;
  if (value.phase === "setup" || value.phase === "play" || value.phase === "done") {
    state.phase = value.phase;
  }
  if (
    isStringArray(value.recentCommandIds) &&
    value.recentCommandIds.length <= RECENT_COMMAND_LIMIT
  ) {
    state.recentCommandIds = [...value.recentCommandIds];
  }
  if (typeof value.roundId === "string" && UUID_V4_PATTERN.test(value.roundId)) {
    state.roundId = value.roundId;
  }
  if (Number.isInteger(value.round) && (value.round as number) >= 0) {
    state.round = value.round;
  }
  if (value.maxRounds === QUESTION_GAME_RULES["mystery-box"].targets.room.count) {
    state.maxRounds = value.maxRounds;
  }
  if (isStringArray(value.turnOrder)) state.turnOrder = [...value.turnOrder];
  if (Number.isInteger(value.currentTurnIdx) && (value.currentTurnIdx as number) >= 0) {
    state.currentTurnIdx = value.currentTurnIdx;
  }
  if (Array.isArray(value.history)) {
    state.history = value.history
      .map(projectMysteryHistoryItem)
      .filter((item): item is MysteryHistoryItem => item !== null);
  }
  if (isScoreMap(value.scores)) state.scores = { ...value.scores };
  if (typeof value.winnerId === "string" && value.winnerId.length > 0) {
    state.winnerId = value.winnerId;
  }
  if (
    value.endReason === "completed" ||
    value.endReason === "insufficient-players"
  ) {
    state.endReason = value.endReason;
  }
  if (value.phase === "done") {
    const answer = projectLocalizedAnswer(value.answer);
    if (answer) state.answer = answer;
  }
  return state;
}

function changed(
  context: QuestionGameRoomEngineContext,
  state: MysteryRoomState,
  roomStatus?: "playing" | "ended",
): QuestionGameEngineResult {
  return {
    kind: "changed",
    room: {
      ...context.room,
      ...(roomStatus ? { status: roomStatus } : {}),
      gameState: state,
    },
  };
}

function invalid(
  context: QuestionGameRoomEngineContext,
  message: string,
): QuestionGameEngineResult {
  return { kind: "invalid", room: context.room, message };
}

function readLocale(value: unknown): MysteryLocale | null {
  return value === "ko" || value === "en" ? value : null;
}

function isMysteryAnswerResolution(
  value: unknown,
): value is MysteryAnswerResolution {
  return isRecord(value) &&
    hasExactKeys(value, [
      "itemId",
      "playerId",
      "locale",
      "question",
      "answer",
      "knowledgeVersion",
    ], ["source", "evidence"]) &&
    typeof value.itemId === "string" &&
    typeof value.playerId === "string" &&
    (value.locale === "ko" || value.locale === "en") &&
    typeof value.question === "string" &&
    (value.knowledgeVersion === 1 ||
      value.knowledgeVersion === 2 ||
      value.knowledgeVersion === 3 ||
      value.knowledgeVersion === 4) &&
    (value.evidence === undefined ||
      isMysteryAnswerEvidence(value.evidence, value.knowledgeVersion)) &&
    (value.answer === "yes" ||
      value.answer === "no" ||
      value.answer === "unknown") &&
    (value.source === undefined ||
      value.source === "ai" ||
      (value.source === "fallback" && value.answer === "unknown"));
}

function currentTurnPlayerId(state: MysteryRoomState): string | null {
  return state.turnOrder[state.currentTurnIdx] ?? null;
}

function hasSamePlayerIds(
  playerIds: readonly string[],
  players: GameRoom["players"],
): boolean {
  const activeIds = new Set(players.map(({ id }) => id));
  return activeIds.size === playerIds.length &&
    playerIds.every((playerId) => activeIds.has(playerId));
}

export function createMysteryState(): MysteryRoomState {
  return {
    stateVersion: 2,
    knowledgeVersion: CURRENT_MYSTERY_KNOWLEDGE_VERSION,
    game: "mystery-box",
    phase: "setup",
    recentCommandIds: [],
    round: 0,
    maxRounds: QUESTION_GAME_RULES["mystery-box"].targets.room.count,
    turnOrder: [],
    currentTurnIdx: 0,
    history: [],
    scores: {},
  };
}

export function applyMysteryCommand(
  context: QuestionGameRoomEngineContext,
): QuestionGameEngineResult {
  const state = readMysteryState(context.state);
  if (!state) {
    return {
      kind: "corrupt",
      room: context.room,
      message: "미스터리 박스 상태가 손상되었습니다",
    };
  }
  if (state.round > 0 && !hasSamePlayerIds(state.turnOrder, context.room.players)) {
    return {
      kind: "corrupt",
      room: context.room,
      message: "미스터리 박스 참가자 상태가 손상되었습니다",
    };
  }
  if (context.action === "mystery-start") {
    return startMystery(context, state);
  }
  if (context.action !== "mystery-ask" && context.action !== "mystery-guess") {
    return invalid(context, "지원하지 않는 미스터리 박스 명령입니다");
  }
  if (state.phase !== "play") {
    return {
      kind: "conflict",
      room: context.room,
      message: "미스터리 박스를 진행할 단계가 아닙니다",
    };
  }
  const turnPlayerId = currentTurnPlayerId(state);
  if (!turnPlayerId) {
    return {
      kind: "corrupt",
      room: context.room,
      message: "현재 차례가 올바르지 않습니다",
    };
  }
  if (turnPlayerId !== context.userId) {
    return {
      kind: "forbidden",
      room: context.room,
      message: "현재 차례의 참가자만 질문하거나 추측할 수 있습니다",
    };
  }
  return context.action === "mystery-ask"
    ? askMysteryQuestion(context, state)
    : guessMysteryItem(context, state);
}

function startMystery(
  context: QuestionGameRoomEngineContext,
  state: MysteryRoomState,
): QuestionGameEngineResult {
  if (context.userId !== context.room.hostId) {
    return {
      kind: "forbidden",
      room: context.room,
      message: "방장만 미스터리 박스를 시작할 수 있습니다",
    };
  }
  if (state.phase !== "setup") {
    return {
      kind: "conflict",
      room: context.room,
      message: "미스터리 박스를 시작할 단계가 아닙니다",
    };
  }

  const random = context.random();
  if (!Number.isFinite(random) || random < 0 || random >= 1) {
    return {
      kind: "corrupt",
      room: context.room,
      message: "서버 난수 결과가 올바르지 않습니다",
    };
  }
  const items = mysteryItemsForVersion(state.knowledgeVersion);
  const item = items[Math.floor(random * items.length)];
  if (!item) {
    return {
      kind: "corrupt",
      room: context.room,
      message: "미스터리 물건을 고를 수 없습니다",
    };
  }

  return changed(context, {
    ...state,
    phase: "play",
    roundId: context.randomUUID(),
    round: 1,
    turnOrder: context.room.players.map(({ id }) => id),
    currentTurnIdx: 0,
    scores: Object.fromEntries(
      context.room.players.map(({ id }) => [id, 0]),
    ),
    private: { itemId: item.id },
  });
}

function finishOrAdvanceMysteryActivity(
  context: QuestionGameRoomEngineContext,
  state: MysteryRoomState,
  item: MysteryItem,
  history: MysteryHistoryItem[],
  scores: Record<string, number> = state.scores,
): QuestionGameEngineResult {
  const activityCount = history.length;
  const currentTurnIdx =
    (state.currentTurnIdx + 1) % state.turnOrder.length;
  if (activityCount >= state.maxRounds) {
    return changed(
      context,
      {
        ...state,
        phase: "done",
        endReason: "completed",
        round: state.maxRounds,
        currentTurnIdx,
        history,
        scores,
        answer: { ...item.names },
      },
      "ended",
    );
  }
  return changed(context, {
    ...state,
    roundId: context.randomUUID(),
    round: activityCount + 1,
    currentTurnIdx,
    history,
    scores,
  });
}

function askMysteryQuestion(
  context: QuestionGameRoomEngineContext,
  state: MysteryRoomState,
): QuestionGameEngineResult {
  const locale = readLocale(context.body.locale);
  if (!locale) return invalid(context, "질문 언어가 올바르지 않습니다");
  if (typeof context.body.question !== "string") {
    return invalid(context, "질문이 올바르지 않습니다");
  }
  const question = context.body.question.trim();
  if (
    question.length === 0 ||
    question.length > QUESTION_GAME_LIMITS.question ||
    !/[?？]/u.test(question) ||
    !isQuestionFormForLocale(question, locale)
  ) {
    return invalid(context, "물음표가 있는 질문을 이백 자 이내로 써 주세요");
  }
  const maxQuestions =
    QUESTION_GAME_RULES["mystery-box"].score.maxValidQuestionsPerRoom;
  const questionCount = state.history.filter(
    ({ kind }) => kind === "question",
  ).length;
  if (questionCount >= maxQuestions) {
    return invalid(context, "질문 수 상한을 모두 사용했습니다");
  }
  const item = state.private ? getMysteryItem(state.private.itemId) : null;
  const score = state.scores[context.userId];
  if (!item || !Number.isInteger(score) || score < 0) {
    return {
      kind: "corrupt",
      room: context.room,
      message: "미스터리 박스 비공개 상태가 손상되었습니다",
    };
  }

  const ruleAnswer = classifyMysteryQuestion(
    question,
    item,
    locale,
    state.knowledgeVersion,
  );
  const resolution = context.mysteryAnswerResolution;
  let answer = ruleAnswer;
  let answerSource: "ai" | "fallback" | undefined;
  if (ruleAnswer === "unknown") {
    if (!(
      isMysteryAnswerResolution(resolution) &&
      resolution.itemId === item.id &&
      resolution.playerId === context.userId &&
      resolution.locale === locale &&
      resolution.question === question &&
      resolution.knowledgeVersion === state.knowledgeVersion
    )) {
      return {
        kind: "resolution-required",
        room: context.room,
        resolution: {
          itemId: item.id,
          playerId: context.userId,
          locale,
          question,
          knowledgeVersion: state.knowledgeVersion,
        },
        message: "미스터리 박스 질문 답변 해결이 필요합니다",
      };
    }
    if (
      state.knowledgeVersion >= 3 &&
      resolution.source !== "fallback" &&
      (!resolution.evidence ||
        (state.knowledgeVersion >= 4 && !("kind" in resolution.evidence)) ||
        resolveMysteryAnswerEvidence(
          item,
          resolution.evidence,
          question,
          state.knowledgeVersion,
        ) !== resolution.answer)
    ) {
      return {
        kind: "resolution-required",
        room: context.room,
        resolution: {
          itemId: item.id,
          playerId: context.userId,
          locale,
          question,
          knowledgeVersion: state.knowledgeVersion,
        },
        message: "미스터리 박스 질문 답변 해결이 필요합니다",
      };
    }
    answer = resolution.answer;
    answerSource = resolution.source ?? "ai";
  }

  return finishOrAdvanceMysteryActivity(
    context,
    state,
    item,
    [
      ...state.history,
      {
        kind: "question",
        playerId: context.userId,
        playerName: context.userName,
        locale,
        question,
        answer,
        ...(answerSource ? { answerSource } : {}),
        ...(resolution?.evidence
          ? { answerEvidence: resolution.evidence }
          : {}),
      },
    ],
    { ...state.scores, [context.userId]: score + 1 },
  );
}

function guessMysteryItem(
  context: QuestionGameRoomEngineContext,
  state: MysteryRoomState,
): QuestionGameEngineResult {
  const locale = readLocale(context.body.locale);
  if (!locale) return invalid(context, "추측 언어가 올바르지 않습니다");
  if (typeof context.body.guess !== "string") {
    return invalid(context, "추측이 올바르지 않습니다");
  }
  const guess = context.body.guess.trim();
  if (guess.length === 0 || guess.length > QUESTION_GAME_LIMITS.shortWord) {
    return invalid(context, "추측을 팔십 자 이내로 써 주세요");
  }
  const item = state.private ? getMysteryItem(state.private.itemId) : null;
  if (!item) {
    return {
      kind: "corrupt",
      room: context.room,
      message: "미스터리 박스 비공개 상태가 손상되었습니다",
    };
  }
  const activityCount = state.history.length;
  if (activityCount >= state.maxRounds) {
    return {
      kind: "conflict",
      room: context.room,
      message: "최대 활동을 모두 사용했습니다",
    };
  }
  const nextActivityCount = activityCount + 1;
  if (isMysteryGuessCorrect(guess, item, locale)) {
    return changed(
      context,
      {
        ...state,
        phase: "done",
        endReason: "completed",
        round: nextActivityCount,
        history: [
          ...state.history,
          {
            kind: "guess",
            playerId: context.userId,
            playerName: context.userName,
            locale,
            guess,
            correct: true,
          },
        ],
        winnerId: context.userId,
        answer: { ...item.names },
      },
      "ended",
    );
  }
  return finishOrAdvanceMysteryActivity(
    context,
    state,
    item,
    [
      ...state.history,
      {
        kind: "guess",
        playerId: context.userId,
        playerName: context.userName,
        locale,
        guess,
        correct: false,
      },
    ],
  );
}

function readMysteryStateForLeave(
  context: QuestionGameRoomLeaveContext,
): MysteryRoomState | null {
  const direct = readMysteryState(context.room.gameState);
  if (direct?.round === 0) return direct;
  if (
    !isRecord(context.room.gameState) ||
    !isScoreMap(context.room.gameState.scores) ||
    !isStringArray(context.room.gameState.turnOrder) ||
    context.wasInTurnOrderExactlyOnce !== true
  ) {
    return null;
  }

  const scorePlayerIds = Object.keys(context.room.gameState.scores);
  const expectedPlayerIds = [
    ...context.room.players.map(({ id }) => id),
    context.userId,
  ];
  const expectedPlayerSet = new Set(expectedPlayerIds);
  const remainingScorePlayerIds = scorePlayerIds.filter(
    (playerId) => playerId !== context.userId,
  );
  const remainingScorePlayerSet = new Set(remainingScorePlayerIds);
  if (
    scorePlayerIds.length === 0 ||
    expectedPlayerSet.size !== scorePlayerIds.length ||
    !scorePlayerIds.every((playerId) => expectedPlayerSet.has(playerId)) ||
    context.room.gameState.turnOrder.length !== scorePlayerIds.length - 1 ||
    !hasUniqueStrings(context.room.gameState.turnOrder) ||
    !context.room.gameState.turnOrder.every((playerId) =>
      playerId !== context.userId &&
      remainingScorePlayerSet.has(playerId)
    )
  ) {
    return null;
  }

  const restoredTurnState: Record<string, unknown> = {
    ...context.room.gameState,
    turnOrder: scorePlayerIds,
    currentTurnIdx: 0,
  };
  const restored = readMysteryState(restoredTurnState);
  if (restored) return restored;
  if (
    restoredTurnState.phase !== "done" ||
    restoredTurnState.endReason !== "insufficient-players"
  ) {
    return null;
  }

  const playingCandidate: Record<string, unknown> = {
    ...restoredTurnState,
    phase: "play",
  };
  delete playingCandidate.endReason;
  delete playingCandidate.answer;
  return readMysteryState(playingCandidate);
}

function mysteryPlayerLeft(
  context: QuestionGameRoomLeaveContext,
): GameRoom {
  const commonInterruptedByDeparture =
    isRecord(context.room.gameState) &&
    context.room.gameState.phase === "done" &&
    context.room.gameState.endReason === "insufficient-players";
  const state = readMysteryStateForLeave(context);
  if (!state) throw new Error("corrupt mystery state");

  const activeIds = new Set(context.room.players.map(({ id }) => id));
  const scores = Object.fromEntries(
    Object.entries(state.scores).filter(([id]) => activeIds.has(id)),
  );
  const adjustedTurnOrder = isStringArray(context.room.gameState.turnOrder)
    ? context.room.gameState.turnOrder
    : state.turnOrder.filter((playerId) => activeIds.has(playerId));
  const adjustedTurnIdx = Number.isInteger(
      context.room.gameState.currentTurnIdx,
    ) && (context.room.gameState.currentTurnIdx as number) >= 0
    ? context.room.gameState.currentTurnIdx as number
    : 0;
  const item = state.private ? getMysteryItem(state.private.itemId) : null;
  const interruptedByDeparture = commonInterruptedByDeparture ||
    (state.phase === "play" && activeIds.size < 2);
  const revealAnswer = interruptedByDeparture && item;

  return {
    ...context.room,
    gameState: {
      ...state,
      turnOrder: adjustedTurnOrder,
      currentTurnIdx: adjustedTurnIdx,
      scores,
      ...(interruptedByDeparture
        ? { phase: "done", endReason: "insufficient-players" }
        : {}),
      ...(revealAnswer ? { answer: { ...revealAnswer.names } } : {}),
    },
  };
}

export const mysteryQuestionGameRoomEngine: QuestionGameRoomEngine = {
  createInitialState: createMysteryState,
  applyCommand: applyMysteryCommand,
  onPlayerLeave: mysteryPlayerLeft,
};

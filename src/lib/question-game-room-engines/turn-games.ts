import { checkProfanity } from "@/lib/profanity";
import {
  getKabaSentencePairs,
  isQuestionFormForLocale,
  type LocalizedText,
} from "@/lib/question-game-i18n";
import {
  QUESTION_GAME_LIMITS,
  QUESTION_GAME_RULES,
} from "@/lib/question-game-rules";
import {
  STORY_DICE_FALLBACK,
  STORY_DICE_FALLBACK_EN,
  type DiceCategory,
} from "@/lib/story-dice-data";
import type {
  EngineStateBase,
  QuestionGameEngineResult,
  QuestionGameRoomEngine,
  QuestionGameRoomEngineContext,
  QuestionGameRoomLeaveContext,
} from "@/lib/question-game-room-engine";
import type {
  GameRoom,
  RoomChainItem,
  RoomPlayer,
} from "@/lib/question-games-data";

type QuestionLocale = "ko" | "en";
type TurnGameId = "story-dice" | "dice" | "relay" | "kaba";

const PLAYER_LIMITS_BY_GAME = {
  "story-dice": QUESTION_GAME_RULES["story-dice"].multiplayer,
  dice: QUESTION_GAME_RULES.dice.multiplayer,
  relay: QUESTION_GAME_RULES.relay.multiplayer,
  kaba: QUESTION_GAME_RULES.kaba.multiplayer,
} as const;
const STORY_MAX_ROUNDS = QUESTION_GAME_RULES["story-dice"].targets.room.count;
const DICE_MAX_ROUNDS = QUESTION_GAME_RULES.dice.targets.room.count;
const RELAY_MAX_ROUNDS = QUESTION_GAME_RULES.relay.targets.room.count;
const KABA_MAX_ROUNDS = QUESTION_GAME_RULES.kaba.targets.room.count;
const STORY_MIN_QUESTIONERS = PLAYER_LIMITS_BY_GAME["story-dice"].min - 1;

export interface TurnGamePlayer {
  id: string;
  name: string;
}

interface RoundRecordBase {
  roundId: string;
  round: number;
  playerId: string;
  playerName: string;
}

export interface StoryDiceWordPool {
  protagonist: string[];
  place: string[];
  event: string[];
  wordText: Record<string, LocalizedText>;
}

export interface StoryDiceRolledWords {
  protagonist: string;
  place: string;
  event: string;
}

export interface StoryDiceStoryRecord extends RoundRecordBase {
  story: string;
}

export interface StoryDiceQuestionRecord extends RoundRecordBase {
  locale: QuestionLocale;
  question: string;
}

export interface StoryDicePair extends StoryDiceQuestionRecord {
  taggerId: string;
  taggerName: string;
  answer: string;
}

export interface StoryDiceRoomState extends EngineStateBase {
  game: "story-dice";
  phase: "setup" | "roll" | "story" | "question" | "answer" | "done";
  round: number;
  maxRounds: typeof STORY_MAX_ROUNDS;
  completedRounds: number;
  players: TurnGamePlayer[];
  playerNames: Record<string, string>;
  taggerId: string;
  words: StoryDiceWordPool;
  rolledWords: StoryDiceRolledWords | null;
  roundPlayerIds: string[];
  roundTargetPlayerIds: string[];
  roundSubmittedPlayerIds: string[];
  turnOrder: string[];
  currentTurnIdx: number;
  story: StoryDiceStoryRecord | null;
  pendingQuestion: StoryDiceQuestionRecord | null;
  pairs: StoryDicePair[];
}

export interface DiceQuestionRecord extends RoundRecordBase {
  locale: QuestionLocale;
  question: string;
  face: number;
}

export interface DiceRoomState extends EngineStateBase {
  game: "dice";
  phase: "roll" | "question" | "done";
  round: number;
  maxRounds: typeof DICE_MAX_ROUNDS;
  completedRounds: number;
  players: TurnGamePlayer[];
  playerNames: Record<string, string>;
  roundPlayerIds: string[];
  roundTargetPlayerIds: string[];
  roundSubmittedPlayerIds: string[];
  turnOrder: string[];
  currentTurnIdx: number;
  currentFace: number | null;
  questions: DiceQuestionRecord[];
}

export interface RelayQuestionRecord extends RoundRecordBase {
  locale: QuestionLocale;
  question: string;
}

export interface RelayRoomState extends EngineStateBase {
  game: "relay";
  phase: "setup" | "question" | "done";
  round: number;
  maxRounds: typeof RELAY_MAX_ROUNDS;
  completedRounds: number;
  players: TurnGamePlayer[];
  playerNames: Record<string, string>;
  topic: string;
  roundPlayerIds: string[];
  roundTargetPlayerIds: string[];
  roundSubmittedPlayerIds: string[];
  turnOrder: string[];
  currentTurnIdx: number;
  questions: RelayQuestionRecord[];
}

export interface KabaSentencePlanItem {
  key: string;
  text: LocalizedText;
}

export interface KabaAttemptRecord extends RoundRecordBase {
  sentenceKey: string;
  sentence: LocalizedText;
  locale: QuestionLocale;
  question: string;
  correct: boolean;
}

export interface KabaRoomState extends EngineStateBase {
  game: "kaba";
  phase: "setup" | "question" | "done";
  round: number;
  maxRounds: typeof KABA_MAX_ROUNDS;
  completedRounds: number;
  players: TurnGamePlayer[];
  playerNames: Record<string, string>;
  sentencePlan: KabaSentencePlanItem[];
  roundPlayerIds: string[];
  roundTargetPlayerIds: string[];
  roundSubmittedPlayerIds: string[];
  turnOrder: string[];
  currentTurnIdx: number;
  attempts: KabaAttemptRecord[];
  scores: Record<string, number>;
}

type SharedRoundState = DiceRoomState | RelayRoomState | KabaRoomState;
type TurnGameState = StoryDiceRoomState | SharedRoundState;

const RECENT_COMMAND_LIMIT = 64;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ACTION_OPTIONAL_KEYS = ["action"] as const;
const COMMON_BODY_KEYS = [
  "commandId",
  "expectedCreatedAt",
  "expectedVersion",
  "playId",
] as const;
const COMMON_ROUND_BODY_KEYS = [...COMMON_BODY_KEYS, "roundId"] as const;
const PLAYER_KEYS = ["id", "name"] as const;
const LOCALIZED_TEXT_KEYS = ["ko", "en"] as const;
const STORY_WORD_KEYS = ["protagonist", "place", "event"] as const;
const BASE_ROUND_KEYS = [
  "stateVersion",
  "game",
  "phase",
  "recentCommandIds",
  "round",
  "maxRounds",
  "completedRounds",
  "players",
  "playerNames",
  "roundPlayerIds",
  "roundTargetPlayerIds",
  "roundSubmittedPlayerIds",
  "turnOrder",
  "currentTurnIdx",
] as const;
const STATE_OPTIONAL_KEYS = ["roundId", "endReason"] as const;

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
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => allowed.has(key));
}

function hasExactActionBody(
  context: QuestionGameRoomEngineContext,
  required: readonly string[],
): boolean {
  return hasExactKeys(context.body, required, ACTION_OPTIONAL_KEYS) &&
    (context.body.action === undefined || context.body.action === context.action);
}

function isDenseArray<T = unknown>(value: unknown): value is T[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

function isIntegerBetween(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

function isUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function isStoredText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= maxLength && value === value.trim();
}

function isPlayerId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

function isPlayerName(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200;
}

function isStringArray(value: unknown): value is string[] {
  return isDenseArray(value) && value.every(isPlayerId) && isUnique(value);
}

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameValueSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && new Set(left).size === left.length &&
    left.every((value) => right.includes(value));
}

function normalizedQuestion(question: string): string {
  return question.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function hasDuplicateQuestions(questions: readonly string[]): boolean {
  const normalized = questions.map(normalizedQuestion);
  return new Set(normalized).size !== normalized.length;
}

function isLocale(value: unknown): value is QuestionLocale {
  return value === "ko" || value === "en";
}

function isQuestion(value: unknown, locale: unknown): value is string {
  return isLocale(locale) &&
    isStoredText(value, QUESTION_GAME_LIMITS.question) &&
    isQuestionFormForLocale(value, locale) &&
    !checkProfanity(value).flagged;
}

function isLocalizedText(value: unknown): value is LocalizedText {
  return isRecord(value) && hasExactKeys(value, LOCALIZED_TEXT_KEYS) &&
    isStoredText(value.ko, QUESTION_GAME_LIMITS.story) &&
    isStoredText(value.en, QUESTION_GAME_LIMITS.story);
}

function isTurnPlayer(value: unknown): value is TurnGamePlayer {
  return isRecord(value) && hasExactKeys(value, PLAYER_KEYS) &&
    isPlayerId(value.id) && isPlayerName(value.name);
}

function readPlayers(
  playersValue: unknown,
  namesValue: unknown,
  game: TurnGameId,
): TurnGamePlayer[] | null {
  const { min, max } = PLAYER_LIMITS_BY_GAME[game];
  if (!isDenseArray(playersValue) ||
    playersValue.length < min ||
    playersValue.length > max ||
    !playersValue.every(isTurnPlayer)) {
    return null;
  }
  const players = playersValue as TurnGamePlayer[];
  if (!isUnique(players.map(({ id }) => id)) || !isRecord(namesValue)) return null;
  const ids = players.map(({ id }) => id);
  if (!hasExactKeys(namesValue, ids)) return null;
  if (!players.every(({ id, name }) => namesValue[id] === name)) return null;
  return players;
}

function playersFromRoom(
  players: readonly RoomPlayer[],
  game: TurnGameId,
): TurnGamePlayer[] {
  const { min, max } = PLAYER_LIMITS_BY_GAME[game];
  if (players.length < min || players.length > max ||
    !isUnique(players.map(({ id }) => id)) ||
    !players.every(({ id, name }) => isPlayerId(id) && isPlayerName(name))) {
    throw new Error("invalid room players");
  }
  return players.map(({ id, name }) => ({ id, name }));
}

function namesForPlayers(players: readonly TurnGamePlayer[]): Record<string, string> {
  return Object.fromEntries(players.map(({ id, name }) => [id, name]));
}

function currentPendingIndex(
  turnOrder: readonly string[],
  submitted: readonly string[],
): number {
  const index = turnOrder.findIndex((playerId) => !submitted.includes(playerId));
  return index < 0 ? 0 : index;
}

function currentPlayerId(state: Pick<TurnGameState, "turnOrder" | "currentTurnIdx">): string | null {
  return state.turnOrder[state.currentTurnIdx] ?? null;
}

function isValidBaseRoundState(
  value: Record<string, unknown>,
  game: TurnGameId,
  maxRounds: number,
  allowedPhases: readonly string[],
  minActiveTargets: number,
): boolean {
  const players = readPlayers(value.players, value.playerNames, game);
  if (
    value.stateVersion !== 2 || value.game !== game ||
    typeof value.phase !== "string" || !allowedPhases.includes(value.phase) ||
    !isDenseArray(value.recentCommandIds) ||
    value.recentCommandIds.length > RECENT_COMMAND_LIMIT ||
    !value.recentCommandIds.every(isUuid) ||
    !isUnique(value.recentCommandIds) ||
    !isIntegerBetween(value.round, 0, maxRounds) ||
    value.maxRounds !== maxRounds ||
    !isIntegerBetween(value.completedRounds, 0, maxRounds) ||
    !players ||
    !isStringArray(value.roundPlayerIds) ||
    !isStringArray(value.roundTargetPlayerIds) ||
    !isStringArray(value.roundSubmittedPlayerIds) ||
    !isStringArray(value.turnOrder) ||
    !Number.isInteger(value.currentTurnIdx) || (value.currentTurnIdx as number) < 0 ||
    (value.roundId !== undefined && !isUuid(value.roundId)) ||
    (value.endReason !== undefined && value.endReason !== "completed" &&
      value.endReason !== "host" && value.endReason !== "insufficient-players")
  ) {
    return false;
  }

  const state = value as unknown as Pick<TurnGameState,
    "round" | "completedRounds" | "roundId" | "roundPlayerIds" |
    "roundTargetPlayerIds" | "roundSubmittedPlayerIds" | "turnOrder" |
    "currentTurnIdx" | "phase" | "endReason">;
  const playerIds = players.map(({ id }) => id);
  if (!state.roundPlayerIds.every((id) => playerIds.includes(id)) ||
    !state.roundTargetPlayerIds.every((id) => state.roundPlayerIds.includes(id)) ||
    !state.roundSubmittedPlayerIds.every((id) => state.roundTargetPlayerIds.includes(id)) ||
    !sameOrderedValues(state.turnOrder, state.roundTargetPlayerIds) ||
    (state.turnOrder.length === 0
      ? state.currentTurnIdx !== 0
      : state.currentTurnIdx >= state.turnOrder.length)) {
    return false;
  }

  if (state.round === 0) {
    return state.roundId === undefined && state.completedRounds === 0 &&
      state.roundPlayerIds.length === 0 && state.roundTargetPlayerIds.length === 0 &&
      state.roundSubmittedPlayerIds.length === 0 && state.turnOrder.length === 0 &&
      (state.endReason === undefined || state.endReason === "insufficient-players");
  }
  if (!state.roundId || state.completedRounds > state.round) return false;

  const allSubmitted = state.roundTargetPlayerIds.length > 0 &&
    state.roundTargetPlayerIds.every((id) => state.roundSubmittedPlayerIds.includes(id));
  if (state.phase !== "done") {
    return state.endReason === undefined &&
      state.completedRounds === state.round - 1 &&
      state.roundTargetPlayerIds.length >= minActiveTargets &&
      !allSubmitted &&
      state.currentTurnIdx === currentPendingIndex(
        state.turnOrder,
        state.roundSubmittedPlayerIds,
      );
  }
  if (state.endReason === "completed") {
    return state.round === maxRounds && state.completedRounds === maxRounds && allSubmitted;
  }
  if (state.endReason === "host") {
    return state.completedRounds >= 1 && state.completedRounds === state.round - 1;
  }
  return state.endReason === "insufficient-players" &&
    state.completedRounds === state.round - 1 &&
    state.roundTargetPlayerIds.length <= 1;
}

function hasValidRecordRounds<T extends RoundRecordBase>(
  state: Pick<TurnGameState,
    "round" | "roundId" | "roundSubmittedPlayerIds" | "completedRounds" |
    "roundTargetPlayerIds" | "playerNames">,
  records: readonly T[],
  minCompletedRecords: number,
): boolean {
  const roundIds = new Map<number, string>();
  const idRounds = new Map<string, number>();
  const recordKeys = new Set<string>();
  const roundCounts = new Map<number, number>();
  const currentPlayerIds: string[] = [];

  for (const record of records) {
    if (!isIntegerBetween(record.round, 1, state.round) ||
      !isUuid(record.roundId) ||
      state.playerNames[record.playerId] !== record.playerName) {
      return false;
    }
    if (record.round < state.round && record.roundId === state.roundId) return false;
    const key = `${record.round}\u0000${record.playerId}`;
    if (recordKeys.has(key)) return false;
    recordKeys.add(key);
    const knownId = roundIds.get(record.round);
    const knownRound = idRounds.get(record.roundId);
    if ((knownId !== undefined && knownId !== record.roundId) ||
      (knownRound !== undefined && knownRound !== record.round)) {
      return false;
    }
    roundIds.set(record.round, record.roundId);
    idRounds.set(record.roundId, record.round);
    roundCounts.set(record.round, (roundCounts.get(record.round) ?? 0) + 1);
    if (record.round === state.round) {
      if (record.roundId !== state.roundId) return false;
      currentPlayerIds.push(record.playerId);
    }
  }
  const activeCurrentPlayerIds = currentPlayerIds.filter((playerId) =>
    state.roundTargetPlayerIds.includes(playerId));
  if (!sameValueSet(activeCurrentPlayerIds, state.roundSubmittedPlayerIds)) return false;
  for (let round = 1; round <= state.completedRounds; round += 1) {
    if ((roundCounts.get(round) ?? 0) < minCompletedRecords) return false;
    if (!state.roundTargetPlayerIds.every((playerId) =>
      records.some((record) => record.round === round && record.playerId === playerId))) {
      return false;
    }
  }
  return true;
}

function isStoryWordPool(value: unknown): value is StoryDiceWordPool {
  if (!isRecord(value) || !hasExactKeys(value, [...STORY_WORD_KEYS, "wordText"]) ||
    !isRecord(value.wordText)) return false;
  const wordText = value.wordText;
  const validWords = STORY_WORD_KEYS.every((category) =>
    isDenseArray(value[category]) && value[category].length === 8 &&
    value[category].every((word) => isStoredText(word, QUESTION_GAME_LIMITS.generatedWord)) &&
    isUnique(value[category] as string[]) &&
    (value[category] as string[]).every((word) =>
      (STORY_DICE_FALLBACK[category] as readonly string[]).includes(word)
    )
  );
  if (!validWords) return false;
  const words = STORY_WORD_KEYS.flatMap((category) => value[category] as string[]);
  return hasExactKeys(wordText, words) && words.every((word) => {
    const localized = wordText[word];
    if (!isLocalizedText(localized) || localized.ko !== word) return false;
    for (const category of STORY_WORD_KEYS) {
      const index = (STORY_DICE_FALLBACK[category] as readonly string[]).indexOf(word);
      if (index >= 0) return localized.en === STORY_DICE_FALLBACK_EN[category][index];
    }
    return false;
  });
}

function isRolledWords(value: unknown, words: StoryDiceWordPool): value is StoryDiceRolledWords {
  return isRecord(value) && hasExactKeys(value, STORY_WORD_KEYS) &&
    STORY_WORD_KEYS.every((category) =>
      typeof value[category] === "string" && words[category].includes(value[category] as string)
    );
}

function isStoryRecord(value: unknown): value is StoryDiceStoryRecord {
  return isRecord(value) && hasExactKeys(value, [
    "roundId", "round", "playerId", "playerName", "story",
  ]) && isUuid(value.roundId) && isIntegerBetween(value.round, 1, STORY_MAX_ROUNDS) &&
    isPlayerId(value.playerId) && isPlayerName(value.playerName) &&
    isStoredText(value.story, QUESTION_GAME_LIMITS.story) &&
    !checkProfanity(value.story).flagged;
}

function isStoryQuestion(value: unknown): value is StoryDiceQuestionRecord {
  return isRecord(value) && hasExactKeys(value, [
    "roundId", "round", "playerId", "playerName", "locale", "question",
  ]) && isUuid(value.roundId) && isIntegerBetween(value.round, 1, STORY_MAX_ROUNDS) &&
    isPlayerId(value.playerId) && isPlayerName(value.playerName) &&
    isQuestion(value.question, value.locale);
}

function isStoryPair(value: unknown): value is StoryDicePair {
  return isRecord(value) && hasExactKeys(value, [
    "roundId", "round", "playerId", "playerName", "locale", "question",
    "taggerId", "taggerName", "answer",
  ]) && isUuid(value.roundId) && isIntegerBetween(value.round, 1, STORY_MAX_ROUNDS) &&
    isPlayerId(value.playerId) && isPlayerName(value.playerName) &&
    isQuestion(value.question, value.locale) &&
    isPlayerId(value.taggerId) && isPlayerName(value.taggerName) &&
    isStoredText(value.answer, QUESTION_GAME_LIMITS.answer) &&
    !checkProfanity(value.answer).flagged;
}

function readStoryDiceStateUnchecked(value: unknown): StoryDiceRoomState | null {
  const required = [
    ...BASE_ROUND_KEYS,
    "taggerId", "words", "rolledWords", "story", "pendingQuestion", "pairs",
  ];
  if (!isRecord(value) || !hasExactKeys(value, required, STATE_OPTIONAL_KEYS) ||
    !isValidBaseRoundState(value, "story-dice", STORY_MAX_ROUNDS,
      ["setup", "roll", "story", "question", "answer", "done"],
      STORY_MIN_QUESTIONERS) ||
    typeof value.taggerId !== "string" ||
    !isStoryWordPool(value.words) ||
    (value.rolledWords !== null && !isRolledWords(value.rolledWords, value.words)) ||
    (value.story !== null && !isStoryRecord(value.story)) ||
    (value.pendingQuestion !== null && !isStoryQuestion(value.pendingQuestion)) ||
    !isDenseArray(value.pairs) || !value.pairs.every(isStoryPair)) {
    return null;
  }
  const state = value as unknown as StoryDiceRoomState;
  const playerIds = state.players.map(({ id }) => id);
  if (hasDuplicateQuestions(state.pairs.map(({ question }) => question)) ||
    !state.pairs.every((pair) =>
      state.playerNames[pair.playerId] === pair.playerName &&
      state.playerNames[pair.taggerId] === pair.taggerName) ||
    !hasValidRecordRounds(state, state.pairs, STORY_MIN_QUESTIONERS)) {
    return null;
  }
  if (state.pendingQuestion &&
    (state.playerNames[state.pendingQuestion.playerId] !== state.pendingQuestion.playerName ||
      state.pendingQuestion.round !== state.round ||
      state.pendingQuestion.roundId !== state.roundId ||
      state.roundSubmittedPlayerIds.includes(state.pendingQuestion.playerId) ||
      state.pendingQuestion.playerId !== currentPlayerId(state) ||
      state.pairs.some(({ question }) =>
        normalizedQuestion(question) === normalizedQuestion(state.pendingQuestion!.question)))) {
    return null;
  }
  if (state.round === 0) {
    const emptySetup = state.taggerId === "" &&
      state.words.protagonist.length === 8 && state.rolledWords === null &&
      state.story === null && state.pendingQuestion === null && state.pairs.length === 0;
    return emptySetup &&
      (state.phase === "setup" ||
        (state.phase === "done" && state.endReason === "insufficient-players"))
      ? state
      : null;
  }
  if (!playerIds.includes(state.taggerId) ||
    state.roundTargetPlayerIds.includes(state.taggerId) ||
    !state.story && state.round > 1) {
    return null;
  }
  if (state.story &&
    (state.playerNames[state.story.playerId] !== state.story.playerName ||
      state.story.round !== 1)) {
    return null;
  }
  const firstRoundId = state.pairs.find(({ round }) => round === 1)?.roundId ??
    (state.round === 1 ? state.roundId : undefined);
  if (state.story && firstRoundId && state.story.roundId !== firstRoundId) return null;
  const validPhase =
    (state.phase === "roll" && state.rolledWords === null && state.story === null &&
      state.pendingQuestion === null && state.round === 1) ||
    (state.phase === "story" && state.rolledWords !== null && state.story === null &&
      state.pendingQuestion === null && state.round === 1) ||
    (state.phase === "question" && state.rolledWords !== null && state.story !== null &&
      state.pendingQuestion === null) ||
    (state.phase === "answer" && state.rolledWords !== null && state.story !== null &&
      state.pendingQuestion !== null) ||
    (state.phase === "done" && state.pendingQuestion === null &&
      (state.endReason === "insufficient-players" ||
        (state.rolledWords !== null && state.story !== null)));
  return validPhase ? state : null;
}

export function readStoryDiceState(value: unknown): StoryDiceRoomState | null {
  try {
    return readStoryDiceStateUnchecked(value);
  } catch {
    return null;
  }
}

export function readStoryDicePublicState(value: unknown): StoryDiceRoomState | null {
  return readStoryDiceState(value);
}

function isDiceQuestion(value: unknown): value is DiceQuestionRecord {
  return isRecord(value) && hasExactKeys(value, [
    "roundId", "round", "playerId", "playerName", "locale", "question", "face",
  ]) && isUuid(value.roundId) && isIntegerBetween(value.round, 1, DICE_MAX_ROUNDS) &&
    isPlayerId(value.playerId) && isPlayerName(value.playerName) &&
    isQuestion(value.question, value.locale) && isIntegerBetween(value.face, 1, 6);
}

function readDiceStateUnchecked(value: unknown): DiceRoomState | null {
  if (!isRecord(value) || !hasExactKeys(value,
    [...BASE_ROUND_KEYS, "currentFace", "questions"], STATE_OPTIONAL_KEYS) ||
    !isValidBaseRoundState(value, "dice", DICE_MAX_ROUNDS,
      ["roll", "question", "done"], PLAYER_LIMITS_BY_GAME.dice.min) ||
    (value.currentFace !== null && !isIntegerBetween(value.currentFace, 1, 6)) ||
    !isDenseArray(value.questions) || !value.questions.every(isDiceQuestion)) {
    return null;
  }
  const state = value as unknown as DiceRoomState;
  if (state.round === 0 ||
    state.questions.length > PLAYER_LIMITS_BY_GAME.dice.max * DICE_MAX_ROUNDS ||
    hasDuplicateQuestions(state.questions.map(({ question }) => question)) ||
    !hasValidRecordRounds(state, state.questions, PLAYER_LIMITS_BY_GAME.dice.min)) {
    return null;
  }
  if ((state.phase === "roll" && state.currentFace !== null) ||
    (state.phase === "question" && state.currentFace === null) ||
    (state.phase === "done" && state.currentFace !== null)) {
    return null;
  }
  return state;
}

export function readDiceState(value: unknown): DiceRoomState | null {
  try {
    return readDiceStateUnchecked(value);
  } catch {
    return null;
  }
}

export function readDicePublicState(value: unknown): DiceRoomState | null {
  return readDiceState(value);
}

function isRelayQuestion(value: unknown): value is RelayQuestionRecord {
  return isRecord(value) && hasExactKeys(value, [
    "roundId", "round", "playerId", "playerName", "locale", "question",
  ]) && isUuid(value.roundId) && isIntegerBetween(value.round, 1, RELAY_MAX_ROUNDS) &&
    isPlayerId(value.playerId) && isPlayerName(value.playerName) &&
    isQuestion(value.question, value.locale);
}

function readRelayStateUnchecked(value: unknown): RelayRoomState | null {
  if (!isRecord(value) || !hasExactKeys(value,
    [...BASE_ROUND_KEYS, "topic", "questions"], STATE_OPTIONAL_KEYS) ||
    !isValidBaseRoundState(value, "relay", RELAY_MAX_ROUNDS,
      ["setup", "question", "done"], PLAYER_LIMITS_BY_GAME.relay.min) ||
    typeof value.topic !== "string" || value.topic.length > QUESTION_GAME_LIMITS.topic ||
    !isDenseArray(value.questions) || !value.questions.every(isRelayQuestion)) {
    return null;
  }
  const state = value as unknown as RelayRoomState;
  if (state.round === 0) {
    return state.phase === "setup" && state.topic === "" && state.questions.length === 0
      ? state
      : state.phase === "done" && state.endReason === "insufficient-players"
        ? state
        : null;
  }
  if (!isStoredText(state.topic, QUESTION_GAME_LIMITS.topic) ||
    checkProfanity(state.topic).flagged ||
    state.questions.length > PLAYER_LIMITS_BY_GAME.relay.max * RELAY_MAX_ROUNDS ||
    hasDuplicateQuestions(state.questions.map(({ question }) => question)) ||
    !hasValidRecordRounds(state, state.questions, PLAYER_LIMITS_BY_GAME.relay.min)) {
    return null;
  }
  return state.phase === "question" || state.phase === "done" ? state : null;
}

export function readRelayState(value: unknown): RelayRoomState | null {
  try {
    return readRelayStateUnchecked(value);
  } catch {
    return null;
  }
}

export function readRelayPublicState(value: unknown): RelayRoomState | null {
  return readRelayState(value);
}

const KABA_SENTENCE_MAP = new Map(
  getKabaSentencePairs().map((entry) => [entry.key, entry.text]),
);

function isKabaPlanItem(value: unknown): value is KabaSentencePlanItem {
  if (!isRecord(value) || !hasExactKeys(value, ["key", "text"]) ||
    !isStoredText(value.key, QUESTION_GAME_LIMITS.story) || !isLocalizedText(value.text)) {
    return false;
  }
  const expected = KABA_SENTENCE_MAP.get(value.key);
  return expected?.ko === value.text.ko && expected.en === value.text.en;
}

function isKabaAttempt(value: unknown): value is KabaAttemptRecord {
  if (!isRecord(value) || !hasExactKeys(value, [
    "roundId", "round", "playerId", "playerName", "sentenceKey", "sentence",
    "locale", "question", "correct",
  ]) || !isUuid(value.roundId) || !isIntegerBetween(value.round, 1, KABA_MAX_ROUNDS) ||
    !isPlayerId(value.playerId) || !isPlayerName(value.playerName) ||
    !isStoredText(value.sentenceKey, QUESTION_GAME_LIMITS.story) ||
    !isLocalizedText(value.sentence) || !isLocale(value.locale) ||
    !isStoredText(value.question, QUESTION_GAME_LIMITS.question) ||
    checkProfanity(value.question).flagged || typeof value.correct !== "boolean") {
    return false;
  }
  const expected = KABA_SENTENCE_MAP.get(value.sentenceKey);
  return expected?.ko === value.sentence.ko && expected.en === value.sentence.en &&
    value.correct === isQuestionFormForLocale(value.question, value.locale);
}

function readScores(
  value: unknown,
  players: readonly TurnGamePlayer[],
  attempts: readonly KabaAttemptRecord[],
): value is Record<string, number> {
  if (!isRecord(value) || !hasExactKeys(value, players.map(({ id }) => id))) return false;
  return players.every(({ id }) => {
    const expected = attempts.filter((attempt) => attempt.playerId === id && attempt.correct).length;
    return value[id] === expected && isIntegerBetween(value[id], 0, KABA_MAX_ROUNDS);
  });
}

function readKabaStateUnchecked(value: unknown): KabaRoomState | null {
  if (!isRecord(value) || !hasExactKeys(value,
    [...BASE_ROUND_KEYS, "sentencePlan", "attempts", "scores"], STATE_OPTIONAL_KEYS) ||
    !isValidBaseRoundState(value, "kaba", KABA_MAX_ROUNDS,
      ["setup", "question", "done"], PLAYER_LIMITS_BY_GAME.kaba.min) ||
    !isDenseArray(value.sentencePlan) || !value.sentencePlan.every(isKabaPlanItem) ||
    !isUnique(value.sentencePlan.map((entry) => entry.key)) ||
    !isDenseArray(value.attempts) || !value.attempts.every(isKabaAttempt)) {
    return null;
  }
  const state = value as unknown as KabaRoomState;
  if (!readScores(state.scores, state.players, state.attempts)) return null;
  if (state.round === 0) {
    return state.phase === "setup" && state.sentencePlan.length === 0 && state.attempts.length === 0
      ? state
      : state.phase === "done" && state.endReason === "insufficient-players"
        ? state
        : null;
  }
  const expectedPlanLength = Math.max(
    QUESTION_GAME_RULES.kaba.targets.room.minimumTotal,
    state.players.length * QUESTION_GAME_RULES.kaba.targets.room.count,
  );
  if (state.sentencePlan.length !== expectedPlanLength ||
    state.sentencePlan.length > PLAYER_LIMITS_BY_GAME.kaba.max * KABA_MAX_ROUNDS ||
    state.attempts.length > state.sentencePlan.length ||
    !state.attempts.every((attempt, index) => {
      const planned = state.sentencePlan[index];
      return planned?.key === attempt.sentenceKey &&
        planned.text.ko === attempt.sentence.ko && planned.text.en === attempt.sentence.en;
    }) || !hasValidRecordRounds(
      state,
      state.attempts,
      PLAYER_LIMITS_BY_GAME.kaba.min,
    )) {
    return null;
  }
  return state.phase === "question" || state.phase === "done" ? state : null;
}

export function readKabaState(value: unknown): KabaRoomState | null {
  try {
    return readKabaStateUnchecked(value);
  } catch {
    return null;
  }
}

export function readKabaPublicState(value: unknown): KabaRoomState | null {
  return readKabaState(value);
}

function invalid(context: QuestionGameRoomEngineContext, message: string): QuestionGameEngineResult {
  return { kind: "invalid", room: context.room, message };
}

function forbidden(context: QuestionGameRoomEngineContext, message: string): QuestionGameEngineResult {
  return { kind: "forbidden", room: context.room, message };
}

function conflict(context: QuestionGameRoomEngineContext, message: string): QuestionGameEngineResult {
  return { kind: "conflict", room: context.room, message };
}

function corrupt(context: QuestionGameRoomEngineContext, message: string): QuestionGameEngineResult {
  return { kind: "corrupt", room: context.room, message };
}

function stateMatchesRoom(
  room: GameRoom,
  state: TurnGameState,
  storyTaggerExcluded = false,
): boolean {
  const activeIds = room.players.map(({ id }) => id);
  if (!isUnique(activeIds) || !room.players.every((player) =>
    state.playerNames[player.id] === player.name)) {
    return false;
  }
  if (state.phase === "done") return room.status === "ended";
  if (room.status !== "playing") return false;
  if (state.round === 0) return true;
  const expectedTargets = storyTaggerExcluded
    ? activeIds.filter((id) => id !== (state as StoryDiceRoomState).taggerId)
    : activeIds;
  return sameValueSet(state.roundTargetPlayerIds, expectedTargets);
}

function changedStory(
  context: QuestionGameRoomEngineContext,
  state: StoryDiceRoomState,
  status: "playing" | "ended" = "playing",
): QuestionGameEngineResult {
  if (!readStoryDiceState(state)) return corrupt(context, "이야기 주사위 결과가 손상되었습니다");
  return { kind: "changed", room: { ...context.room, status, gameState: state } };
}

function changedDice(
  context: QuestionGameRoomEngineContext,
  state: DiceRoomState,
  status: "playing" | "ended" = "playing",
): QuestionGameEngineResult {
  if (!readDiceState(state)) return corrupt(context, "질문 주사위 결과가 손상되었습니다");
  return { kind: "changed", room: { ...context.room, status, gameState: state } };
}

function relayChain(questions: readonly RelayQuestionRecord[]): RoomChainItem[] {
  return questions.map(({ question, playerId, playerName, round, roundId }) => ({
    question,
    playerId,
    playerName,
    round,
    roundId,
  }));
}

function changedRelay(
  context: QuestionGameRoomEngineContext,
  state: RelayRoomState,
  status: "playing" | "ended" = "playing",
): QuestionGameEngineResult {
  if (!readRelayState(state)) return corrupt(context, "질문 릴레이 결과가 손상되었습니다");
  return {
    kind: "changed",
    room: {
      ...context.room,
      status,
      topic: state.topic,
      chain: relayChain(state.questions),
      gameState: state,
    },
  };
}

function changedKaba(
  context: QuestionGameRoomEngineContext,
  state: KabaRoomState,
  status: "playing" | "ended" = "playing",
): QuestionGameEngineResult {
  if (!readKabaState(state)) return corrupt(context, "카바 놀이 결과가 손상되었습니다");
  return { kind: "changed", room: { ...context.room, status, gameState: state } };
}

function checkedRandom(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("invalid random");
  return value;
}

function shuffleWithRandom<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(checkedRandom(random) * (index + 1));
    [copy[index], copy[selected]] = [copy[selected], copy[index]];
  }
  return copy;
}

function makeStoryWords(random: () => number): StoryDiceWordPool {
  const pick = (category: DiceCategory) =>
    shuffleWithRandom(STORY_DICE_FALLBACK[category], random).slice(0, 8);
  const words = {
    protagonist: pick("protagonist"),
    place: pick("place"),
    event: pick("event"),
  };
  return { ...words, wordText: storyWordText(words) };
}

function storyWordText(
  words: Pick<StoryDiceWordPool, "protagonist" | "place" | "event">,
): Record<string, LocalizedText> {
  const entries: Array<[string, LocalizedText]> = [];
  for (const category of STORY_WORD_KEYS) {
    for (const ko of words[category]) {
      const index = (STORY_DICE_FALLBACK[category] as readonly string[]).indexOf(ko);
      entries.push([ko, { ko, en: STORY_DICE_FALLBACK_EN[category][index] }]);
    }
  }
  return Object.fromEntries(entries);
}

function emptyStoryWords(): StoryDiceWordPool {
  const words = {
    protagonist: [...STORY_DICE_FALLBACK.protagonist.slice(0, 8)],
    place: [...STORY_DICE_FALLBACK.place.slice(0, 8)],
    event: [...STORY_DICE_FALLBACK.event.slice(0, 8)],
  };
  return { ...words, wordText: storyWordText(words) };
}

function makeRoundArrays(players: readonly RoomPlayer[], excludedId?: string) {
  const roundPlayerIds = players.map(({ id }) => id);
  const roundTargetPlayerIds = roundPlayerIds.filter((id) => id !== excludedId);
  return {
    roundPlayerIds,
    roundTargetPlayerIds,
    roundSubmittedPlayerIds: [] as string[],
    turnOrder: [...roundTargetPlayerIds],
    currentTurnIdx: 0,
  };
}

function createStoryDiceState(context: QuestionGameRoomEngineContext): StoryDiceRoomState {
  const players = playersFromRoom(context.room.players, "story-dice");
  return {
    stateVersion: 2,
    game: "story-dice",
    phase: "setup",
    recentCommandIds: [],
    round: 0,
    maxRounds: STORY_MAX_ROUNDS,
    completedRounds: 0,
    players,
    playerNames: namesForPlayers(players),
    taggerId: "",
    words: emptyStoryWords(),
    rolledWords: null,
    roundPlayerIds: [],
    roundTargetPlayerIds: [],
    roundSubmittedPlayerIds: [],
    turnOrder: [],
    currentTurnIdx: 0,
    story: null,
    pendingQuestion: null,
    pairs: [],
  };
}

function createDiceState(context: QuestionGameRoomEngineContext): DiceRoomState {
  const players = playersFromRoom(context.room.players, "dice");
  return {
    stateVersion: 2,
    game: "dice",
    phase: "roll",
    recentCommandIds: [],
    round: 1,
    maxRounds: DICE_MAX_ROUNDS,
    completedRounds: 0,
    roundId: context.randomUUID(),
    players,
    playerNames: namesForPlayers(players),
    ...makeRoundArrays(context.room.players),
    currentFace: null,
    questions: [],
  };
}

function createRelayState(context: QuestionGameRoomEngineContext): RelayRoomState {
  const players = playersFromRoom(context.room.players, "relay");
  return {
    stateVersion: 2,
    game: "relay",
    phase: "setup",
    recentCommandIds: [],
    round: 0,
    maxRounds: RELAY_MAX_ROUNDS,
    completedRounds: 0,
    players,
    playerNames: namesForPlayers(players),
    topic: "",
    roundPlayerIds: [],
    roundTargetPlayerIds: [],
    roundSubmittedPlayerIds: [],
    turnOrder: [],
    currentTurnIdx: 0,
    questions: [],
  };
}

function createKabaState(context: QuestionGameRoomEngineContext): KabaRoomState {
  const players = playersFromRoom(context.room.players, "kaba");
  return {
    stateVersion: 2,
    game: "kaba",
    phase: "setup",
    recentCommandIds: [],
    round: 0,
    maxRounds: KABA_MAX_ROUNDS,
    completedRounds: 0,
    players,
    playerNames: namesForPlayers(players),
    sentencePlan: [],
    roundPlayerIds: [],
    roundTargetPlayerIds: [],
    roundSubmittedPlayerIds: [],
    turnOrder: [],
    currentTurnIdx: 0,
    attempts: [],
    scores: Object.fromEntries(players.map(({ id }) => [id, 0])),
  };
}

function parseQuestionBody(
  context: QuestionGameRoomEngineContext,
  keys: readonly string[],
): { locale: QuestionLocale; question: string } | null {
  if (!hasExactActionBody(context, keys) || !isLocale(context.body.locale) ||
    typeof context.body.question !== "string") {
    return null;
  }
  const question = context.body.question.trim();
  return isQuestion(question, context.body.locale)
    ? { locale: context.body.locale, question }
    : null;
}

function isCurrentTurn(context: QuestionGameRoomEngineContext, state: TurnGameState): boolean {
  return currentPlayerId(state) === context.userId;
}

function advanceStoryRound(
  state: StoryDiceRoomState,
  room: GameRoom,
  randomUUID: () => string,
): { state: StoryDiceRoomState; ended: boolean } {
  if (state.round === state.maxRounds) {
    return {
      ended: true,
      state: {
        ...state,
        phase: "done",
        completedRounds: state.round,
        pendingQuestion: null,
        endReason: "completed",
      },
    };
  }
  return {
    ended: false,
    state: {
      ...state,
      phase: "question",
      round: state.round + 1,
      completedRounds: state.round,
      roundId: randomUUID(),
      ...makeRoundArrays(room.players, state.taggerId),
      pendingQuestion: null,
    },
  };
}

function prepareStory(
  context: QuestionGameRoomEngineContext,
  state: StoryDiceRoomState,
): QuestionGameEngineResult {
  if (context.userId !== context.room.hostId) return forbidden(context, "방장만 이야기를 준비할 수 있습니다");
  if (state.phase !== "setup") return conflict(context, "이야기를 준비할 단계가 아닙니다");
  if (!hasExactActionBody(context, COMMON_BODY_KEYS)) return invalid(context, "이야기 준비 자료가 올바르지 않습니다");
  try {
    const taggerId = context.room.hostId;
    return changedStory(context, {
      ...state,
      phase: "roll",
      round: 1,
      roundId: context.randomUUID(),
      taggerId,
      words: makeStoryWords(context.random),
      ...makeRoundArrays(context.room.players, taggerId),
    });
  } catch {
    return corrupt(context, "서버 이야기 자료를 만들 수 없습니다");
  }
}

function rollStory(
  context: QuestionGameRoomEngineContext,
  state: StoryDiceRoomState,
): QuestionGameEngineResult {
  if (state.phase !== "roll") return conflict(context, "이야기 주사위를 굴릴 단계가 아닙니다");
  if (context.userId !== state.taggerId) return forbidden(context, "술래만 이야기 주사위를 굴릴 수 있습니다");
  if (!hasExactActionBody(context, COMMON_ROUND_BODY_KEYS)) return invalid(context, "주사위 명령 자료가 올바르지 않습니다");
  try {
    const pick = (category: DiceCategory) => {
      const words = state.words[category];
      return words[Math.floor(checkedRandom(context.random) * words.length)];
    };
    return changedStory(context, {
      ...state,
      phase: "story",
      rolledWords: {
        protagonist: pick("protagonist"),
        place: pick("place"),
        event: pick("event"),
      },
    });
  } catch {
    return corrupt(context, "서버 주사위 결과를 만들 수 없습니다");
  }
}

function submitStory(
  context: QuestionGameRoomEngineContext,
  state: StoryDiceRoomState,
): QuestionGameEngineResult {
  if (state.phase !== "story" || !state.roundId) return conflict(context, "이야기를 제출할 단계가 아닙니다");
  if (context.userId !== state.taggerId) return forbidden(context, "술래만 이야기를 제출할 수 있습니다");
  if (!hasExactActionBody(context, [...COMMON_ROUND_BODY_KEYS, "story"]) ||
    typeof context.body.story !== "string") {
    return invalid(context, "이야기 제출 자료가 올바르지 않습니다");
  }
  const story = context.body.story.trim();
  if (!isStoredText(story, QUESTION_GAME_LIMITS.story) || checkProfanity(story).flagged) {
    return invalid(context, "이야기를 오백 자 이내의 알맞은 표현으로 써 주세요");
  }
  return changedStory(context, {
    ...state,
    phase: "question",
    story: {
      roundId: state.roundId,
      round: state.round,
      playerId: state.taggerId,
      playerName: state.playerNames[state.taggerId],
      story,
    },
  });
}

function submitStoryQuestion(
  context: QuestionGameRoomEngineContext,
  state: StoryDiceRoomState,
): QuestionGameEngineResult {
  if (state.phase !== "question" || !state.roundId) return conflict(context, "질문을 제출할 단계가 아닙니다");
  if (!isCurrentTurn(context, state)) return forbidden(context, "현재 질문자만 질문할 수 있습니다");
  const parsed = parseQuestionBody(context, [...COMMON_ROUND_BODY_KEYS, "locale", "question"]);
  if (!parsed) return invalid(context, "질문을 이백 자 이내의 물음형으로 써 주세요");
  if (state.pairs.some(({ question }) =>
    normalizedQuestion(question) === normalizedQuestion(parsed.question))) {
    return invalid(context, "이미 나온 질문과 다른 질문을 써 주세요");
  }
  return changedStory(context, {
    ...state,
    phase: "answer",
    pendingQuestion: {
      roundId: state.roundId,
      round: state.round,
      playerId: context.userId,
      playerName: state.playerNames[context.userId],
      ...parsed,
    },
  });
}

function submitStoryAnswer(
  context: QuestionGameRoomEngineContext,
  state: StoryDiceRoomState,
): QuestionGameEngineResult {
  if (state.phase !== "answer" || !state.roundId || !state.pendingQuestion) {
    return conflict(context, "대답을 제출할 단계가 아닙니다");
  }
  if (context.userId !== state.taggerId) return forbidden(context, "술래만 대답할 수 있습니다");
  if (!hasExactActionBody(context, [...COMMON_ROUND_BODY_KEYS, "answer"]) ||
    typeof context.body.answer !== "string") {
    return invalid(context, "대답 제출 자료가 올바르지 않습니다");
  }
  const answer = context.body.answer.trim();
  if (!isStoredText(answer, QUESTION_GAME_LIMITS.answer) || checkProfanity(answer).flagged) {
    return invalid(context, "대답을 오백 자 이내의 알맞은 표현으로 써 주세요");
  }
  const pair: StoryDicePair = {
    ...state.pendingQuestion,
    taggerId: state.taggerId,
    taggerName: state.playerNames[state.taggerId],
    answer,
  };
  const roundSubmittedPlayerIds = [
    ...state.roundSubmittedPlayerIds,
    state.pendingQuestion.playerId,
  ];
  const candidate: StoryDiceRoomState = {
    ...state,
    phase: "question",
    pendingQuestion: null,
    pairs: [...state.pairs, pair],
    roundSubmittedPlayerIds,
    currentTurnIdx: currentPendingIndex(state.turnOrder, roundSubmittedPlayerIds),
  };
  if (!state.roundTargetPlayerIds.every((id) => roundSubmittedPlayerIds.includes(id))) {
    return changedStory(context, candidate);
  }
  try {
    const next = advanceStoryRound(candidate, context.room, context.randomUUID);
    return changedStory(context, next.state, next.ended ? "ended" : "playing");
  } catch {
    return corrupt(context, "다음 이야기 순환을 만들 수 없습니다");
  }
}

function endStoryEarly(
  context: QuestionGameRoomEngineContext,
  state: StoryDiceRoomState,
): QuestionGameEngineResult {
  const keys = state.roundId ? COMMON_ROUND_BODY_KEYS : COMMON_BODY_KEYS;
  if (!hasExactActionBody(context, keys)) return invalid(context, "조기 종료 자료가 올바르지 않습니다");
  if (context.userId !== context.room.hostId) return forbidden(context, "방장만 놀이를 일찍 끝낼 수 있습니다");
  if (context.room.status !== "playing" || state.phase === "done" || state.completedRounds < 1) {
    return conflict(context, "완료한 순환이 있어야 놀이를 일찍 끝낼 수 있습니다");
  }
  return changedStory(context, {
    ...state,
    phase: "done",
    pendingQuestion: null,
    endReason: "host",
  }, "ended");
}

function applyStoryDiceCommand(context: QuestionGameRoomEngineContext): QuestionGameEngineResult {
  const state = readStoryDiceState(context.state);
  if (!state) return corrupt(context, "이야기 주사위 상태가 손상되었습니다");
  if (!stateMatchesRoom(context.room, state, true)) return corrupt(context, "이야기 참가자 상태가 손상되었습니다");
  if (context.action === "story-prepare") return prepareStory(context, state);
  if (context.action === "story-roll") return rollStory(context, state);
  if (context.action === "story-submit-story") return submitStory(context, state);
  if (context.action === "story-submit-question") return submitStoryQuestion(context, state);
  if (context.action === "story-submit-answer") return submitStoryAnswer(context, state);
  if (context.action === "end-game-early") return endStoryEarly(context, state);
  return invalid(context, "지원하지 않는 이야기 주사위 명령입니다");
}

function advanceDiceRound(
  state: DiceRoomState,
  room: GameRoom,
  randomUUID: () => string,
): { state: DiceRoomState; ended: boolean } {
  if (state.round === state.maxRounds) {
    return {
      ended: true,
      state: {
        ...state,
        phase: "done",
        completedRounds: state.round,
        currentFace: null,
        endReason: "completed",
      },
    };
  }
  return {
    ended: false,
    state: {
      ...state,
      phase: "roll",
      round: state.round + 1,
      completedRounds: state.round,
      roundId: randomUUID(),
      ...makeRoundArrays(room.players),
      currentFace: null,
    },
  };
}

function applyDiceCommand(context: QuestionGameRoomEngineContext): QuestionGameEngineResult {
  const state = readDiceState(context.state);
  if (!state) return corrupt(context, "질문 주사위 상태가 손상되었습니다");
  if (!stateMatchesRoom(context.room, state)) return corrupt(context, "질문 주사위 참가자 상태가 손상되었습니다");
  if (context.action === "end-game-early") {
    if (!hasExactActionBody(context, COMMON_ROUND_BODY_KEYS)) return invalid(context, "조기 종료 자료가 올바르지 않습니다");
    if (context.userId !== context.room.hostId) return forbidden(context, "방장만 놀이를 일찍 끝낼 수 있습니다");
    if (context.room.status !== "playing" || state.phase === "done" || state.completedRounds < 1) {
      return conflict(context, "완료한 라운드가 있어야 놀이를 일찍 끝낼 수 있습니다");
    }
    return changedDice(context, { ...state, phase: "done", currentFace: null, endReason: "host" }, "ended");
  }
  if (context.action === "dice-roll") {
    if (state.phase !== "roll") return conflict(context, "주사위를 굴릴 단계가 아닙니다");
    if (!isCurrentTurn(context, state)) return forbidden(context, "현재 참가자만 주사위를 굴릴 수 있습니다");
    if (!hasExactActionBody(context, COMMON_ROUND_BODY_KEYS)) return invalid(context, "주사위 명령 자료가 올바르지 않습니다");
    try {
      return changedDice(context, {
        ...state,
        phase: "question",
        currentFace: Math.floor(checkedRandom(context.random) * 6) + 1,
      });
    } catch {
      return corrupt(context, "서버 주사위 결과를 만들 수 없습니다");
    }
  }
  if (context.action !== "dice-submit-question") {
    return invalid(context, "지원하지 않는 질문 주사위 명령입니다");
  }
  if (state.phase !== "question" || state.currentFace === null || !state.roundId) {
    return conflict(context, "질문을 제출할 단계가 아닙니다");
  }
  if (!isCurrentTurn(context, state)) return forbidden(context, "현재 참가자만 질문할 수 있습니다");
  const parsed = parseQuestionBody(context, [...COMMON_ROUND_BODY_KEYS, "locale", "question"]);
  if (!parsed) return invalid(context, "질문을 이백 자 이내의 물음형으로 써 주세요");
  if (state.questions.some(({ question }) => normalizedQuestion(question) === normalizedQuestion(parsed.question))) {
    return invalid(context, "이미 나온 질문과 다른 질문을 써 주세요");
  }
  const question: DiceQuestionRecord = {
    roundId: state.roundId,
    round: state.round,
    playerId: context.userId,
    playerName: state.playerNames[context.userId],
    face: state.currentFace,
    ...parsed,
  };
  const roundSubmittedPlayerIds = [...state.roundSubmittedPlayerIds, context.userId];
  const candidate: DiceRoomState = {
    ...state,
    phase: "roll",
    currentFace: null,
    questions: [...state.questions, question],
    roundSubmittedPlayerIds,
    currentTurnIdx: currentPendingIndex(state.turnOrder, roundSubmittedPlayerIds),
  };
  if (!state.roundTargetPlayerIds.every((id) => roundSubmittedPlayerIds.includes(id))) {
    return changedDice(context, candidate);
  }
  try {
    const next = advanceDiceRound(candidate, context.room, context.randomUUID);
    return changedDice(context, next.state, next.ended ? "ended" : "playing");
  } catch {
    return corrupt(context, "다음 질문 주사위 라운드를 만들 수 없습니다");
  }
}

function advanceRelayRound(
  state: RelayRoomState,
  room: GameRoom,
  randomUUID: () => string,
): { state: RelayRoomState; ended: boolean } {
  if (state.round === state.maxRounds) {
    return {
      ended: true,
      state: { ...state, phase: "done", completedRounds: state.round, endReason: "completed" },
    };
  }
  return {
    ended: false,
    state: {
      ...state,
      round: state.round + 1,
      completedRounds: state.round,
      roundId: randomUUID(),
      ...makeRoundArrays(room.players),
    },
  };
}

function relayRoomMatchesState(room: GameRoom, state: RelayRoomState): boolean {
  return stateMatchesRoom(room, state) && room.topic === state.topic &&
    JSON.stringify(room.chain) === JSON.stringify(relayChain(state.questions));
}

function applyRelayCommand(context: QuestionGameRoomEngineContext): QuestionGameEngineResult {
  const state = readRelayState(context.state);
  if (!state) return corrupt(context, "질문 릴레이 상태가 손상되었습니다");
  if (!relayRoomMatchesState(context.room, state)) return corrupt(context, "질문 릴레이 방 상태가 손상되었습니다");
  if (context.action === "relay-set-topic") {
    if (context.userId !== context.room.hostId) return forbidden(context, "방장만 주제를 정할 수 있습니다");
    if (state.phase !== "setup") return conflict(context, "주제를 정할 단계가 아닙니다");
    if (!hasExactActionBody(context, [...COMMON_BODY_KEYS, "topic"]) ||
      typeof context.body.topic !== "string") {
      return invalid(context, "주제 자료가 올바르지 않습니다");
    }
    const topic = context.body.topic.trim();
    if (!isStoredText(topic, QUESTION_GAME_LIMITS.topic) || checkProfanity(topic).flagged) {
      return invalid(context, "주제를 팔십 자 이내의 알맞은 표현으로 써 주세요");
    }
    try {
      return changedRelay(context, {
        ...state,
        phase: "question",
        round: 1,
        roundId: context.randomUUID(),
        topic,
        ...makeRoundArrays(context.room.players),
      });
    } catch {
      return corrupt(context, "서버 릴레이 라운드를 만들 수 없습니다");
    }
  }
  if (context.action === "end-game-early") {
    if (!hasExactActionBody(context, COMMON_ROUND_BODY_KEYS)) return invalid(context, "조기 종료 자료가 올바르지 않습니다");
    if (context.userId !== context.room.hostId) return forbidden(context, "방장만 놀이를 일찍 끝낼 수 있습니다");
    if (context.room.status !== "playing" || state.phase === "done" || state.completedRounds < 1) {
      return conflict(context, "완료한 라운드가 있어야 놀이를 일찍 끝낼 수 있습니다");
    }
    return changedRelay(context, { ...state, phase: "done", endReason: "host" }, "ended");
  }
  if (context.action !== "relay-submit-question") {
    return invalid(context, "지원하지 않는 질문 릴레이 명령입니다");
  }
  if (state.phase !== "question" || !state.roundId) return conflict(context, "질문을 제출할 단계가 아닙니다");
  if (!isCurrentTurn(context, state)) return forbidden(context, "현재 참가자만 질문을 이을 수 있습니다");
  const parsed = parseQuestionBody(context, [...COMMON_ROUND_BODY_KEYS, "locale", "question"]);
  if (!parsed) return invalid(context, "질문을 이백 자 이내의 물음형으로 써 주세요");
  if (state.questions.some(({ question }) => normalizedQuestion(question) === normalizedQuestion(parsed.question))) {
    return invalid(context, "이미 나온 질문과 다른 질문을 써 주세요");
  }
  const question: RelayQuestionRecord = {
    roundId: state.roundId,
    round: state.round,
    playerId: context.userId,
    playerName: state.playerNames[context.userId],
    ...parsed,
  };
  const roundSubmittedPlayerIds = [...state.roundSubmittedPlayerIds, context.userId];
  const candidate: RelayRoomState = {
    ...state,
    questions: [...state.questions, question],
    roundSubmittedPlayerIds,
    currentTurnIdx: currentPendingIndex(state.turnOrder, roundSubmittedPlayerIds),
  };
  if (!state.roundTargetPlayerIds.every((id) => roundSubmittedPlayerIds.includes(id))) {
    return changedRelay(context, candidate);
  }
  try {
    const next = advanceRelayRound(candidate, context.room, context.randomUUID);
    return changedRelay(context, next.state, next.ended ? "ended" : "playing");
  } catch {
    return corrupt(context, "다음 질문 릴레이 라운드를 만들 수 없습니다");
  }
}

function advanceKabaRound(
  state: KabaRoomState,
  room: GameRoom,
  randomUUID: () => string,
): { state: KabaRoomState; ended: boolean } {
  if (state.round === state.maxRounds) {
    return {
      ended: true,
      state: { ...state, phase: "done", completedRounds: state.round, endReason: "completed" },
    };
  }
  return {
    ended: false,
    state: {
      ...state,
      round: state.round + 1,
      completedRounds: state.round,
      roundId: randomUUID(),
      ...makeRoundArrays(room.players),
    },
  };
}

function applyKabaCommand(context: QuestionGameRoomEngineContext): QuestionGameEngineResult {
  const state = readKabaState(context.state);
  if (!state) return corrupt(context, "카바 놀이 상태가 손상되었습니다");
  if (!stateMatchesRoom(context.room, state)) return corrupt(context, "카바 참가자 상태가 손상되었습니다");
  if (context.action === "kaba-prepare") {
    if (context.userId !== context.room.hostId) return forbidden(context, "방장만 카바 문장을 준비할 수 있습니다");
    if (state.phase !== "setup") return conflict(context, "카바 문장을 준비할 단계가 아닙니다");
    if (!hasExactActionBody(context, COMMON_BODY_KEYS)) return invalid(context, "카바 준비 자료가 올바르지 않습니다");
    try {
      const count = Math.max(
        QUESTION_GAME_RULES.kaba.targets.room.minimumTotal,
        context.room.players.length * QUESTION_GAME_RULES.kaba.targets.room.count,
      );
      const sentencePlan = shuffleWithRandom(getKabaSentencePairs(), context.random).slice(0, count);
      return changedKaba(context, {
        ...state,
        phase: "question",
        round: 1,
        roundId: context.randomUUID(),
        sentencePlan,
        ...makeRoundArrays(context.room.players),
      });
    } catch {
      return corrupt(context, "서버 카바 문장을 만들 수 없습니다");
    }
  }
  if (context.action === "end-game-early") {
    if (!hasExactActionBody(context, COMMON_ROUND_BODY_KEYS)) return invalid(context, "조기 종료 자료가 올바르지 않습니다");
    if (context.userId !== context.room.hostId) return forbidden(context, "방장만 놀이를 일찍 끝낼 수 있습니다");
    if (context.room.status !== "playing" || state.phase === "done" || state.completedRounds < 1) {
      return conflict(context, "완료한 라운드가 있어야 놀이를 일찍 끝낼 수 있습니다");
    }
    return changedKaba(context, { ...state, phase: "done", endReason: "host" }, "ended");
  }
  if (context.action !== "kaba-submit-question") {
    return invalid(context, "지원하지 않는 카바 명령입니다");
  }
  if (state.phase !== "question" || !state.roundId) return conflict(context, "문장을 바꿀 단계가 아닙니다");
  if (!isCurrentTurn(context, state)) return forbidden(context, "현재 참가자만 문장을 바꿀 수 있습니다");
  if (!hasExactActionBody(context, [...COMMON_ROUND_BODY_KEYS, "locale", "question"]) ||
    !isLocale(context.body.locale) || typeof context.body.question !== "string") {
    return invalid(context, "카바 제출 자료가 올바르지 않습니다");
  }
  const question = context.body.question.trim();
  if (!isStoredText(question, QUESTION_GAME_LIMITS.question) || checkProfanity(question).flagged) {
    return invalid(context, "바꾼 문장을 이백 자 이내의 알맞은 표현으로 써 주세요");
  }
  const prompt = state.sentencePlan[state.attempts.length];
  if (!prompt) return corrupt(context, "카바 문장 순서가 손상되었습니다");
  const correct = isQuestionFormForLocale(question, context.body.locale);
  const attempt: KabaAttemptRecord = {
    roundId: state.roundId,
    round: state.round,
    playerId: context.userId,
    playerName: state.playerNames[context.userId],
    sentenceKey: prompt.key,
    sentence: prompt.text,
    locale: context.body.locale,
    question,
    correct,
  };
  const roundSubmittedPlayerIds = [...state.roundSubmittedPlayerIds, context.userId];
  const candidate: KabaRoomState = {
    ...state,
    attempts: [...state.attempts, attempt],
    scores: {
      ...state.scores,
      [context.userId]: state.scores[context.userId] + (correct ? 1 : 0),
    },
    roundSubmittedPlayerIds,
    currentTurnIdx: currentPendingIndex(state.turnOrder, roundSubmittedPlayerIds),
  };
  if (!state.roundTargetPlayerIds.every((id) => roundSubmittedPlayerIds.includes(id))) {
    return changedKaba(context, candidate);
  }
  try {
    const next = advanceKabaRound(candidate, context.room, context.randomUUID);
    return changedKaba(context, next.state, next.ended ? "ended" : "playing");
  } catch {
    return corrupt(context, "다음 카바 라운드를 만들 수 없습니다");
  }
}

function restoreForLeave(
  context: QuestionGameRoomLeaveContext,
  game: TurnGameId,
): Record<string, unknown> | null {
  if (!isRecord(context.room.gameState)) return null;
  const restored: Record<string, unknown> = { ...context.room.gameState };
  if (restored.endReason === "insufficient-players") {
    delete restored.endReason;
    if (game === "story-dice") {
      restored.phase = restored.pendingQuestion ? "answer"
        : restored.story ? "question"
        : restored.rolledWords ? "story"
        : restored.round === 0 ? "setup" : "roll";
    } else if (game === "dice") {
      restored.phase = restored.currentFace === null ? "roll" : "question";
    } else {
      restored.phase = restored.round === 0 ? "setup" : "question";
    }
  }
  if (isStringArray(restored.roundTargetPlayerIds) &&
    isStringArray(restored.roundSubmittedPlayerIds)) {
    const turnOrder = [...restored.roundTargetPlayerIds];
    const submitted = [...restored.roundSubmittedPlayerIds];
    restored.turnOrder = turnOrder;
    restored.currentTurnIdx = currentPendingIndex(
      turnOrder,
      submitted,
    );
  }
  return restored;
}

function leaveStory(context: QuestionGameRoomLeaveContext): GameRoom {
  const raw = restoreForLeave(context, "story-dice");
  const state = readStoryDiceState(raw);
  if (!state) throw new Error("corrupt story leave state");
  const commonInsufficient = isRecord(context.room.gameState) &&
    context.room.gameState.endReason === "insufficient-players";
  const activeIds = context.room.players.map(({ id }) => id);
  let taggerId = state.taggerId;
  let pendingQuestion = state.pendingQuestion;
  let phase = state.phase;
  if (taggerId === context.userId) {
    taggerId = activeIds[0] ?? "";
    pendingQuestion = null;
    if (state.story) phase = "question";
  } else if (pendingQuestion?.playerId === context.userId) {
    pendingQuestion = null;
    phase = "question";
  }
  const roundTargetPlayerIds = state.roundTargetPlayerIds.filter(
    (id) => activeIds.includes(id) && id !== taggerId,
  );
  const roundSubmittedPlayerIds = state.roundSubmittedPlayerIds.filter((id) =>
    roundTargetPlayerIds.includes(id));
  const turnOrder = [...roundTargetPlayerIds];
  let candidate: StoryDiceRoomState = {
    ...state,
    taggerId,
    phase,
    pendingQuestion,
    roundTargetPlayerIds,
    roundSubmittedPlayerIds,
    turnOrder,
    currentTurnIdx: currentPendingIndex(turnOrder, roundSubmittedPlayerIds),
  };
  if (commonInsufficient) {
    candidate = { ...candidate, phase: "done", pendingQuestion: null, endReason: "insufficient-players" };
    if (!readStoryDiceState(candidate)) throw new Error("invalid story insufficient state");
    return { ...context.room, status: "ended", gameState: candidate };
  }
  if (state.phase === "done") {
    if (!readStoryDiceState(candidate)) throw new Error("invalid story completed leave state");
    return { ...context.room, gameState: candidate };
  }
  const allSubmitted = roundTargetPlayerIds.length > 0 &&
    roundTargetPlayerIds.every((id) => roundSubmittedPlayerIds.includes(id));
  if (!allSubmitted || state.round === 0 || !state.story) {
    if (!readStoryDiceState(candidate)) throw new Error("invalid story leave state");
    return { ...context.room, gameState: candidate };
  }
  const next = advanceStoryRound(candidate, context.room, () => {
    if (!context.randomUUID) throw new Error("missing uuid");
    return context.randomUUID();
  });
  if (!readStoryDiceState(next.state)) throw new Error("invalid story transition");
  return { ...context.room, status: next.ended ? "ended" : "playing", gameState: next.state };
}

function leaveDice(context: QuestionGameRoomLeaveContext): GameRoom {
  const raw = restoreForLeave(context, "dice");
  const state = readDiceState(raw);
  if (!state) throw new Error("corrupt dice leave state");
  const commonInsufficient = isRecord(context.room.gameState) &&
    context.room.gameState.endReason === "insufficient-players";
  const activeIds = context.room.players.map(({ id }) => id);
  const roundTargetPlayerIds = state.roundTargetPlayerIds.filter((id) => activeIds.includes(id));
  const roundSubmittedPlayerIds = state.roundSubmittedPlayerIds.filter((id) =>
    roundTargetPlayerIds.includes(id));
  const turnOrder = [...roundTargetPlayerIds];
  let candidate: DiceRoomState = {
    ...state,
    phase: context.wasCurrentTurn && state.phase === "question" ? "roll" : state.phase,
    currentFace: context.wasCurrentTurn ? null : state.currentFace,
    roundTargetPlayerIds,
    roundSubmittedPlayerIds,
    turnOrder,
    currentTurnIdx: currentPendingIndex(turnOrder, roundSubmittedPlayerIds),
  };
  if (commonInsufficient) {
    candidate = { ...candidate, phase: "done", currentFace: null, endReason: "insufficient-players" };
    if (!readDiceState(candidate)) throw new Error("invalid dice insufficient state");
    return { ...context.room, status: "ended", gameState: candidate };
  }
  if (state.phase === "done") {
    if (!readDiceState(candidate)) throw new Error("invalid dice completed leave state");
    return { ...context.room, gameState: candidate };
  }
  const allSubmitted = roundTargetPlayerIds.length >= PLAYER_LIMITS_BY_GAME.dice.min &&
    roundTargetPlayerIds.every((id) => roundSubmittedPlayerIds.includes(id));
  if (!allSubmitted) {
    if (!readDiceState(candidate)) throw new Error("invalid dice leave state");
    return { ...context.room, gameState: candidate };
  }
  const next = advanceDiceRound(candidate, context.room, () => {
    if (!context.randomUUID) throw new Error("missing uuid");
    return context.randomUUID();
  });
  if (!readDiceState(next.state)) throw new Error("invalid dice transition");
  return { ...context.room, status: next.ended ? "ended" : "playing", gameState: next.state };
}

function leaveRelay(context: QuestionGameRoomLeaveContext): GameRoom {
  const raw = restoreForLeave(context, "relay");
  const state = readRelayState(raw);
  if (!state) throw new Error("corrupt relay leave state");
  const commonInsufficient = isRecord(context.room.gameState) &&
    context.room.gameState.endReason === "insufficient-players";
  const activeIds = context.room.players.map(({ id }) => id);
  const roundTargetPlayerIds = state.roundTargetPlayerIds.filter((id) => activeIds.includes(id));
  const roundSubmittedPlayerIds = state.roundSubmittedPlayerIds.filter((id) =>
    roundTargetPlayerIds.includes(id));
  const turnOrder = [...roundTargetPlayerIds];
  let candidate: RelayRoomState = {
    ...state,
    roundTargetPlayerIds,
    roundSubmittedPlayerIds,
    turnOrder,
    currentTurnIdx: currentPendingIndex(turnOrder, roundSubmittedPlayerIds),
  };
  if (commonInsufficient) {
    candidate = { ...candidate, phase: "done", endReason: "insufficient-players" };
    if (!readRelayState(candidate)) throw new Error("invalid relay insufficient state");
    return { ...context.room, status: "ended", chain: relayChain(candidate.questions), gameState: candidate };
  }
  if (state.phase === "done" || state.round === 0) {
    if (!readRelayState(candidate)) throw new Error("invalid relay leave state");
    return { ...context.room, chain: relayChain(candidate.questions), gameState: candidate };
  }
  const allSubmitted = roundTargetPlayerIds.length >= PLAYER_LIMITS_BY_GAME.relay.min &&
    roundTargetPlayerIds.every((id) => roundSubmittedPlayerIds.includes(id));
  if (!allSubmitted) {
    if (!readRelayState(candidate)) throw new Error("invalid relay leave state");
    return { ...context.room, chain: relayChain(candidate.questions), gameState: candidate };
  }
  const next = advanceRelayRound(candidate, context.room, () => {
    if (!context.randomUUID) throw new Error("missing uuid");
    return context.randomUUID();
  });
  if (!readRelayState(next.state)) throw new Error("invalid relay transition");
  return {
    ...context.room,
    status: next.ended ? "ended" : "playing",
    chain: relayChain(next.state.questions),
    gameState: next.state,
  };
}

function leaveKaba(context: QuestionGameRoomLeaveContext): GameRoom {
  const raw = restoreForLeave(context, "kaba");
  const state = readKabaState(raw);
  if (!state) throw new Error("corrupt kaba leave state");
  const commonInsufficient = isRecord(context.room.gameState) &&
    context.room.gameState.endReason === "insufficient-players";
  const activeIds = context.room.players.map(({ id }) => id);
  const roundTargetPlayerIds = state.roundTargetPlayerIds.filter((id) => activeIds.includes(id));
  const roundSubmittedPlayerIds = state.roundSubmittedPlayerIds.filter((id) =>
    roundTargetPlayerIds.includes(id));
  const turnOrder = [...roundTargetPlayerIds];
  let candidate: KabaRoomState = {
    ...state,
    roundTargetPlayerIds,
    roundSubmittedPlayerIds,
    turnOrder,
    currentTurnIdx: currentPendingIndex(turnOrder, roundSubmittedPlayerIds),
  };
  if (!commonInsufficient && state.round === 0 && state.phase === "setup") {
    const players = playersFromRoom(context.room.players, "kaba");
    candidate = {
      ...candidate,
      players,
      playerNames: namesForPlayers(players),
      scores: Object.fromEntries(players.map(({ id }) => [id, 0])),
    };
  }
  if (commonInsufficient) {
    candidate = { ...candidate, phase: "done", endReason: "insufficient-players" };
    if (!readKabaState(candidate)) throw new Error("invalid kaba insufficient state");
    return { ...context.room, status: "ended", gameState: candidate };
  }
  if (state.phase === "done" || state.round === 0) {
    if (!readKabaState(candidate)) throw new Error("invalid kaba leave state");
    return { ...context.room, gameState: candidate };
  }
  const allSubmitted = roundTargetPlayerIds.length >= PLAYER_LIMITS_BY_GAME.kaba.min &&
    roundTargetPlayerIds.every((id) => roundSubmittedPlayerIds.includes(id));
  if (!allSubmitted) {
    if (!readKabaState(candidate)) throw new Error("invalid kaba leave state");
    return { ...context.room, gameState: candidate };
  }
  const next = advanceKabaRound(candidate, context.room, () => {
    if (!context.randomUUID) throw new Error("missing uuid");
    return context.randomUUID();
  });
  if (!readKabaState(next.state)) throw new Error("invalid kaba transition");
  return { ...context.room, status: next.ended ? "ended" : "playing", gameState: next.state };
}

export const storyDiceQuestionGameRoomEngine: QuestionGameRoomEngine = {
  createInitialState: createStoryDiceState,
  applyCommand: applyStoryDiceCommand,
  onPlayerLeave: leaveStory,
};

export const diceQuestionGameRoomEngine: QuestionGameRoomEngine = {
  createInitialState: createDiceState,
  applyCommand: applyDiceCommand,
  onPlayerLeave: leaveDice,
};

export const relayQuestionGameRoomEngine: QuestionGameRoomEngine = {
  createInitialState: createRelayState,
  applyCommand: applyRelayCommand,
  onPlayerLeave: leaveRelay,
};

export const kabaQuestionGameRoomEngine: QuestionGameRoomEngine = {
  createInitialState: createKabaState,
  applyCommand: applyKabaCommand,
  onPlayerLeave: leaveKaba,
};

import {
  QUESTION_GAME_RULES,
  isBuiltInQuestionGameId,
  type BuiltInQuestionGameId,
} from "@/lib/question-game-rules";
import { readLadderState } from "@/lib/question-game-room-engines/ladder";
import { readMemoryState } from "@/lib/question-game-room-engines/memory";
import { readMysteryState } from "@/lib/question-game-room-engines/mystery";
import {
  readDiceState,
  readKabaState,
  readRelayState,
  readStoryDiceState,
  type TurnGamePlayer,
} from "@/lib/question-game-room-engines/turn-games";
import {
  pointParticipantsForRoom,
  type GameRoom,
  type RoomPlayer,
} from "@/lib/question-games-data";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface StoredGameContribution {
  studentId: string;
  studentName: string;
  validQuestions: number;
  activityScore: number;
  questions: string[];
  isWinner: boolean;
}

export class QuestionGameScoreEvidenceError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "QuestionGameScoreEvidenceError";
  }
}

function rejectEvidence(message: string): never {
  throw new QuestionGameScoreEvidenceError(message);
}

function hasSameIds(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    actual.every((id) => expected.includes(id));
}

function requireRoomPlayers(
  room: GameRoom,
  gameId: BuiltInQuestionGameId,
): Map<string, RoomPlayer> {
  const participants = pointParticipantsForRoom(room);
  const { min, max } = QUESTION_GAME_RULES[gameId].multiplayer;
  if (participants.length < min || participants.length > max) {
    rejectEvidence("질문놀이 참가 인원 범위를 확인할 수 없습니다");
  }
  const byId = new Map<string, RoomPlayer>();
  for (const player of participants) {
    if (!player.id || byId.has(player.id)) {
      rejectEvidence("질문놀이 참가자 정보가 손상되었습니다");
    }
    byId.set(player.id, player);
  }
  if (
    participants.filter(({ isHost }) => isHost).length !== 1 ||
    !byId.has(room.hostId)
  ) {
    rejectEvidence("질문놀이 방장 참가자 정보를 확인할 수 없습니다");
  }
  return byId;
}

function requireNamedPlayers(
  roomPlayers: ReadonlyMap<string, RoomPlayer>,
  statePlayers: readonly TurnGamePlayer[],
): void {
  if (!hasSameIds(
    statePlayers.map(({ id }) => id),
    [...roomPlayers.keys()],
  )) {
    rejectEvidence("저장된 질문놀이 참가자 정보가 현재 방과 맞지 않습니다");
  }
  for (const player of statePlayers) {
    if (roomPlayers.get(player.id)?.name !== player.name) {
      rejectEvidence("저장된 질문놀이 참가자 이름이 현재 방과 맞지 않습니다");
    }
  }
}

function requirePlayerIds(
  roomPlayers: ReadonlyMap<string, RoomPlayer>,
  statePlayerIds: readonly string[],
): void {
  if (!hasSameIds(statePlayerIds, [...roomPlayers.keys()])) {
    rejectEvidence("저장된 질문놀이 참가자 정보가 현재 방과 맞지 않습니다");
  }
}

function requirePlayerName(
  roomPlayers: ReadonlyMap<string, RoomPlayer>,
  playerId: string,
  playerName: string,
): void {
  if (roomPlayers.get(playerId)?.name !== playerName) {
    rejectEvidence("저장된 질문놀이 참가자 이름을 확인할 수 없습니다");
  }
}

function requireScoreKeys(
  roomPlayers: ReadonlyMap<string, RoomPlayer>,
  scores: Readonly<Record<string, number>>,
): void {
  requirePlayerIds(roomPlayers, Object.keys(scores));
}

function requireCompletedV2Room(room: GameRoom): BuiltInQuestionGameId {
  if (!isBuiltInQuestionGameId(room.gameId)) {
    rejectEvidence("서버 점수 근거를 지원하지 않는 질문놀이입니다");
  }
  if (room.status !== "ended") {
    rejectEvidence("끝난 질문놀이만 점수 근거로 사용할 수 있습니다");
  }
  if (typeof room.playId !== "string" || !UUID_V4_PATTERN.test(room.playId)) {
    rejectEvidence("질문놀이 실행 식별값을 확인할 수 없습니다");
  }
  if (room.pointEvidenceVersion !== 2 || room.pointAwardKeyVersion !== 2) {
    rejectEvidence("질문놀이 점수 근거 버전을 확인할 수 없습니다");
  }
  if (room.gameState.stateVersion !== 2) {
    rejectEvidence("질문놀이 상태 버전을 확인할 수 없습니다");
  }
  if (
    room.gameState.phase !== "done" ||
    room.gameState.endReason !== "completed"
  ) {
    rejectEvidence("목표를 완료한 질문놀이만 점수 근거로 사용할 수 있습니다");
  }
  return room.gameId;
}

function makeQuestionMaps(players: Iterable<string>) {
  const questions = new Map<string, string[]>();
  const activityScores = new Map<string, number>();
  for (const playerId of players) {
    questions.set(playerId, []);
    activityScores.set(playerId, 0);
  }
  return { questions, activityScores };
}

function addQuestion(
  roomPlayers: ReadonlyMap<string, RoomPlayer>,
  questions: Map<string, string[]>,
  activityScores: Map<string, number>,
  playerId: string,
  playerName: string,
  question: string,
): void {
  requirePlayerName(roomPlayers, playerId, playerName);
  const stored = questions.get(playerId);
  if (!stored) {
    rejectEvidence("저장된 질문의 참가자 정보를 확인할 수 없습니다");
  }
  stored.push(question);
  activityScores.set(playerId, (activityScores.get(playerId) ?? 0) + 1);
}

function requireQuestionLimits(
  gameId: BuiltInQuestionGameId,
  questions: ReadonlyMap<string, readonly string[]>,
): void {
  const scoreRule = QUESTION_GAME_RULES[gameId].score;
  let roomTotal = 0;
  for (const playerQuestions of questions.values()) {
    if (playerQuestions.length > scoreRule.maxValidQuestionsPerPlayer) {
      rejectEvidence("학생별 질문놀이 점수 근거 상한을 넘었습니다");
    }
    roomTotal += playerQuestions.length;
  }
  if (
    "maxValidQuestionsPerRoom" in scoreRule &&
    roomTotal > scoreRule.maxValidQuestionsPerRoom
  ) {
    rejectEvidence("방 전체 질문놀이 점수 근거 상한을 넘었습니다");
  }
}

export function buildQuestionGameScoreEvidence(
  room: GameRoom,
  studentIds: ReadonlySet<string>,
): StoredGameContribution[] {
  const gameId = requireCompletedV2Room(room);
  const roomPlayers = requireRoomPlayers(room, gameId);
  const { questions, activityScores } = makeQuestionMaps(roomPlayers.keys());

  switch (gameId) {
    case "memory": {
      const state = readMemoryState(room.gameState);
      if (!state) rejectEvidence("저장된 짝 찾기 점수 근거가 손상되었습니다");
      requirePlayerIds(roomPlayers, state.turnOrder);
      requireScoreKeys(roomPlayers, state.scores);
      for (const [playerId, score] of Object.entries(state.scores)) {
        activityScores.set(playerId, score);
      }
      break;
    }
    case "story-dice": {
      const state = readStoryDiceState(room.gameState);
      if (!state) rejectEvidence("저장된 이야기 주사위 점수 근거가 손상되었습니다");
      requireNamedPlayers(roomPlayers, state.players);
      for (const pair of state.pairs) {
        addQuestion(
          roomPlayers,
          questions,
          activityScores,
          pair.playerId,
          pair.playerName,
          pair.question,
        );
      }
      break;
    }
    case "dice": {
      const state = readDiceState(room.gameState);
      if (!state) rejectEvidence("저장된 질문 주사위 점수 근거가 손상되었습니다");
      requireNamedPlayers(roomPlayers, state.players);
      for (const record of state.questions) {
        addQuestion(
          roomPlayers,
          questions,
          activityScores,
          record.playerId,
          record.playerName,
          record.question,
        );
      }
      break;
    }
    case "ladder": {
      const state = readLadderState(room.gameState);
      if (!state) rejectEvidence("저장된 질문 사다리 점수 근거가 손상되었습니다");
      requirePlayerIds(roomPlayers, state.roundPlayerIds);
      for (const record of state.questions) {
        addQuestion(
          roomPlayers,
          questions,
          activityScores,
          record.playerId,
          record.playerName,
          record.question,
        );
      }
      break;
    }
    case "relay": {
      const state = readRelayState(room.gameState);
      if (!state) rejectEvidence("저장된 질문 릴레이 점수 근거가 손상되었습니다");
      requireNamedPlayers(roomPlayers, state.players);
      if (room.topic !== state.topic) {
        rejectEvidence("저장된 질문 릴레이 주제가 현재 방과 맞지 않습니다");
      }
      for (const record of state.questions) {
        addQuestion(
          roomPlayers,
          questions,
          activityScores,
          record.playerId,
          record.playerName,
          record.question,
        );
      }
      break;
    }
    case "mystery-box": {
      const state = readMysteryState(room.gameState);
      if (!state) rejectEvidence("저장된 미스터리 박스 점수 근거가 손상되었습니다");
      requirePlayerIds(roomPlayers, state.turnOrder);
      requireScoreKeys(roomPlayers, state.scores);
      for (const item of state.history) {
        requirePlayerName(roomPlayers, item.playerId, item.playerName);
        if (item.kind === "question") {
          addQuestion(
            roomPlayers,
            questions,
            activityScores,
            item.playerId,
            item.playerName,
            item.question,
          );
        }
      }
      for (const [playerId, score] of Object.entries(state.scores)) {
        if (activityScores.get(playerId) !== score) {
          rejectEvidence("저장된 미스터리 박스 질문 수와 점수가 맞지 않습니다");
        }
      }
      break;
    }
    case "kaba": {
      const state = readKabaState(room.gameState);
      if (!state) rejectEvidence("저장된 까바 놀이 점수 근거가 손상되었습니다");
      requireNamedPlayers(roomPlayers, state.players);
      requireScoreKeys(roomPlayers, state.scores);
      for (const attempt of state.attempts) {
        requirePlayerName(roomPlayers, attempt.playerId, attempt.playerName);
        if (attempt.correct) {
          addQuestion(
            roomPlayers,
            questions,
            activityScores,
            attempt.playerId,
            attempt.playerName,
            attempt.question,
          );
        }
      }
      for (const [playerId, score] of Object.entries(state.scores)) {
        if (activityScores.get(playerId) !== score) {
          rejectEvidence("저장된 까바 놀이 정답 수와 점수가 맞지 않습니다");
        }
      }
      break;
    }
  }

  requireQuestionLimits(gameId, questions);
  const scoreRule = QUESTION_GAME_RULES[gameId].score;
  const topScore = Math.max(0, ...activityScores.values());

  return pointParticipantsForRoom(room)
    .filter(({ id }) => studentIds.has(id))
    .map((player) => {
      const playerQuestions = questions.get(player.id) ?? [];
      const activityScore = activityScores.get(player.id) ?? 0;
      return {
        studentId: player.id,
        studentName: player.name,
        validQuestions: playerQuestions.length,
        activityScore,
        questions: [...playerQuestions],
        isWinner:
          scoreRule.competitiveWinner &&
          topScore > 0 &&
          activityScore === topScore,
      };
    });
}

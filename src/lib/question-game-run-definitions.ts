import type { QuestionGameRunDefinition } from "@/lib/question-game-run-definition";
import { diceRunDefinition } from "@/lib/question-game-dice-definition";
import { relayRunDefinition } from "@/lib/question-game-relay-definition";

const definitions = new Map<string, QuestionGameRunDefinition>([
  [relayRunDefinition.gameId, relayRunDefinition],
  [diceRunDefinition.gameId, diceRunDefinition],
]);

export function findQuestionGameRunDefinition(
  gameId: string,
): QuestionGameRunDefinition | undefined {
  return definitions.get(gameId);
}

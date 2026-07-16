import type { QuestionGameRunDefinition } from "@/lib/question-game-run-definition";
import { diceRunDefinition } from "@/lib/question-game-dice-definition";
import { kabaRunDefinition } from "@/lib/question-game-kaba-definition";
import { ladderRunDefinition } from "@/lib/question-game-ladder-definition";
import { relayRunDefinition } from "@/lib/question-game-relay-definition";

const definitions = new Map<string, QuestionGameRunDefinition>([
  [relayRunDefinition.gameId, relayRunDefinition],
  [diceRunDefinition.gameId, diceRunDefinition],
  [ladderRunDefinition.gameId, ladderRunDefinition],
  [kabaRunDefinition.gameId, kabaRunDefinition],
]);

export function findQuestionGameRunDefinition(
  gameId: string,
): QuestionGameRunDefinition | undefined {
  return definitions.get(gameId);
}

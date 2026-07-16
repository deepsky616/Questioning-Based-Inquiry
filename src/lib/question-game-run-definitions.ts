import type { QuestionGameRunDefinition } from "@/lib/question-game-run-definition";
import { diceRunDefinition } from "@/lib/question-game-dice-definition";
import { kabaRunDefinition } from "@/lib/question-game-kaba-definition";
import { ladderRunDefinition } from "@/lib/question-game-ladder-definition";
import { memoryRunDefinition } from "@/lib/question-game-memory-definition";
import { mysteryRunDefinition } from "@/lib/question-game-mystery-definition";
import { relayRunDefinition } from "@/lib/question-game-relay-definition";
import { storyDiceRunDefinition } from "@/lib/question-game-story-dice-definition";

const definitions = new Map<string, QuestionGameRunDefinition>([
  [relayRunDefinition.gameId, relayRunDefinition],
  [diceRunDefinition.gameId, diceRunDefinition],
  [ladderRunDefinition.gameId, ladderRunDefinition],
  [kabaRunDefinition.gameId, kabaRunDefinition],
  [storyDiceRunDefinition.gameId, storyDiceRunDefinition],
  [memoryRunDefinition.gameId, memoryRunDefinition],
  [mysteryRunDefinition.gameId, mysteryRunDefinition],
]);

export function findQuestionGameRunDefinition(
  gameId: string,
): QuestionGameRunDefinition | undefined {
  return definitions.get(gameId);
}

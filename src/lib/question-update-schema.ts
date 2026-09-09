import { z } from "zod";

export const patchQuestionSchema = z.object({
  content: z.string().min(1).max(200).optional(),
  closure: z.enum(["closed", "open"]).optional(),
  cognitive: z.enum(["factual", "conceptual", "controversial"]).optional(),
  closureScore: z.number().min(0).max(1).optional(),
  cognitiveScore: z.number().min(0).max(1).optional(),
  isPublic: z.boolean().optional(),
  flagged: z.boolean().optional(),
  reviewReason: z.string().trim().max(400).optional(),
});

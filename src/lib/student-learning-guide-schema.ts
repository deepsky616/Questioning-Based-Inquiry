import { z } from "zod";

const studentKeywordSchema = z.object({
  term: z.string().max(80),
  meaning: z.string().max(240),
});

export const studentLearningGuidesSchema = z.object({
  coreIdea: z.object({
    explanation: z.string().max(500),
    lifeConnection: z.string().max(500),
    keywords: z.array(studentKeywordSchema).max(5),
  }).optional(),
  achievements: z.array(z.object({
    index: z.number().int().min(0),
    explanation: z.string().max(500),
  })).max(30).optional(),
  coreSentences: z.array(z.object({
    index: z.number().int().min(0),
    explanation: z.string().max(500),
  })).max(20),
  essentialQuestions: z.array(z.object({
    index: z.number().int().min(0),
    thinkingFocus: z.string().max(500),
    perspectives: z.array(z.string().max(80)).max(3),
  })).max(20),
});

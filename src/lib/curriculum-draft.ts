import { z } from "zod";
import { normalizeStudentInquiryGuide } from "./student-inquiry-guide";
import { normalizeStudentLearningGuides } from "./student-learning-guide";
import type { DraftStorage } from "./practice-draft";

const text = z.string().max(10000);
const texts = z.array(text).max(200);
const indices = z.array(z.number().int().min(0).max(200)).max(200);
const schema = z.object({
  step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).default(1),
  selGrade: text.optional(), selSubject: text.optional(), selAreaId: text.optional(),
  saveTitle: text.optional(), saveGrade: text.optional(), saveDate: text.optional(), unitNameInput: text.optional(),
  selectedUnitCodes: texts.optional(), selectedAchievementCodes: texts.optional(), selectedCoreIdeaLines: texts.optional(),
  selectedKnowledge: texts.optional(), selectedProcess: texts.optional(), selectedValue: texts.optional(),
  recommendedKeywords: texts.optional(), selectedKeywords: texts.optional(), customKeyword: text.optional(),
  coreSentences: texts.optional(), selectedCoreSentenceIndices: indices.optional(),
  essentialQuestions: texts.optional(), selectedEssentialQuestionIndices: indices.optional(),
  inquiryQuestions: z.array(z.object({
    type: z.enum(["factual", "conceptual", "controversial"]), content: text,
    studentGuide: z.unknown().transform(normalizeStudentInquiryGuide).optional(),
  })).max(100).optional(),
  learningGuides: z.unknown().transform(normalizeStudentLearningGuides).optional(),
  pendingDesign: z.object({ id: z.string().min(1).max(150), inputSignature: z.string().max(200000) }).optional(),
  targetClassValue: text.optional(), selectedStudentIds: texts.optional(),
  defaultQuestionPublic: z.boolean().optional(), sessionIsActive: z.boolean().optional(),
  sessionLikesVisible: z.boolean().optional(), sessionCommentsVisible: z.boolean().optional(),
});
export type CurriculumDraft = z.infer<typeof schema>;
export interface SavedCurriculumDraft { value: CurriculumDraft; updatedAt: number }
const key = (teacherId: string) => `question-lab:curriculum-draft:${teacherId}`;
export function readCurriculumDraft(storage: DraftStorage, teacherId: string, now = Date.now()): SavedCurriculumDraft | null {
  if (!teacherId) return null;
  const raw = storage.getItem(key(teacherId));
  if (!raw) return null;
  try {
    if (raw.length > 500000) return null;
    const stored = JSON.parse(raw);
    if (stored.version !== 1 || stored.teacherId !== teacherId || !Number.isFinite(stored.updatedAt) || stored.updatedAt > now || now - stored.updatedAt > 7 * 86400000) return null;
    return { value: schema.parse(stored.value), updatedAt: stored.updatedAt };
  } catch { return null; }
}
export function writeCurriculumDraft(storage: DraftStorage, teacherId: string, value: unknown, now = Date.now()) {
  if (!teacherId) throw new Error("교사 계정이 필요합니다");
  const stored = JSON.stringify({ version: 1, teacherId, value: schema.parse(value), updatedAt: now });
  if (stored.length > 500000) throw new Error("초안 저장 용량을 초과했습니다");
  storage.setItem(key(teacherId), stored);
}
export function clearCurriculumDraft(storage: DraftStorage, teacherId: string) { storage.removeItem(key(teacherId)); }

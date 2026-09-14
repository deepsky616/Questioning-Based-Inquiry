import { z } from "zod";
import { AiInvalidResponseError } from "./ai-errors";
import { extractJsonObject } from "./json-extract";
import { buildPrompt, unitDesignGenerateSchema } from "./unit-design-prompt";
import { buildStudentGuideRepairPrompt, validateStudentGuideBundle, type CompleteStudentGuideBundle } from "./student-guide-completeness";

type DesignInput = z.infer<typeof unitDesignGenerateSchema>;
type Generate = (prompt: string, responseJsonSchema?: unknown) => Promise<string>;

const textField = { type: "string", minLength: 1, maxLength: 60 };
const objectField = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const listField = (items: unknown, count: number) => ({ type: "array", items, minItems: count, maxItems: count });
const keywordField = objectField({ term: textField, meaning: textField });
const indexedExplanation = objectField({ index: { type: "integer", minimum: 0 }, explanation: textField });

function guideResponseSchema(data: DesignInput): unknown {
  if (data.step !== "learning_guides" && data.step !== "student_guides") return undefined;
  const guides = listField(objectField({
    index: { type: "integer", minimum: 0 }, meaning: textField, thinkingStart: textField,
    keywords: listField(keywordField, 2),
  }), data.inquiryQuestions?.length ?? 0);
  if (data.step === "student_guides") return objectField({ guides });
  return objectField({
    learningGuides: objectField({
      coreIdea: objectField({ explanation: textField, lifeConnection: textField, keywords: listField(keywordField, 3) }),
      achievements: listField(indexedExplanation, data.achievements.length),
      coreSentences: listField(indexedExplanation, data.coreSentences.length),
      essentialQuestions: listField(objectField({ index: { type: "integer", minimum: 0 }, thinkingFocus: textField, perspectives: listField(textField, 2) }), data.essentialQuestions.length),
    }),
    guides,
  });
}

const inquiryGuidesSchema = z.object({
  guides: z.array(z.object({
    index: z.number().int().nonnegative(),
    meaning: z.string().trim().min(1),
    thinkingStart: z.string().trim().min(1),
    keywords: z.array(z.object({ term: z.string().trim().min(1), meaning: z.string().trim().min(1) })).max(5),
  })),
});

const textList = z.array(z.string().trim().min(1));
const indexList = z.array(z.number().int().nonnegative());
const designResultSchemas = {
  keywords: z.object({ keywords: textList.min(1) }),
  sentences: z.object({ sentences: textList.min(1) }),
  questions: z.object({ questions: textList.min(1) }),
  inquiry: z.object({ inquiryQuestions: z.array(z.object({ type: z.enum(["factual", "conceptual", "controversial"]), content: z.string().trim().min(1) })).min(1) }),
  recommend_achievements: z.object({ recommendedCodes: textList }),
  recommend_by_unit: z.object({ recommendedCodes: textList, knowledgeIdx: indexList, processIdx: indexList, valueIdx: indexList }),
};

function expectedCounts(data: DesignInput) {
  return {
    achievementCount: data.achievements.length,
    coreSentenceCount: data.coreSentences.length,
    essentialQuestionCount: data.essentialQuestions.length,
    inquiryQuestionCount: data.inquiryQuestions?.length ?? 0,
  };
}

async function generatePart(data: DesignInput, generate: Generate): Promise<unknown> {
  const prompt = `${buildPrompt(data)}\n\n[응답 길이]\n설명과 생각 단서는 각각 60자 이내, 낱말 뜻과 관점은 각각 30자 이내로 간결하게 쓰세요. 핵심 아이디어 낱말은 3개, 탐구 질문별 낱말은 2개로 작성하세요. 항목을 빠뜨리지 말고 닫는 괄호까지 완성된 JSON만 출력하세요.`;
  let nextPrompt = prompt;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await generate(nextPrompt, guideResponseSchema(data));
    let parsed: unknown;
    try { parsed = extractJsonObject(raw); } catch { parsed = null; }
    let issues: string[];
    if (data.step === "learning_guides") {
      const checked = validateStudentGuideBundle(parsed, expectedCounts(data));
      if (checked.ok) return checked.value;
      issues = checked.issues;
    } else if (data.step === "student_guides") {
      const checked = inquiryGuidesSchema.safeParse(parsed);
      const count = data.inquiryQuestions?.length ?? 0;
      if (checked.success && checked.data.guides.length === count &&
        checked.data.guides.map(guide => guide.index).sort((a, b) => a - b).every((index, position) => index === position)) {
        return checked.data;
      }
      issues = ["모든 질문의 설명과 생각 단서, 중복 없는 원래 번호가 필요합니다."];
    } else {
      const checked = designResultSchemas[data.step].safeParse(parsed);
      if (checked.success) return checked.data;
      throw new AiInvalidResponseError();
    }
    nextPrompt = buildStudentGuideRepairPrompt(prompt, raw, issues);
  }
  throw new AiInvalidResponseError();
}

/** 각 묶음을 검증하고 원래 번호로 합친 완성본만 반환한다. 도중 실패한 부분 결과는 반환하지 않는다. */
export async function generateUnitDesignData(data: DesignInput, generate: Generate): Promise<unknown> {
  if (data.step !== "student_guides" && data.step !== "learning_guides") return generatePart(data, generate);
  const count = Math.max(1, Math.ceil((data.inquiryQuestions?.length ?? 0) / 2),
    ...(data.step === "learning_guides"
      ? [Math.ceil(data.achievements.length / 2), Math.ceil(data.coreSentences.length / 2), data.essentialQuestions.length]
      : []));
  if (count === 1) return generatePart(data, generate);

  const parts: unknown[] = [];
  for (let batch = 0; batch < count; batch++) {
    parts.push(await generatePart({
      ...data,
      achievements: data.achievements.slice(batch * 2, batch * 2 + 2),
      coreSentences: data.coreSentences.slice(batch * 2, batch * 2 + 2),
      essentialQuestions: data.essentialQuestions.slice(batch, batch + 1),
      inquiryQuestions: data.inquiryQuestions?.slice(batch * 2, batch * 2 + 2),
    }, generate));
  }
  if (data.step === "student_guides") {
    return { guides: parts.flatMap((part, batch) => inquiryGuidesSchema.parse(part).guides.map(guide => ({ ...guide, index: guide.index + batch * 2 }))) };
  }
  const bundles = parts as CompleteStudentGuideBundle[];
  const combined = {
    learningGuides: {
      coreIdea: bundles[0].learningGuides.coreIdea,
      achievements: bundles.flatMap((part, batch) => (part.learningGuides.achievements ?? []).map(guide => ({ ...guide, index: guide.index + batch * 2 }))),
      coreSentences: bundles.flatMap((part, batch) => part.learningGuides.coreSentences.map(guide => ({ ...guide, index: guide.index + batch * 2 }))),
      essentialQuestions: bundles.flatMap((part, batch) => part.learningGuides.essentialQuestions.map(guide => ({ ...guide, index: guide.index + batch }))),
    },
    guides: bundles.flatMap((part, batch) => part.guides.map(guide => ({ ...guide, index: guide.index + batch * 2 }))),
  };
  const checked = validateStudentGuideBundle(combined, expectedCounts(data));
  if (!checked.ok) throw new AiInvalidResponseError();
  return checked.value;
}

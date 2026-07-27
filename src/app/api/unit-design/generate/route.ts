import { logger } from "@/lib/logger";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { buildPrompt, unitDesignGenerateSchema } from "@/lib/unit-design-prompt";
import { extractJsonObject } from "@/lib/json-extract";
import { generateText, AiKeyMissingError } from "@/lib/ai";
import {
  buildStudentGuideRepairPrompt,
  validateStudentGuideBundle,
} from "@/lib/student-guide-completeness";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const limited = checkRateLimit(`unit-design-generate:${(session.user as { id: string }).id}`, 10);
  if (limited) return limited;

  const userRole = (session.user as { role?: string }).role;
  if (userRole !== "TEACHER") {
    return NextResponse.json({ error: "교사만 사용할 수 있습니다" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const data = unitDesignGenerateSchema.parse(body);

    const prompt = buildPrompt(data);
    const generate = (nextPrompt: string) => generateText({
      userId: (session.user as { id: string }).id,
      prompt: nextPrompt,
      req,
      localize: true,
      quality: true,
    });
    const aiFailureResponse = (aiErr: unknown) => {
      if (aiErr instanceof AiKeyMissingError) {
        return NextResponse.json({ error: "AI 설정이 필요합니다. 설정 페이지에서 API 키를 등록해 주세요." }, { status: 400 });
      }
      const detail = aiErr instanceof Error ? aiErr.message : String(aiErr);
      logger.error("Gemini API call failed:", detail);
      return NextResponse.json({
        error: "AI 호출에 실패했어요. 설정 페이지에서 API 키와 모델을 확인해주세요.",
        detail,
      }, { status: 502 });
    };

    let text: string;
    try {
      text = await generate(prompt);
    } catch (aiErr) {
      return aiFailureResponse(aiErr);
    }

    let parsed: unknown;
    try {
      parsed = extractJsonObject(text);
    } catch (parseErr) {
      if (data.step === "learning_guides") {
        parsed = null;
      } else {
        const detail = parseErr instanceof Error ? parseErr.message : String(parseErr);
        logger.error("AI response parse failed:", `${detail} | raw: ${text?.slice(0, 500)}`);
        return NextResponse.json({
          error: "AI 응답을 이해할 수 없어요. 다시 시도해주세요.",
          detail,
          rawPreview: text?.slice(0, 200),
        }, { status: 502 });
      }
    }

    if (data.step === "learning_guides") {
      const expected = {
        achievementCount: data.achievements.length,
        coreSentenceCount: data.coreSentences.length,
        essentialQuestionCount: data.essentialQuestions.length,
        inquiryQuestionCount: data.inquiryQuestions?.length ?? 0,
      };
      let checked = validateStudentGuideBundle(parsed, expected);
      if (!checked.ok) {
        try {
          text = await generate(buildStudentGuideRepairPrompt(prompt, text, checked.issues));
        } catch (aiErr) {
          return aiFailureResponse(aiErr);
        }
        try {
          parsed = extractJsonObject(text);
        } catch {
          parsed = null;
        }
        checked = validateStudentGuideBundle(parsed, expected);
      }
      if (!checked.ok) {
        return NextResponse.json({
          error: "학생용 설명을 완전하게 만들지 못했어요. 다시 시도해 주세요.",
          detail: checked.issues.join("; "),
        }, { status: 502 });
      }
      return NextResponse.json(checked.value);
    }

    return NextResponse.json(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: "입력 형식이 올바르지 않습니다",
        detail: error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
      }, { status: 400 });
    }
    const detail = error instanceof Error ? error.message : String(error);
    logger.error("unit-design generate error:", detail);
    return NextResponse.json({
      error: "서버 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
      detail,
    }, { status: 500 });
  }
}

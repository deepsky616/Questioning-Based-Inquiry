import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { requireTeacherSession } from "@/lib/session-helpers";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { logger } from "@/lib/logger";
import { listTeacherQuestionExportRows, QuestionRouteError } from "@/lib/question-route-service";
import { createQuestionWorkbook } from "@/lib/question-export-workbook";

export const runtime = "nodejs";

const locale = z.enum(["ko", "en"]).default("ko");
const bodySchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("filtered"), locale }).strict(),
  z.object({ scope: z.literal("selected"), locale, questionIds: z.array(z.string().trim().min(1).max(200)).min(1).max(100) }).strict(),
]);

export async function POST(req: Request) {
  const result = requireTeacherSession(await auth());
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || new URL(req.url).search.length > 4000) {
    return NextResponse.json({ error: "다운로드 범위를 확인해 주세요." }, { status: 400 });
  }
  const limited = checkRateLimit(`question-export:${result.user.id}`, 10);
  if (limited) return limited;
  try {
    const options = parsed.data;
    const rows = await listTeacherQuestionExportRows(req, result.user, options.scope === "selected" ? options.questionIds : undefined);
    const { buffer, filename } = await createQuestionWorkbook(rows, { ...options, searchParams: new URL(req.url).searchParams });
    return new Response(new Uint8Array(buffer), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="student-questions.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Question-Count": String(rows.length),
    } });
  } catch (error) {
    if (error instanceof QuestionRouteError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    logger.error("Question export error:", error);
    return NextResponse.json({ error: "엑셀 파일을 만들지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
}

import writeExcelFile, { type Cell, type Row } from "write-excel-file/node";
import { createTranslator } from "next-intl";
import ko from "../../messages/ko.json";
import en from "../../messages/en.json";
import type { listTeacherQuestionExportRows } from "@/lib/question-route-service";

type ExportQuestion = Awaited<ReturnType<typeof listTeacherQuestionExportRows>>[number];

function koreanDateTime(value: Date): string {
  // 서버의 시간대와 무관하게 다운로드 기록과 작성 시각은 한국시간으로 표시한다.
  return new Date(value.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ");
}

export async function createQuestionWorkbook(rows: ExportQuestion[], options: {
  scope: "filtered" | "selected";
  locale: "ko" | "en";
  searchParams: URLSearchParams;
  generatedAt?: Date;
}) {
  const { locale, scope, searchParams } = options;
  const messages = locale === "en" ? en : ko;
  const t = createTranslator({ locale, messages, namespace: "teacherQ.excel" });
  const classification = createTranslator({ locale, messages, namespace: "classification" });
  const generatedAt = koreanDateTime(options.generatedAt ?? new Date());
  // 문자열은 명시적으로 텍스트 셀로 기록해 수식 모양의 질문도 원문 그대로 보존한다.
  const cell = (value: string | number | null | undefined): Cell => typeof value === "number"
    ? { value, type: Number, alignVertical: "top", format: "#,##0" }
    : { value: value ?? "", type: String, wrap: true, alignVertical: "top" };
  const columns = [
    ["rowNumber", 8], ["sessionDate", 14], ["subject", 12], ["topic", 30],
    ["grade", 8], ["className", 8], ["studentNumber", 10], ["studentName", 16],
    ["content", 64], ["closure", 18], ["cognitive", 18], ["createdAt", 24],
    ["likes", 12], ["comments", 12], ["visibility", 12], ["flagged", 18],
    ["flaggedComment", 18], ["flagReason", 36],
  ] as const;
  const header: Row = columns.map(([key]) => ({
    value: t(`columns.${key}`), type: String, fontWeight: "bold", backgroundColor: "#1E3A5F",
    textColor: "#FFFFFF", wrap: true, height: 32, alignVertical: "center",
  }));
  const closureLabel = (value: string) => value === "open" || value === "closed"
    ? classification(`${value}.label`) : classification("unclassified");
  const cognitiveLabel = (value: string) => value === "factual" || value === "conceptual" || value === "controversial"
    ? classification(`${value}.label`) : classification("unclassified");
  const data: Row[] = rows.map((question, index) => [
    index + 1, question.session?.date, question.session?.subject, question.session?.topic,
    question.author.grade, question.author.className, question.author.studentNumber, question.author.name,
    question.content, closureLabel(question.closure), cognitiveLabel(question.cognitive), koreanDateTime(question.createdAt),
    question._count.likes, question._count.comments, t(question.isPublic ? "public" : "private"),
    t(question.flagged ? "yes" : "no"), t(question.comments.length ? "yes" : "no"), question.flagReason,
  ].map(cell));
  const sort = (["student", "comment", "like"] as const).find(key =>
    ["asc", "desc"].includes(searchParams.get(`${key}Sort`) ?? "")) ?? "createdAt";
  const dir = sort === "createdAt" || searchParams.get(`${sort}Sort`) === "desc" ? "desc" : "asc";
  const sessionId = searchParams.get("sessionId");
  const selectedSession = rows[0]?.session;
  const info: Row[] = [
    [t("info.scope"), t(scope === "selected" ? "selectedScope" : "filteredScope")],
    [t("info.count"), rows.length], [t("info.exportedAt"), generatedAt],
    [t("info.session"), sessionId && sessionId !== "all"
      ? selectedSession ? [selectedSession.date, selectedSession.subject, selectedSession.topic].join(" · ") : t("noSession")
      : t("allSessions")],
    [t("info.search"), searchParams.get("search") || t("notApplied")],
    [t("info.date"), searchParams.get("date") || t("notApplied")],
    [t("info.subject"), searchParams.get("subject") || t("notApplied")],
    [t("info.topic"), searchParams.get("topic") || t("notApplied")],
    [t("columns.closure"), searchParams.has("closure") ? closureLabel(searchParams.get("closure")!) : t("notApplied")],
    [t("columns.cognitive"), searchParams.has("cognitive") ? cognitiveLabel(searchParams.get("cognitive")!) : t("notApplied")],
    [t("info.flagged"), t(["1", "true"].includes(searchParams.get("flagged") ?? "") ? "yes" : "no")],
    [t("info.sort"), t(`sort.${sort}`) + " · " + t(`sort.${dir}`)],
    [t("info.note"), t("workbookNote")],
  ].map(row => row.map(cell));
  const buffer = await writeExcelFile([
    { sheet: t("sheetQuestions"), data: [header, ...data], columns: columns.map(([, width]) => ({ width })), stickyRowsCount: 1 },
    { sheet: t("sheetInfo"), data: info, columns: [{ width: 24 }, { width: 80 }] },
  ], { fontFamily: "맑은 고딕", fontSize: 11 }).toBuffer();
  return { buffer, filename: `${t("filename")}_${generatedAt.replace(/[-:]/g, "").replace(" ", "_")}.xlsx` };
}

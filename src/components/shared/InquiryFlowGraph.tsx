import {
  buildInquiryGraphSummary,
  type InquiryGraphQuestion,
  type InquiryGraphSharedQuestion,
} from "@/lib/inquiry-graph";
import { COGNITIVE_LABEL, COGNITIVE_STYLE } from "@/lib/question-labels";

interface InquiryFlowGraphProps {
  title: string;
  description: string;
  subject?: string;
  topic?: string;
  sharedQuestions: InquiryGraphSharedQuestion[];
  studentQuestions: InquiryGraphQuestion[];
  audience: "teacher" | "student";
}

const COGNITIVE_KEYS = ["factual", "conceptual", "controversial"] as const;

function MiniBar({ value, total, color }: { value: number; total: number; color: string }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

export function InquiryFlowGraph({
  title,
  description,
  subject,
  topic,
  sharedQuestions,
  studentQuestions,
  audience,
}: InquiryFlowGraphProps) {
  const summary = buildInquiryGraphSummary(sharedQuestions, studentQuestions);
  const hasSharedQuestions = summary.sharedQuestionCount > 0;
  const hasStudentQuestions = summary.studentQuestionCount > 0;

  return (
    <div className="rounded-xl border border-indigo-100 bg-white shadow-sm">
      <div className="border-b border-indigo-100 bg-indigo-50 px-4 py-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-indigo-900">{title}</p>
            <p className="mt-0.5 text-xs text-indigo-600">{description}</p>
          </div>
          {(subject || topic) && (
            <div className="text-xs text-indigo-700 sm:text-right">
              {subject && <span className="font-medium">{subject}</span>}
              {subject && topic && <span> · </span>}
              {topic && <span>{topic}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-600">선생님의 탐구 질문</p>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {summary.sharedQuestionCount}개
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {hasSharedQuestions ? (
              sharedQuestions
                .filter((question) => question.content.trim())
                .slice(0, 4)
                .map((question, index) => (
                  <div key={`${question.type}-${index}`} className="rounded-md bg-white px-3 py-2 text-xs text-gray-700 shadow-sm">
                    <span className="mr-1 font-medium text-indigo-600">
                      {COGNITIVE_LABEL[question.type] ?? question.type}
                    </span>
                    {question.content}
                  </div>
                ))
            ) : (
              <p className="rounded-md border border-dashed border-gray-300 bg-white px-3 py-4 text-center text-xs text-gray-400">
                연결된 탐구 질문이 없습니다
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-indigo-200 bg-white text-center text-xs font-semibold text-indigo-700 shadow-sm">
            질문
            <br />
            흐름
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-600">
              {audience === "teacher" ? "학생 질문 반응" : "공개 질문 흐름"}
            </p>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              {summary.studentQuestionCount}개
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {COGNITIVE_KEYS.map((key) => (
              <div key={key} className="rounded-md bg-white p-2 shadow-sm">
                <p className="truncate text-[11px] font-medium text-gray-600">{COGNITIVE_LABEL[key]}</p>
                <p className="mt-1 text-lg font-bold text-gray-900">{summary.byCognitive[key]}</p>
                <MiniBar
                  value={summary.byCognitive[key]}
                  total={Math.max(summary.studentQuestionCount, 1)}
                  color={
                    key === "factual"
                      ? "bg-gray-400"
                      : key === "conceptual"
                        ? "bg-purple-500"
                        : "bg-orange-500"
                  }
                />
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-md bg-white p-2 shadow-sm">
              <p className="text-gray-500">열린 질문</p>
              <p className="text-base font-bold text-green-700">{summary.byClosure.open}</p>
            </div>
            <div className="rounded-md bg-white p-2 shadow-sm">
              <p className="text-gray-500">닫힌 질문</p>
              <p className="text-base font-bold text-blue-700">{summary.byClosure.closed}</p>
            </div>
            <div className="rounded-md bg-white p-2 shadow-sm">
              <p className="text-gray-500">공개 질문</p>
              <p className="text-base font-bold text-indigo-700">{summary.publicQuestionCount}</p>
            </div>
          </div>

          {hasStudentQuestions && (
            <div className="mt-3 space-y-1.5">
              {summary.highlights.map((question, index) => (
                <div key={question.id ?? index} className="rounded-md bg-white px-3 py-2 text-xs text-gray-700 shadow-sm">
                  <span className={`mr-1 rounded px-1.5 py-0.5 ${COGNITIVE_STYLE[question.cognitive ?? "factual"]}`}>
                    {COGNITIVE_LABEL[question.cognitive ?? "factual"] ?? "사실적 질문"}
                  </span>
                  {question.content}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

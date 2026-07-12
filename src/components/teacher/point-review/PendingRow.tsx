"use client";

// AI 추천 포인트 검토의 개별 행 — 학생·판정 배지·근거·결정 버튼.
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bonusLabel, type PendingLog } from "./types";

export function PendingRow({
  p, selected, onToggle, onDecideOne, onOverride, override, setOverride,
}: {
  p: PendingLog; selected: boolean;
  onToggle: () => void;
  onDecideOne: (d: "APPROVE" | "REJECT") => void;
  onOverride: (pts: number) => void;
  override: number | undefined;
  setOverride: (v: number) => void;
}) {
  const t = useTranslations("pointReview");
  const tL = useTranslations("pointLabel");
  const b = bonusLabel(p.bonusType);
  // 경고성 판정(중복·불성실): 0점임을 배지로 명시하고, 오탐 구제를 위해 점수 수정은 허용한다
  const isDup = p.bonusType.includes("FLAGGED");
  const content = p.commentContent || p.questionContent;
  const targetLabel = p.relatedQuestionId ? t("targetQuestion") : t("targetAnswer");
  return (
    <div className={`rounded-xl border border-border p-3 space-y-2 ${selected ? "bg-indigo-50 dark:bg-indigo-950/40" : "bg-card"}`}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1 w-4 h-4 accent-indigo-500" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/teacher-students?studentId=${p.studentId}`}
              className="text-sm font-bold text-foreground underline-offset-2 hover:text-indigo-600 hover:underline"
            >
              {p.studentName}
            </Link>
            <span className="text-xs text-muted-foreground">{t("gradeClass", { grade: p.grade ?? "", className: p.className ?? "" })}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
              style={{ background: b.color }}>
              {b.emoji} {b.labelKey ? tL(b.labelKey) : b.raw}
              {!isDup && <span className="ml-1">{t("pointsSuffix", { points: p.points })}</span>}
            </span>
            {isDup && (
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full border border-red-200 bg-red-50 text-red-600 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-300">
                {t("flaggedZeroPoints")}
              </span>
            )}
            {p.relatedQuestionId && p.questionLikeCount != null && (
              <span className="text-xs font-medium text-rose-500">❤️ {p.questionLikeCount}</span>
            )}
            {/* 중복 지급 방지 안내: 같은 작성물/세션에서 이미 승인된 포인트 */}
            {p.alreadyForTarget > 0 && (
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                {t("alreadyForTarget", { target: targetLabel, points: p.alreadyForTarget })}
              </span>
            )}
            {p.alreadyForTarget === 0 && p.alreadyInSession > 0 && (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                {t("alreadyInSession", { points: p.alreadyInSession })}
              </span>
            )}
          </div>
          <div className="mt-1.5 text-xs">
            <span className="text-muted-foreground">{targetLabel}: </span>
            <span className="text-foreground">{content || t("noContent")}</span>
          </div>
          {p.reason && (
            <div className="mt-1 text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">
              💬 {p.reason}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 pl-7">
        {/* 경고 행에도 점수 수정 개방 — AI 오탐일 때 점수를 주며 구제(0 이상만) */}
        <Input
          type="number"
          min={0}
          value={override ?? ""}
          onChange={(e) => setOverride(Math.max(0, parseInt(e.target.value) || 0))}
          placeholder={isDup ? t("overridePlaceholderFlagged") : t("overridePlaceholder", { points: p.points })}
          className="h-7 w-24 text-xs"
        />
        <Button size="sm" variant="outline" className="h-7 text-xs"
          disabled={!override}
          onClick={() => onOverride(override!)}>
          {t("overrideApprove")}
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={() => onDecideOne("APPROVE")}>
          {t("approve")}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs text-red-500 border-red-200 hover:bg-red-50"
          onClick={() => onDecideOne("REJECT")}>
          {t("reject")}
        </Button>
      </div>
    </div>
  );
}

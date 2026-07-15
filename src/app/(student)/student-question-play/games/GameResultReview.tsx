"use client";

import { useLocale } from "next-intl";
import { getQuestionGameText } from "@/lib/question-game-i18n";

export interface ReviewEntry {
  q: string;
  a?: string;
}

/**
 * 놀이 결과 화면에서 주고받은 질문(-대답)을 깔끔하게 정리해 보여주는 공용 카드.
 * entries가 비어 있으면 아무것도 렌더링하지 않는다.
 */
export function GameResultReview({
  title,
  entries,
  accentColor = "#6366f1",
  qPrefix,
  aPrefix,
}: {
  title: string;
  entries: ReviewEntry[];
  accentColor?: string;
  qPrefix?: string;
  aPrefix?: string;
}) {
  const text = getQuestionGameText(useLocale());
  if (entries.length === 0) return null;
  return (
    <div className="bg-card text-foreground rounded-2xl shadow-sm border border-border p-5 space-y-2 text-left">
      <h3 className="font-black text-foreground text-sm">
        {title} <span className="font-normal text-muted-foreground">· {entries.length}{text.count}</span>
      </h3>
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {entries.map((e, i) => (
          <div key={i} className="rounded-xl bg-secondary p-3">
            <p className="text-sm font-bold text-foreground leading-snug">
              <span style={{ color: accentColor }}>{i + 1}.</span> {qPrefix ? `${qPrefix} ` : ""}{e.q}
            </p>
            {e.a && (
              <p className="mt-1 pl-4 text-sm text-muted-foreground leading-snug">
                ↳ {aPrefix ? `${aPrefix} ` : ""}{e.a}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { isUnclassifiedQuestion } from "@/lib/question-content-quality";
import { CLOSURE_LABEL, CLOSURE_STYLE, COGNITIVE_LABEL, COGNITIVE_STYLE } from "@/lib/question-labels";

export function QuestionTypeBadges({ closure, cognitive }: { closure: string; cognitive: string }) {
  const t = useTranslations("classification");
  const badgeClass = "rounded px-2 py-0.5 text-xs break-keep";
  if (isUnclassifiedQuestion({ closure, cognitive })) {
    return <span className={`${badgeClass} ${CLOSURE_STYLE.unclassified}`} title={t("unclassifiedHelp")}>{t("unclassified")}</span>;
  }
  return <>
    <span className={`${badgeClass} ${CLOSURE_STYLE[closure]}`}>{closure === "closed" || closure === "open" ? t(`${closure}.label`) : CLOSURE_LABEL[closure] ?? closure}</span>
    <span className={`${badgeClass} ${COGNITIVE_STYLE[cognitive]}`}>{cognitive === "factual" || cognitive === "conceptual" || cognitive === "controversial" ? t(`${cognitive}.label`) : COGNITIVE_LABEL[cognitive] ?? cognitive}</span>
  </>;
}

import { Lightbulb, MessageCircle, Sparkles } from "lucide-react";

/** 장식용 질문 친구. 주변 안내 문장이 의미를 전달하므로 읽기 도구에서는 숨긴다. */
export function InquiryCompanion({ small = false }: { small?: boolean }) {
  return (
    <span aria-hidden="true" className={`relative inline-flex shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-sky-800 dark:border-amber-800 dark:bg-amber-950 dark:text-sky-200 ${small ? "h-12 w-12" : "h-16 w-16"}`}>
      <MessageCircle className={small ? "h-8 w-8" : "h-11 w-11"} strokeWidth={1.8} />
      <Lightbulb className={`absolute ${small ? "h-4 w-4" : "h-5 w-5"}`} strokeWidth={2} />
      <Sparkles className="absolute -right-1 -top-1 h-4 w-4 text-amber-600 dark:text-amber-300" />
    </span>
  );
}

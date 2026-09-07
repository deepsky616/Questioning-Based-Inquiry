"use client";

import { toast } from "@/components/ui/use-toast";

const reported = new WeakSet<Error>();

/** 같은 일괄 요청 실패를 여러 수업 행에서 중복으로 알리지 않는다. */
export function reportTranslationFailure(error: Error, message: string, retryLabel: string, retry: () => void) {
  if (reported.has(error)) return;
  reported.add(error);
  toast({
    variant: "destructive",
    description: (
      <span className="flex flex-wrap items-center gap-2">
        <span>{message}</span>
        <button type="button" className="min-h-11 rounded-md px-2 font-bold underline underline-offset-4" onClick={retry}>{retryLabel}</button>
      </span>
    ),
  });
}

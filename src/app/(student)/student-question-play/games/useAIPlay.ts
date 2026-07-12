import { useState, useCallback } from "react";
import { useLocale } from "next-intl";

interface AIPlayOptions {
  action: string;
  context?: Record<string, string>;
  locale?: string;
}

interface AIPlayResult {
  text: string;
  parsed?: Record<string, string>;
  error?: string;
}

export function useAIPlay() {
  const locale = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async (opts: AIPlayOptions): Promise<AIPlayResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/question-games/ai-play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...opts, locale: opts.locale ?? locale }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? (locale === "en" ? "An AI error occurred" : "AI 오류가 발생했습니다"));
        return null;
      }
      return data as AIPlayResult;
    } catch {
      setError(locale === "en" ? "A network error occurred" : "네트워크 오류가 발생했습니다");
      return null;
    } finally {
      setLoading(false);
    }
  }, [locale]);

  return { ask, loading, error };
}

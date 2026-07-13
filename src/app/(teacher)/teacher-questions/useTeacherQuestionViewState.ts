"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  buildTeacherQuestionViewPath,
  parseTeacherQuestionViewState,
  type TeacherQuestionViewState,
} from "@/lib/teacher-question-page-query";

export function useTeacherQuestionViewState() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewState = useMemo(
    () => parseTeacherQuestionViewState(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const viewStateRef = useRef(viewState);
  const [search, setSearch] = useState(viewState.search);
  const pendingSearchRef = useRef<string | null>(null);

  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  const updateViewState = useCallback((
    patch: Partial<TeacherQuestionViewState> |
      ((current: TeacherQuestionViewState) => Partial<TeacherQuestionViewState>),
    options: { history?: "push" | "replace" } = {},
  ) => {
    const changes = typeof patch === "function" ? patch(viewStateRef.current) : patch;
    const next = { ...viewStateRef.current, ...changes };
    viewStateRef.current = next;
    const path = buildTeacherQuestionViewPath(next);
    if (options.history === "replace") {
      router.replace(path, { scroll: false });
    } else {
      router.push(path, { scroll: false });
    }
  }, [router]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("tab") !== "review") return;
    params.set("tab", "points");
    router.replace(`/teacher-points?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    const nextSearch = search.trim();
    if (nextSearch === viewState.search) return;
    const timer = window.setTimeout(() => {
      pendingSearchRef.current = nextSearch;
      updateViewState({ search: nextSearch, page: 1 }, { history: "replace" });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, updateViewState, viewState.search]);

  useEffect(() => {
    if (pendingSearchRef.current === viewState.search) {
      pendingSearchRef.current = null;
      return;
    }
    pendingSearchRef.current = null;
    setSearch(viewState.search);
  }, [viewState.search]);

  return { search, setSearch, updateViewState, viewState };
}

"use client";

import { Suspense, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSessionFilterOptions, filterSessions } from "@/lib/sessions";
import { getSessionUser } from "@/lib/auth-helpers";
import { appNotificationQueryKeys, useAppNotifications } from "@/lib/app-notifications";
import {
  appQueryKeys,
  type StudentQuestionSummary,
  type StudentSessionQuestionResponse,
  useStudentQuestionSummary,
  useStudentSessionQuestion,
  useStudentSessions,
} from "@/lib/app-queries";
import { consumePracticeDraft } from "@/lib/practice-draft";
import { useQuestionDraft } from "@/lib/use-question-draft";
import { isAnalysisCurrent, type AnalysisSnapshot } from "@/lib/student-ask-analysis";
import { isDashboardActionableSessionDate } from "@/lib/dashboard-priority-tasks";
import { useLocalDateKey } from "@/lib/use-local-date-key";
import { useToast } from "@/components/ui/use-toast";
import { useTranslations } from "next-intl";
import { StudentAskCompletionCard } from "./StudentAskCompletionCard";
import { StudentAskInputCard } from "./StudentAskInputCard";
import { StudentAskResultCard } from "./StudentAskResultCard";
import { StudentAskReferencePanel } from "./StudentAskReferencePanel";
import { StudentAskSessionSelector } from "./StudentAskSessionSelector";
import type { ClassificationResult, DesignContext, QuestionSession } from "./types";

const CLASSIFICATION_RETRY_DELAY_MS = 600;

function isRetryableClassificationFallback(result: ClassificationResult): boolean {
  return (
    result.analysisSource === "fallback" &&
    (result.fallbackReason === "busy" || result.fallbackReason === "invalid-response")
  );
}

export default function AskPage() {
  return (
    <Suspense fallback={<AskPageFallback />}>
      <AskContent />
    </Suspense>
  );
}

function AskPageFallback() {
  const t = useTranslations("ask");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t("title")}</h2>
      </div>
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground text-sm">{t("checkingSession")}</CardContent>
      </Card>
    </div>
  );
}

function AskContent() {
  const t = useTranslations("ask");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftAppliedRef = useRef(false);
  const analysisRequestRef = useRef(0);
  const designContextRequestRef = useRef(0);
  const appliedRequestedSessionRef = useRef<string | null | undefined>(undefined);
  const contentRef = useRef("");
  const selectedSessionIdRef = useRef("");
  const { data: authSession } = useSession();
  const user = getSessionUser(authSession);
  const taskParam = searchParams.get("task");
  const requestedSessionId = searchParams.get("sessionId");
  const searchParamString = searchParams.toString();
  const taskScope =
    taskParam === "today-unasked" ||
    taskParam === "future-unasked" ||
    taskParam === "past-unasked" ||
    taskParam === "shared"
      ? taskParam
      : null;

  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const { content, setContent, draftStatus, markSubmitted } = useQuestionDraft(user.id, selectedSessionId);
  const [draftAnnouncement, setDraftAnnouncement] = useState<string | null>(null);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisSnapshot<ClassificationResult> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const sessionsQuery = useStudentSessions<QuestionSession>({ userId: user.id });
  const { data: sessions = [], isError: sessionsError } = sessionsQuery;
  const sessionsLoaded = Boolean(user.id) && sessionsQuery.isSuccess;
  const questionsQuery = useStudentQuestionSummary({ userId: user.id });
  const questionSessionIds = useMemo(
    () => new Set(questionsQuery.data?.answeredSessionIds ?? []),
    [questionsQuery.data?.answeredSessionIds],
  );
  const questionsLoaded = Boolean(user.id) && questionsQuery.isSuccess;
  const questionsError = questionsQuery.isError;
  const existingQuestionQuery = useStudentSessionQuestion({
    userId: user.id,
    sessionId: selectedSessionId,
  });
  const existingQuestion = existingQuestionQuery.data?.existingQuestion ?? null;
  const isCheckingExisting = existingQuestionQuery.isLoading;
  const notificationQuery = useAppNotifications({
    queryKey: appNotificationQueryKeys.student,
    enabled: Boolean(user.id),
  });
  const [designContext, setDesignContext] = useState<DesignContext | null>(null);
  const [showRef, setShowRef] = useState(true);
  const [filterDate, setFilterDate] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterTopic, setFilterTopic] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const result = analysis?.result ?? null;
  const analysisCurrent = isAnalysisCurrent(content, selectedSessionId, analysis);
  const needsQuestionScope = taskScope === "today-unasked" || taskScope === "future-unasked" || taskScope === "past-unasked";
  const scopedTaskDataReady = !needsQuestionScope || (
    questionsLoaded && notificationQuery.isSuccess
  );

  const transitionSession = useCallback((id: string, focusInput = false) => {
    if (id !== selectedSessionId) {
      analysisRequestRef.current += 1;
      selectedSessionIdRef.current = id;
      setIsLoading(false);
      setSelectedSessionId(id);
      setAnalysis(null);
      setSaveComplete(false);
    }
    if (focusInput) requestAnimationFrame(() => textareaRef.current?.focus());
  }, [selectedSessionId]);

  const replaceSessionInUrl = useCallback((sessionId: string) => {
    const params = new URLSearchParams(searchParamString);
    if (sessionId) params.set("sessionId", sessionId);
    else params.delete("sessionId");
    const query = params.toString();
    router.replace(query ? `/student-ask?${query}` : "/student-ask", { scroll: false });
  }, [router, searchParamString]);

  const selectSession = useCallback((sessionId: string, focusInput = true) => {
    transitionSession(sessionId, focusInput);
    replaceSessionInUrl(sessionId);
  }, [replaceSessionInUrl, transitionSession]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    if (!user.id || !selectedSessionId || draftAppliedRef.current || searchParams.get("draft") !== "practice") return;
    draftAppliedRef.current = true;
    const draft = consumePracticeDraft(window.sessionStorage, user.id);
    if (!draft) return;
    setContent(draft.content);
    setDraftAnnouncement(t("practiceDraftLoaded"));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [searchParams, t, user.id, selectedSessionId, setContent]);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => setAiConfigured(data.configured))
      .catch(() => setAiConfigured(false));

  }, []);

  useEffect(() => {
    if (!sessionsLoaded || sessionsError || needsQuestionScope) return;
    const currentSessionId = selectedSessionIdRef.current;
    const requestedSessionChanged = appliedRequestedSessionRef.current !== requestedSessionId;
    if (requestedSessionChanged) {
      appliedRequestedSessionRef.current = requestedSessionId;
      const requestedSession = requestedSessionId
        ? sessions.find((item) => item.id === requestedSessionId)
        : null;
      const nextSessionId = requestedSession?.id ?? (
        currentSessionId && sessions.some((item) => item.id === currentSessionId)
          ? currentSessionId
          : sessions[0]?.id ?? ""
      );
      transitionSession(nextSessionId);
      if (requestedSessionId && !requestedSession && nextSessionId) {
        replaceSessionInUrl(nextSessionId);
      }
      return;
    }

    if (currentSessionId && sessions.some((item) => item.id === currentSessionId)) return;
    const nextSessionId = sessions[0]?.id ?? "";
    transitionSession(nextSessionId);
    if (requestedSessionId && nextSessionId) replaceSessionInUrl(nextSessionId);
  }, [needsQuestionScope, replaceSessionInUrl, requestedSessionId, sessions, sessionsError, sessionsLoaded, transitionSession]);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null;
  const hasDesignReference = Boolean(selectedSession?.unitDesignId);

  // 탐구질문 수업 세션이면 참고 자료(탐구설계 맥락)를 불러온다
  const fetchDesignContext = useCallback(async (sessionId: string) => {
    const requestId = ++designContextRequestRef.current;
    try {
      const response = await fetch(`/api/sessions/${sessionId}/design-context`);
      const data = await response.json();
      if (
        requestId !== designContextRequestRef.current ||
        selectedSessionIdRef.current !== sessionId
      ) return;
      setDesignContext(data?.context ?? null);
    } catch {
      // 참고 자료는 질문 작성을 막지 않으며, 다음 수업 선택이나 창 포커스 때 다시 불러온다.
    }
  }, []);

  useEffect(() => {
    setDesignContext(null);
    const sel = sessions.find((s) => s.id === selectedSessionId);
    if (selectedSessionId && sel?.unitDesignId) {
      setShowRef(true);
      fetchDesignContext(selectedSessionId);
    }
  }, [selectedSessionId, sessions, fetchDesignContext]);

  // 교사가 저장 설계를 수정하면 라이브로 반영된다. 창 포커스 시 참고자료를 다시 불러와 최신화한다.
  useEffect(() => {
    const onFocus = () => {
      const sel = sessions.find((s) => s.id === selectedSessionId);
      if (selectedSessionId && sel?.unitDesignId) fetchDesignContext(selectedSessionId);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [selectedSessionId, sessions, fetchDesignContext]);

  const todayStr = useLocalDateKey();
  const teacherRequestSessionIds = useMemo(
    () => {
      const reminders = notificationQuery.data?.unreadSessionReminders
        ?? notificationQuery.notifications.filter(
          (item) => item.type === "SESSION_REMINDER" && !item.readAt,
        );
      return new Set(
        reminders
          .map((item) => item.sessionId)
          .filter((sessionId): sessionId is string => Boolean(sessionId)),
      );
    },
    [notificationQuery.data?.unreadSessionReminders, notificationQuery.notifications],
  );
  const scopedSessions = useMemo(() => {
    if (!scopedTaskDataReady) return [];
    return sessions.filter((session) => {
      const needsQuestion = !questionSessionIds.has(session.id) && !teacherRequestSessionIds.has(session.id);
      if (taskScope === "today-unasked") return session.date === todayStr && needsQuestion;
      if (taskScope === "future-unasked") return session.date > todayStr && needsQuestion;
      if (taskScope === "past-unasked") {
        return (
          session.date < todayStr &&
          isDashboardActionableSessionDate(session.date, todayStr) &&
          needsQuestion
        );
      }
      if (taskScope === "shared") return (session.sharedQuestions?.length ?? 0) > 0;
      return true;
    });
  }, [questionSessionIds, scopedTaskDataReady, sessions, taskScope, teacherRequestSessionIds, todayStr]);

  // 날짜/교과/주제 필터로 좁힌 세션 목록
  const filterOptions = useMemo(() => getSessionFilterOptions(scopedSessions), [scopedSessions]);
  const searchQuery = searchTerm.trim().toLowerCase();
  const filteredSessions = useMemo(
    () => filterSessions(scopedSessions, {
      date: filterDate || undefined,
      subject: filterSubject || undefined,
      topic: filterTopic || undefined,
    }).filter(
      (s) => !searchQuery || s.topic.toLowerCase().includes(searchQuery) || s.subject.toLowerCase().includes(searchQuery),
    ),
    [filterDate, filterSubject, filterTopic, scopedSessions, searchQuery],
  );
  const sessionProgress = useMemo(() => {
    const total = filteredSessions.length;
    const completed = filteredSessions.filter((session) => questionSessionIds.has(session.id)).length;
    const remaining = Math.max(total - completed, 0);
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, remaining, percent };
  }, [filteredSessions, questionSessionIds]);

  const showAllSessions = () => {
    setFilterDate("");
    setFilterSubject("");
    setFilterTopic("");
    setSearchTerm("");
    router.replace("/student-ask", { scroll: false });
  };

  const getSessionDateBadge = (date: string) => {
    if (date === todayStr) return t("todayBadge");
    if (date > todayStr) return t("futureBadge");
    return t("pastBadge");
  };

  // 필터 변경 시 선택 세션 보정: 목록에 없으면 첫 세션으로, 목록이 비면 선택 해제
  useEffect(() => {
    if (!sessionsLoaded || !scopedTaskDataReady) return;
    const currentSessionId = selectedSessionIdRef.current;
    if (filteredSessions.length === 0) {
      if (currentSessionId) selectSession("", false);
      return;
    }
    if (!filteredSessions.some((s) => s.id === currentSessionId)) {
      selectSession(filteredSessions[0].id, true);
    }
  }, [filterDate, filterSubject, filterTopic, sessionsLoaded, scopedTaskDataReady, filteredSessions, selectSession]);

  const canAsk = sessionsLoaded && scopedTaskDataReady && !sessionsError && sessions.length > 0 && !!selectedSessionId;
  const currentStep = analysisCurrent ? 3 : content.trim().length > 0 ? 2 : 1;
  const flowSteps = [
    { step: 1, label: t("stepSession") },
    { step: 2, label: t("stepQuestion") },
    { step: 3, label: t("stepResult") },
  ];

  const handleClassify = async () => {
    const normalized = content.trim();
    const analysisSessionId = selectedSessionId;
    // issue #3: handler 단에서도 세션 필수 검증
    if (!canAsk) return;
    if (!normalized) {
      toast({ variant: "destructive", description: t("enterQuestion") });
      return;
    }

    const requestId = ++analysisRequestRef.current;
    setSaveComplete(false);
    setIsLoading(true);
    try {
      const requestClassification = async (): Promise<ClassificationResult> => {
        const response = await fetch("/api/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: normalized }),
        });
        const responseData = await response.json();
        if (!response.ok) {
          throw new Error(responseData.error || t("classifyFailed"));
        }
        return responseData;
      };

      let data = await requestClassification();

      if (
        analysisRequestRef.current !== requestId ||
        selectedSessionIdRef.current !== analysisSessionId
      ) return;

      if (isRetryableClassificationFallback(data)) {
        await new Promise((resolve) => setTimeout(resolve, CLASSIFICATION_RETRY_DELAY_MS));
        if (
          analysisRequestRef.current !== requestId ||
          selectedSessionIdRef.current !== analysisSessionId
        ) return;
        data = await requestClassification();
      }

      if (
        analysisRequestRef.current !== requestId ||
        selectedSessionIdRef.current !== analysisSessionId
      ) return;
      setAnalysis({ content: normalized, sessionId: analysisSessionId, result: data });
    } catch (error: unknown) {
      if (analysisRequestRef.current !== requestId) return;
      const msg = error instanceof Error ? error.message : t("classifyError");
      toast({ variant: "destructive", description: msg });
    } finally {
      if (analysisRequestRef.current === requestId) setIsLoading(false);
    }
  };

  const handleSave = async () => {
    // issue #3: handler 단에서도 세션 필수 검증
    if (!canAsk || !analysis || !isAnalysisCurrent(content, selectedSessionId, analysis)) {
      toast({ variant: "destructive", description: t("reanalyzeBeforeSave") });
      return;
    }
    const savedAnalysis = analysis;
    const savedSessionId = selectedSessionId;

    setIsSaving(true);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: savedAnalysis.content,
          closure: savedAnalysis.result.closure,
          cognitive: savedAnalysis.result.cognitive,
          closureScore: savedAnalysis.result.closureScore,
          cognitiveScore: savedAnalysis.result.cognitiveScore,
          sessionId: savedSessionId,
          flagged: savedAnalysis.result.inappropriate ?? false,
          flagReason: savedAnalysis.result.inappropriateReason ?? "",
        }),
      });

      if (!res.ok) throw new Error(t("saveFailed"));
      markSubmitted(savedAnalysis.content);
      const saved = await res.json().catch(() => null);
      const savedQuestion = {
        id: typeof saved?.id === "string" ? saved.id : existingQuestion?.id ?? "saved",
        content: savedAnalysis.content,
      };
      try {
        await queryClient.cancelQueries({
          queryKey: appQueryKeys.studentSessionQuestion(user.id, savedSessionId),
        });
      } catch {
        // 서버 저장은 끝났으므로 캐시 취소 실패가 저장 완료 처리를 막지 않게 한다.
      }
      queryClient.setQueryData<StudentSessionQuestionResponse>(
        appQueryKeys.studentSessionQuestion(user.id, savedSessionId),
        { existingQuestion: savedQuestion },
      );
      queryClient.setQueryData<StudentQuestionSummary>(
        appQueryKeys.studentQuestionSummary(user.id),
        (previous) => previous
          ? {
              ...previous,
              answeredSessionIds: Array.from(new Set([
                ...previous.answeredSessionIds,
                savedSessionId,
              ])),
            }
          : previous,
      );
      void queryClient.invalidateQueries({
        queryKey: appQueryKeys.studentQuestionSummary(user.id),
      });
      void queryClient.invalidateQueries({ queryKey: appNotificationQueryKeys.student });
      if (typeof saved?.awardedPoints === "number" && saved.awardedPoints > 0) {
        void queryClient.invalidateQueries({ queryKey: ["points-card"] });
      }
      if (
        selectedSessionIdRef.current !== savedSessionId ||
        !isAnalysisCurrent(contentRef.current, selectedSessionIdRef.current, savedAnalysis)
      ) return;
      setSaveComplete(true);
    } catch {
      toast({ variant: "destructive", description: t("saveError") });
    } finally {
      setIsSaving(false);
    }
  };

  const writeAnotherInSameSession = () => {
    analysisRequestRef.current += 1;
    setIsLoading(false);
    setContent("");
    setAnalysis(null);
    setSaveComplete(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const chooseAnotherSession = () => {
    analysisRequestRef.current += 1;
    setIsLoading(false);
    setContent("");
    setAnalysis(null);
    setSaveComplete(false);
    setFilterDate("");
    setFilterSubject("");
    setFilterTopic("");
    setSearchTerm("");
    router.replace("/student-ask", { scroll: false });
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const scopedTaskDataError = needsQuestionScope && (
    questionsError || notificationQuery.isError
  );

  // issue #1 & #2: 네트워크 오류
  if (sessionsError || scopedTaskDataError) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t("title")}</h2>
        </div>
        <Card className="border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-950/40">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center text-red-700 text-sm">
            <p>{t("loadSessionError")}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void sessionsQuery.refetch();
                void questionsQuery.refetch();
                void notificationQuery.refetch();
              }}
            >
              {tc("retry")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // issue #1: 로딩 중에는 아무것도 표시하지 않음
  if (!sessionsLoaded || !scopedTaskDataReady) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t("title")}</h2>
        </div>
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground text-sm">{t("checkingSession")}</CardContent>
        </Card>
      </div>
    );
  }

  // issue #1 & #2: 세션 없음 — 폼 차단
  if (sessions.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t("title")}</h2>
        </div>
        <Card className="border-yellow-200 dark:border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/40">
          <CardContent className="p-6 text-center text-yellow-800">
            <p className="font-medium">{t("noSession")}</p>
            <p className="text-sm mt-1 text-yellow-700">
              {t("noSessionDesc")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t("title")}</h2>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {aiConfigured === false && (
        <Card className="border-yellow-200 dark:border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/40">
          <CardContent className="p-4">
            <p className="text-yellow-800 text-sm">
              {t("aiNotConfigured")}
            </p>
          </CardContent>
        </Card>
      )}

      {draftAnnouncement && (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-500/30 dark:bg-green-950/40 dark:text-green-200">
          {draftAnnouncement}
        </p>
      )}

      {questionsError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-950/40 dark:text-yellow-200">
          <span>{t("questionSummaryLoadError")}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void questionsQuery.refetch()}
          >
            {tc("retry")}
          </Button>
        </div>
      )}

      {existingQuestionQuery.isError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200">
          <span>{t("existingQuestionLoadError")}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void existingQuestionQuery.refetch()}
          >
            {tc("retry")}
          </Button>
        </div>
      )}

      <StudentAskInputCard
        flowSteps={flowSteps}
        currentStep={currentStep}
        selectedSession={selectedSession}
        existingQuestion={existingQuestion}
        isCheckingExisting={isCheckingExisting}
        content={content}
        draftStatus={draftStatus}
        textareaRef={textareaRef}
        canAsk={canAsk}
        isLoading={isLoading}
        hasAnalysis={Boolean(analysis)}
        onContentChange={(value) => {
          setContent(value);
          setSaveComplete(false);
        }}
        onAnalyze={handleClassify}
        sessionSelector={
          <StudentAskSessionSelector
            taskScope={taskScope}
            filterOptions={filterOptions}
            filterDate={filterDate}
            filterSubject={filterSubject}
            filterTopic={filterTopic}
            filteredSessions={filteredSessions}
            selectedSessionId={selectedSessionId}
            questionSessionIds={questionSessionIds}
            questionStatusAvailable={questionsLoaded && !questionsError}
            sessionProgress={sessionProgress}
            search={searchTerm}
            onSearch={setSearchTerm}
            todayStr={todayStr}
            filtersActive={Boolean(searchQuery || filterDate || filterSubject || filterTopic)}
            onShowAllSessions={showAllSessions}
            onFilterDateChange={setFilterDate}
            onFilterSubjectChange={setFilterSubject}
            onFilterTopicChange={setFilterTopic}
            onSelectSession={selectSession}
            getSessionDateBadge={getSessionDateBadge}
          />
        }
        referencePanel={
          <StudentAskReferencePanel
            selectedSession={selectedSession}
            hasDesignReference={hasDesignReference}
            designContext={designContext}
            showReference={showRef}
            onToggleReference={() => setShowRef((value) => !value)}
          />
        }
      />

      {result && (
        <StudentAskResultCard
          result={result}
          analyzedContent={analysis!.content}
          analysisCurrent={analysisCurrent}
          saveComplete={saveComplete}
          isSaving={isSaving}
          onRewrite={() => {
            setSaveComplete(false);
            requestAnimationFrame(() => textareaRef.current?.focus());
          }}
          onUseImprovedExample={(improvedExample) => {
            setContent(improvedExample.trim().slice(0, 200));
            setSaveComplete(false);
            requestAnimationFrame(() => textareaRef.current?.focus());
          }}
          onSave={handleSave}
        />
      )}

      {saveComplete && (
        <StudentAskCompletionCard
          selectedSession={selectedSession}
          onViewMyQuestions={() => router.push("/student-questions")}
          onWriteAnother={writeAnotherInSameSession}
          onChooseAnotherSession={chooseAnotherSession}
        />
      )}
    </div>
  );
}

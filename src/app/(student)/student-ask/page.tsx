"use client";

import { Suspense, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { getSessionFilterOptions, filterSessions, isInquiryDesignSession } from "@/lib/sessions";
import { getSessionUser } from "@/lib/auth-helpers";
import { appNotificationQueryKeys } from "@/lib/app-notifications";
import { useStudentSessions } from "@/lib/app-queries";
import { useToast } from "@/components/ui/use-toast";
import { useTranslations } from "next-intl";
import { StudentAskCompletionCard } from "./StudentAskCompletionCard";
import { StudentAskInputCard } from "./StudentAskInputCard";
import { StudentAskResultCard } from "./StudentAskResultCard";
import { StudentAskSessionSelector } from "./StudentAskSessionSelector";
import type { ClassificationResult, DesignContext, QuestionSession, StudentQuestion } from "./types";

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
    <div className="max-w-6xl mx-auto space-y-6">
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
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { data: authSession } = useSession();
  const user = getSessionUser(authSession);
  const taskParam = searchParams.get("task");
  const requestedSessionId = searchParams.get("sessionId");
  const taskScope =
    taskParam === "today-unasked" ||
    taskParam === "future-unasked" ||
    taskParam === "past-unasked" ||
    taskParam === "shared"
      ? taskParam
      : null;

  const [content, setContent] = useState("");
  const { toast } = useToast();
  const [existingQuestion, setExistingQuestion] = useState<{ id: string; content: string } | null>(null);
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveComplete, setSaveComplete] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const {
    data: sessions = [],
    isLoading: isSessionsLoading,
    isError: sessionsError,
  } = useStudentSessions<QuestionSession>({ userId: user.id });
  const sessionsLoaded = Boolean(user.id) && !isSessionsLoading;
  const [questionSessionIds, setQuestionSessionIds] = useState<Set<string>>(new Set());
  const [questionsLoaded, setQuestionsLoaded] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [designContext, setDesignContext] = useState<DesignContext | null>(null);
  const [showRef, setShowRef] = useState(true);
  const [filterDate, setFilterDate] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterTopic, setFilterTopic] = useState("");

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => setAiConfigured(data.configured))
      .catch(() => setAiConfigured(false));

  }, []);

  useEffect(() => {
    if (!sessionsLoaded || sessionsError) return;
    setSelectedSessionId((prev) => {
      const requestedSession = requestedSessionId
        ? sessions.find((item) => item.id === requestedSessionId)
        : null;
      if (requestedSession) return requestedSession.id;
      if (prev && sessions.some((item) => item.id === prev)) return prev;
      return sessions[0]?.id ?? "";
    });
  }, [requestedSessionId, sessions, sessionsError, sessionsLoaded]);

  useEffect(() => {
    if (!user.id) return;
    setQuestionsLoaded(false);
    fetch(`/api/questions?authorId=${user.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((questions: StudentQuestion[]) => {
        setQuestionSessionIds(new Set(questions.map((question) => question.sessionId).filter((id): id is string => Boolean(id))));
      })
      .catch(() => setQuestionSessionIds(new Set()))
      .finally(() => setQuestionsLoaded(true));
  }, [user.id]);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null;
  const isInquirySession = selectedSession ? isInquiryDesignSession(selectedSession) : false;

  // 탐구질문 수업 세션이면 참고 자료(탐구설계 맥락)를 불러온다
  const fetchDesignContext = useCallback((sessionId: string) => {
    fetch(`/api/sessions/${sessionId}/design-context`)
      .then((r) => r.json())
      .then((d) => setDesignContext(d?.context ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setDesignContext(null);
    const sel = sessions.find((s) => s.id === selectedSessionId);
    if (selectedSessionId && sel && isInquiryDesignSession(sel)) {
      setShowRef(true);
      fetchDesignContext(selectedSessionId);
    }
  }, [selectedSessionId, sessions, fetchDesignContext]);

  // 교사가 저장 설계를 수정하면 라이브로 반영된다. 창 포커스 시 참고자료를 다시 불러와 최신화한다.
  useEffect(() => {
    const onFocus = () => {
      const sel = sessions.find((s) => s.id === selectedSessionId);
      if (selectedSessionId && sel && isInquiryDesignSession(sel)) fetchDesignContext(selectedSessionId);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [selectedSessionId, sessions, fetchDesignContext]);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const needsQuestionScope = taskScope === "today-unasked" || taskScope === "future-unasked" || taskScope === "past-unasked";
  const scopedSessions = useMemo(() => {
    if (needsQuestionScope && !questionsLoaded) return [];
    return sessions.filter((session) => {
      if (taskScope === "today-unasked") return session.date === todayStr && !questionSessionIds.has(session.id);
      if (taskScope === "future-unasked") return session.date > todayStr && !questionSessionIds.has(session.id);
      if (taskScope === "past-unasked") return session.date < todayStr && !questionSessionIds.has(session.id);
      if (taskScope === "shared") return (session.sharedQuestions?.length ?? 0) > 0;
      return true;
    });
  }, [needsQuestionScope, questionSessionIds, questionsLoaded, sessions, taskScope, todayStr]);

  // 날짜/교과/주제 필터로 좁힌 세션 목록
  const filterOptions = useMemo(() => getSessionFilterOptions(scopedSessions), [scopedSessions]);
  const filteredSessions = useMemo(
    () => filterSessions(scopedSessions, {
      date: filterDate || undefined,
      subject: filterSubject || undefined,
      topic: filterTopic || undefined,
    }),
    [filterDate, filterSubject, filterTopic, scopedSessions],
  );
  const sessionProgress = useMemo(() => {
    const total = filteredSessions.length;
    const completed = filteredSessions.filter((session) => questionSessionIds.has(session.id)).length;
    const remaining = Math.max(total - completed, 0);
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, remaining, percent };
  }, [filteredSessions, questionSessionIds]);

  const selectSession = (id: string) => {
    setSelectedSessionId(id);
    setResult(null); // issue #5: 세션 변경 시 분류 결과 초기화
    setSaveComplete(false);

    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const showAllSessions = () => {
    setFilterDate("");
    setFilterSubject("");
    setFilterTopic("");
    router.replace("/student-ask", { scroll: false });
  };

  const getSessionDateBadge = (date: string) => {
    if (date === todayStr) return t("todayBadge");
    if (date > todayStr) return t("futureBadge");
    return t("pastBadge");
  };

  // 필터 변경 시 선택 세션 보정: 목록에 없으면 첫 세션으로, 목록이 비면 선택 해제
  useEffect(() => {
    if (!sessionsLoaded || (needsQuestionScope && !questionsLoaded)) return;
    if (filteredSessions.length === 0) {
      if (selectedSessionId) setSelectedSessionId("");
      return;
    }
    if (!filteredSessions.some((s) => s.id === selectedSessionId)) {
      selectSession(filteredSessions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDate, filterSubject, filterTopic, sessionsLoaded, questionsLoaded, needsQuestionScope, filteredSessions, selectedSessionId]);

  useEffect(() => {
    setExistingQuestion(null);
    if (!selectedSessionId || !user.id) return;
    setIsCheckingExisting(true);
    fetch(`/api/questions?sessionId=${selectedSessionId}&authorId=${user.id}`)
      .then((r) => r.json())
      .then((qs: Array<{ id: string; content: string }>) => {
        setExistingQuestion(qs.length > 0 ? { id: qs[0].id, content: qs[0].content } : null);
      })
      .catch(() => {})
      .finally(() => setIsCheckingExisting(false));
  }, [selectedSessionId, user.id]);

  const canAsk = sessionsLoaded && !sessionsError && sessions.length > 0 && !!selectedSessionId;
  const currentStep = result ? 3 : content.trim().length > 0 ? 2 : 1;
  const flowSteps = [
    { step: 1, label: t("stepSession") },
    { step: 2, label: t("stepQuestion") },
    { step: 3, label: t("stepResult") },
  ];

  const handleClassify = async () => {
    // issue #3: handler 단에서도 세션 필수 검증
    if (!canAsk) return;
    if (content.trim().length === 0) {
      toast({ variant: "destructive", description: t("enterQuestion") });
      return;
    }

    setSaveComplete(false);
    setIsLoading(true);
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t("classifyFailed"));
      }

      const data = await res.json();
      setResult(data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("classifyError");
      toast({ variant: "destructive", description: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    // issue #3: handler 단에서도 세션 필수 검증
    if (!canAsk || !result) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          closure: result.closure,
          cognitive: result.cognitive,
          closureScore: result.closureScore,
          cognitiveScore: result.cognitiveScore,
          sessionId: selectedSessionId,
          flagged: result.inappropriate ?? false,
          flagReason: result.inappropriateReason ?? "",
        }),
      });

      if (!res.ok) throw new Error(t("saveFailed"));
      const saved = await res.json().catch(() => null);
      setExistingQuestion({
        id: typeof saved?.id === "string" ? saved.id : existingQuestion?.id ?? "saved",
        content,
      });
      setQuestionSessionIds((prev) => new Set(prev).add(selectedSessionId));
      queryClient.invalidateQueries({ queryKey: appNotificationQueryKeys.student });
      setSaveComplete(true);
    } catch {
      toast({ variant: "destructive", description: t("saveError") });
    } finally {
      setIsSaving(false);
    }
  };

  const writeAnotherInSameSession = () => {
    setContent("");
    setResult(null);
    setSaveComplete(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const chooseAnotherSession = () => {
    setContent("");
    setResult(null);
    setSaveComplete(false);
    setFilterDate("");
    setFilterSubject("");
    setFilterTopic("");
    router.replace("/student-ask", { scroll: false });
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  // issue #1: 로딩 중에는 아무것도 표시하지 않음
  if (!sessionsLoaded || (needsQuestionScope && !questionsLoaded)) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t("title")}</h2>
        </div>
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground text-sm">{t("checkingSession")}</CardContent>
        </Card>
      </div>
    );
  }

  // issue #1 & #2: 네트워크 오류
  if (sessionsError) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t("title")}</h2>
        </div>
        <Card className="border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-950/40">
          <CardContent className="p-6 text-center text-red-700 text-sm">
            {t("loadSessionError")}
          </CardContent>
        </Card>
      </div>
    );
  }

  // issue #1 & #2: 세션 없음 — 폼 차단
  if (sessions.length === 0) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
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
    <div className="max-w-6xl mx-auto space-y-6">
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

      {aiConfigured === true && (
        <Card className="border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-950/40">
          <CardContent className="p-4">
            <p className="text-green-800 text-sm">{t("aiActive")}</p>
          </CardContent>
        </Card>
      )}

      <StudentAskInputCard
        flowSteps={flowSteps}
        currentStep={currentStep}
        existingQuestion={existingQuestion}
        isCheckingExisting={isCheckingExisting}
        content={content}
        textareaRef={textareaRef}
        canAsk={canAsk}
        isLoading={isLoading}
        onContentChange={setContent}
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
            selectedSession={selectedSession}
            questionSessionIds={questionSessionIds}
            sessionProgress={sessionProgress}
            isInquirySession={isInquirySession}
            designContext={designContext}
            showReference={showRef}
            onShowAllSessions={showAllSessions}
            onFilterDateChange={setFilterDate}
            onFilterSubjectChange={setFilterSubject}
            onFilterTopicChange={setFilterTopic}
            onSelectSession={selectSession}
            getSessionDateBadge={getSessionDateBadge}
            onToggleReference={() => setShowRef((value) => !value)}
          />
        }
      />

      {result && (
        <StudentAskResultCard
          result={result}
          saveComplete={saveComplete}
          isSaving={isSaving}
          onRewrite={() => {
            setResult(null);
            setContent("");
            setSaveComplete(false);
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

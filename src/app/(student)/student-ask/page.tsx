"use client";

import { Suspense, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CollapseChevron } from "@/components/shared/SectionToggle";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { buildSessionLabel, getSessionFilterOptions, filterSessions, isInquiryDesignSession } from "@/lib/sessions";
import { DesignReferenceView } from "@/components/shared/DesignReferenceView";
import { getSessionUser } from "@/lib/auth-helpers";
import { COGNITIVE_LABEL } from "@/lib/question-labels";
import { appNotificationQueryKeys } from "@/lib/app-notifications";
import { useStudentSessions } from "@/lib/app-queries";
import { useToast } from "@/components/ui/use-toast";
import { useTranslations } from "next-intl";

interface SharedQuestion {
  type: string;
  content: string;
}

interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  teacher: { name: string };
  sharedQuestions: SharedQuestion[];
  unitDesignId?: string | null;
  defaultQuestionPublic?: boolean;
}

interface StudentQuestion {
  sessionId?: string | null;
}

interface DesignContext {
  title: string;
  subject: string;
  gradeRange: string;
  grade: string | null;
  area: string;
  coreIdea: string;
  coreSentences: string[];
  essentialQuestions: string[];
  inquiryQuestions: { type: string; content: string }[];
}

interface ClassificationResult {
  closure: string;
  cognitive: string;
  closureScore: number;
  cognitiveScore: number;
  reasoning: string;
  feedback?: string;
  improvedExample?: string;
  inappropriate?: boolean;
  inappropriateReason?: string;
}

const TYPE_LABEL = COGNITIVE_LABEL;

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
    <div className="max-w-3xl mx-auto space-y-6">
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
  const tCls = useTranslations("classification");
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

  const handleSessionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    selectSession(e.target.value);
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

  const getCognitiveLabel = (c: string) =>
    (c === "factual" || c === "conceptual" || c === "controversial")
      ? `${tCls(`${c}.label`)}`
      : c;

  // issue #1: 로딩 중에는 아무것도 표시하지 않음
  if (!sessionsLoaded || (needsQuestionScope && !questionsLoaded)) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
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
      <div className="max-w-3xl mx-auto space-y-6">
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
      <div className="max-w-3xl mx-auto space-y-6">
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
    <div className="max-w-3xl mx-auto space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle>{t("inputHeader")}</CardTitle>
          <CardDescription>{t("inputDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {flowSteps.map((item) => {
              const active = item.step === currentStep;
              const done = item.step < currentStep;
              return (
                <div
                  key={item.step}
                  className={`rounded-lg border px-3 py-2 text-center text-xs font-semibold ${
                    active
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-200"
                      : done
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-200"
                        : "border-border bg-muted/30 text-muted-foreground"
                  }`}
                >
                  <span className="mr-1">{item.step}</span>
                  {item.label}
                </div>
              );
            })}
          </div>

          {/* 세션 선택 — 필수 */}
          <div className="space-y-2">
            <Label htmlFor="session">{t("sessionSelectLabel")} <span className="text-red-500">*</span></Label>

            {/* 날짜·교과·주제로 좁혀서 찾기 (선택) */}
            {taskScope && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-950/30 dark:text-indigo-200">
                <span>
                  {taskScope === "today-unasked" && t("taskScopeTodayUnasked")}
                  {taskScope === "future-unasked" && t("taskScopeFutureUnasked")}
                  {taskScope === "past-unasked" && t("taskScopePastUnasked")}
                  {taskScope === "shared" && t("taskScopeShared")}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 border-indigo-200 bg-white px-3 text-xs text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-100"
                  onClick={showAllSessions}
                >
                  {t("showAllSessions")}
                </Button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <select
                aria-label={t("filterByDate")}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
              >
                <option value="">{t("allDates")}</option>
                {filterOptions.dates.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select
                aria-label={t("filterBySubject")}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
              >
                <option value="">{t("allSubjects")}</option>
                {filterOptions.subjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                aria-label={t("filterByTopic")}
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={filterTopic}
                onChange={(e) => setFilterTopic(e.target.value)}
              >
                <option value="">{t("allTopics")}</option>
                {filterOptions.topics.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <select
              id="session"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={selectedSessionId}
              onChange={handleSessionChange}
              disabled={filteredSessions.length === 0}
            >
              {filteredSessions.length === 0 ? (
                <option value="">{t("noMatchingSession")}</option>
              ) : (
                filteredSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {buildSessionLabel(s.date, s.subject, s.topic)}
                    {isInquiryDesignSession(s) ? ` · ${t("inquiryClassTag")}` : ""}
                  </option>
                ))
              )}
            </select>

            {filteredSessions.length > 0 && (
              <div className="space-y-2">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-950/30">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                        {t("sessionProgressTitle")}
                      </p>
                      <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                        {t("sessionProgressSummary", sessionProgress)}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
                      {sessionProgress.percent}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white dark:bg-emerald-950">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${sessionProgress.percent}%` }}
                    />
                  </div>
                </div>

                <div className="grid max-h-[22rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                  {filteredSessions.map((session) => {
                    const active = selectedSessionId === session.id;
                    const isInquiry = isInquiryDesignSession(session);
                    const alreadyAskedInSession = questionSessionIds.has(session.id);
                    return (
                      <button
                        key={session.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => selectSession(session.id)}
                        className={`min-h-[104px] rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                          active
                            ? "border-indigo-300 bg-indigo-50 text-indigo-950 shadow-sm dark:border-indigo-500/50 dark:bg-indigo-950/40 dark:text-indigo-100"
                            : "border-border bg-background hover:border-indigo-200 hover:bg-indigo-50/60 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-950/20"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            active
                              ? "bg-white text-indigo-700 dark:bg-indigo-900 dark:text-indigo-100"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {getSessionDateBadge(session.date)}
                          </span>
                          {active && (
                            <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                              {t("selectedSessionBadge")}
                            </span>
                          )}
                          {!active && alreadyAskedInSession && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                              {t("completedSessionBadge")}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 space-y-1">
                          <p className="line-clamp-1 text-sm font-semibold">{session.subject}</p>
                          <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
                            {session.topic.trim() || t("emptyTopic")}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span>{session.date}</span>
                            <span>{session.teacher.name} {t("teacherSuffix")}</span>
                            {isInquiry && (
                              <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                                {t("inquiryClassTag")}
                              </span>
                            )}
                            {alreadyAskedInSession && (
                              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
                                {t("completedSessionShort")}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedSession && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-950/40 p-3 space-y-1">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">{t("currentSession")}</p>
                <p className="text-sm font-medium text-blue-900">
                  {selectedSession.subject}
                  {selectedSession.topic.trim() && (
                    <span className="text-blue-700"> · {selectedSession.topic.trim()}</span>
                  )}
                </p>
                <p className="text-xs text-blue-600">
                  {selectedSession.teacher.name} {t("teacherSuffix")} &nbsp;·&nbsp; {selectedSession.date}
                </p>
                {selectedSession.unitDesignId && (
                  <div className="mt-2 rounded-md border border-indigo-200 bg-white px-3 py-2 text-xs text-indigo-700">
                    {t("inquiryClassNotice")}
                  </div>
                )}
                <p className="text-xs text-blue-500">
                  {t("visibilityNotice", { visibility: selectedSession.defaultQuestionPublic ? t("public") : t("private") })}
                </p>
              </div>
            )}
          </div>

          {/* 탐구질문 수업 — 참고 자료(탐구설계 맥락) 접기 패널 */}
          {isInquirySession && designContext && (
            <div className="rounded-lg border-2 border-indigo-300 bg-indigo-50 p-4 dark:border-indigo-500/40 dark:bg-indigo-950/40">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
                    {t("referenceTitle")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-indigo-900 dark:text-indigo-100">
                    {t("referenceGuideTitle")}
                  </p>
                  <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-200">
                    {t("referenceGuideDesc")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 border-indigo-200 bg-white px-3 text-xs text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-950/40 dark:text-indigo-100"
                  onClick={() => setShowRef((v) => !v)}
                >
                  {showRef ? t("hideReference") : t("showReference")}
                  <CollapseChevron open={showRef} />
                </Button>
              </div>
              {showRef && <DesignReferenceView data={designContext} className="mt-3" />}
            </div>
          )}

          {/* 선생님의 탐구 질문 안내 패널 (issue #4: 런타임 안전 검증) */}
          {selectedSession &&
            Array.isArray(selectedSession.sharedQuestions) &&
            selectedSession.sharedQuestions.filter((q) => q.content?.trim()).length > 0 && (
              <div className="rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/40 p-4 space-y-2">
                <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
                  {t("teacherInquiryQuestions")}
                </p>
                <p className="text-xs text-indigo-500 mb-2">
                  {t("inquiryHint")}
                </p>
                <ul className="space-y-1.5">
                  {selectedSession.sharedQuestions
                    .filter((q) => q.content?.trim())
                    .map((q, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-indigo-800">
                        <span className="shrink-0 mt-0.5 text-xs font-medium text-indigo-500">
                          [{TYPE_LABEL[q.type] ?? q.type}]
                        </span>
                        <span>{q.content}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}

          {/* 이미 제출한 질문 배너 */}
          {existingQuestion && !isCheckingExisting && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 rounded-lg text-sm text-amber-800 dark:text-amber-300">
              {t("alreadyAsked")}: <strong>&ldquo;{existingQuestion.content.slice(0, 50)}{existingQuestion.content.length > 50 ? '...' : ''}&rdquo;</strong>
              <br />
              <span className="text-xs text-amber-600">{t("separateSaveNotice")}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="content">{t("questionLabel")}</Label>
            <Textarea
              ref={textareaRef}
              id="content"
              placeholder={t("questionPlaceholder")}
              value={content}
              maxLength={200}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
            />
            <p className="text-sm text-muted-foreground text-right">{content.length}/200</p>
          </div>

          <Button
            onClick={handleClassify}
            disabled={isLoading || !canAsk || content.trim().length === 0}
            variant="gradient"
            className="h-11 w-full text-base font-semibold"
          >
            {isLoading ? t("analyzing") : t("analyze")}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>{t("resultHeader")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.inappropriate && (
              <div className="p-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40">
                <p className="text-sm font-bold text-red-700">{t("inappropriateDetected")}</p>
                <p className="text-sm text-red-600 mt-1">
                  {result.inappropriateReason || t("inappropriateDefault")} {t("inappropriateAdvice")}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-lg">
                <div className="text-sm text-muted-foreground">{t("closureLabel")}</div>
                <div className="text-xl font-bold text-blue-700">
                  {result.closure === "closed" ? t("closedResult") : t("openResult")}
                </div>
                <div className="text-sm text-blue-600 mt-0.5">
                  {result.closure === "closed" ? t("closedHint") : t("openHint")}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {t("confidence")}: {Math.round(result.closureScore * 100)}%
                </div>
              </div>
              <div className="p-4 bg-purple-50 dark:bg-purple-950/40 rounded-lg">
                <div className="text-sm text-muted-foreground">{t("cognitiveLevel")}</div>
                <div className="text-xl font-bold text-purple-700">
                  {COGNITIVE_LABEL[result.cognitive] ?? result.cognitive}
                </div>
                <div className="text-sm text-purple-600 mt-0.5">
                  {result.cognitive === "factual" && t("factualHint")}
                  {result.cognitive === "conceptual" && t("conceptualHint")}
                  {result.cognitive === "controversial" && t("controversialHint")}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {t("confidence")}: {Math.round(result.cognitiveScore * 100)}%
                </div>
              </div>
            </div>

            <div className="p-4 bg-muted/40 rounded-lg">
              <div className="text-sm font-medium text-foreground">{t("reasoning")}</div>
              <p className="text-muted-foreground mt-1">{result.reasoning}</p>
            </div>

            {result.feedback && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/30 rounded-lg">
                <div className="text-sm font-medium text-amber-800 mb-1">
                  {t("feedbackTitle")}
                </div>
                <p className="text-amber-700">{result.feedback}</p>
              </div>
            )}

            {result.improvedExample && result.improvedExample.trim() && (
              <div className="p-4 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-500/30 rounded-lg">
                <div className="text-sm font-medium text-green-800 mb-2">
                  {t("improvedTitle")}
                </div>
                <p className="text-green-900 font-medium">&ldquo;{result.improvedExample}&rdquo;</p>
                <p className="text-xs text-green-600 mt-1">{t("improveHint")}</p>
              </div>
            )}

            <div className="p-4 border rounded-lg bg-muted/40 text-sm text-muted-foreground">
              {t("visibilityByTeacher")}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-11 flex-1"
                disabled={isSaving}
                onClick={() => {
                  setResult(null);
                  setContent("");
                  setSaveComplete(false);
                }}
              >
                {t("rewriteQuestion")}
              </Button>
              {!saveComplete && (
                <Button onClick={handleSave} disabled={isSaving} variant="gradient" className="h-11 flex-1 text-base font-semibold">
                  {isSaving ? t("saving") : t("saveQuestion")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {saveComplete && (
        <Card className="border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/30">
          <CardHeader>
            <CardTitle className="text-emerald-800 dark:text-emerald-100">{t("saveCompleteTitle")}</CardTitle>
            <CardDescription className="text-emerald-700 dark:text-emerald-200">
              {selectedSession
                ? t("saveCompleteDescWithSession", { session: buildSessionLabel(selectedSession.date, selectedSession.subject, selectedSession.topic) })
                : t("saveCompleteDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            <Button
              type="button"
              variant="gradient"
              className="h-11"
              onClick={() => router.push("/student-questions")}
            >
              {t("viewMyQuestions")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-100"
              onClick={writeAnotherInSameSession}
            >
              {t("writeMoreSameSession")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-100"
              onClick={chooseAnotherSession}
            >
              {t("chooseAnotherSession")}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

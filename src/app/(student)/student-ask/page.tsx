"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { buildSessionLabel, getSessionFilterOptions, filterSessions, isInquiryDesignSession } from "@/lib/sessions";
import { DesignReferenceView } from "@/components/shared/DesignReferenceView";
import { getSessionUser } from "@/lib/auth-helpers";
import { COGNITIVE_LABEL } from "@/lib/question-labels";
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
  const t = useTranslations("ask");
  const tCls = useTranslations("classification");
  const tc = useTranslations("common");
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { data: authSession } = useSession();
  const user = getSessionUser(authSession);

  const [content, setContent] = useState("");
  const { toast } = useToast();
  const [existingQuestion, setExistingQuestion] = useState<{ id: string; content: string } | null>(null);
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [sessions, setSessions] = useState<QuestionSession[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [sessionsError, setSessionsError] = useState(false);
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

    fetch("/api/sessions")
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((data: QuestionSession[]) => {
        setSessions(data);
        if (data.length > 0) setSelectedSessionId(data[0].id);
        setSessionsLoaded(true);
      })
      .catch(() => {
        setSessionsError(true);
        setSessionsLoaded(true);
      });
  }, []);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null;
  const isInquirySession = selectedSession ? isInquiryDesignSession(selectedSession) : false;

  // 탐구질문 수업 세션이면 참고 자료(탐구설계 맥락)를 불러온다
  useEffect(() => {
    setDesignContext(null);
    const sel = sessions.find((s) => s.id === selectedSessionId);
    if (selectedSessionId && sel && isInquiryDesignSession(sel)) {
      setShowRef(true);
      fetch(`/api/sessions/${selectedSessionId}/design-context`)
        .then((r) => r.json())
        .then((d) => setDesignContext(d?.context ?? null))
        .catch(() => {});
    }
  }, [selectedSessionId, sessions]);

  // 날짜/교과/주제 필터로 좁힌 세션 목록
  const filterOptions = getSessionFilterOptions(sessions);
  const filteredSessions = filterSessions(sessions, {
    date: filterDate || undefined,
    subject: filterSubject || undefined,
    topic: filterTopic || undefined,
  });

  const selectSession = (id: string) => {
    setSelectedSessionId(id);
    setResult(null); // issue #5: 세션 변경 시 분류 결과 초기화

    // 세션 변경 시 기존 질문 확인
    setExistingQuestion(null);
    if (id) {
      setIsCheckingExisting(true);
      const currentUserId = user.id;
      fetch(`/api/questions?sessionId=${id}&authorId=${currentUserId}`)
        .then(r => r.json())
        .then((qs: Array<{id: string; content: string}>) => {
          setExistingQuestion(qs.length > 0 ? { id: qs[0].id, content: qs[0].content } : null);
        })
        .catch(() => {})
        .finally(() => setIsCheckingExisting(false));
    }

    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleSessionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    selectSession(e.target.value);
  };

  // 필터 변경 시 선택 세션 보정: 목록에 없으면 첫 세션으로, 목록이 비면 선택 해제
  useEffect(() => {
    if (!sessionsLoaded) return;
    if (filteredSessions.length === 0) {
      if (selectedSessionId) setSelectedSessionId("");
      return;
    }
    if (!filteredSessions.some((s) => s.id === selectedSessionId)) {
      selectSession(filteredSessions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDate, filterSubject, filterTopic]);

  const canAsk = sessionsLoaded && !sessionsError && sessions.length > 0 && !!selectedSessionId;

  const handleClassify = async () => {
    // issue #3: handler 단에서도 세션 필수 검증
    if (!canAsk) return;
    if (content.trim().length === 0) {
      toast({ variant: "destructive", description: t("enterQuestion") });
      return;
    }

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
      router.push("/student-questions");
    } catch {
      toast({ variant: "destructive", description: t("saveError") });
    } finally {
      setIsSaving(false);
    }
  };

  const getCognitiveLabel = (c: string) =>
    (c === "factual" || c === "conceptual" || c === "controversial")
      ? `${tCls(`${c}.label`)}`
      : c;

  // issue #1: 로딩 중에는 아무것도 표시하지 않음
  if (!sessionsLoaded) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
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
      <div className="max-w-2xl mx-auto space-y-6">
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
      <div className="max-w-2xl mx-auto space-y-6">
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
    <div className="max-w-2xl mx-auto space-y-6">
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
          {/* 세션 선택 — 필수 */}
          <div className="space-y-2">
            <Label htmlFor="session">{t("sessionSelectLabel")} <span className="text-red-500">*</span></Label>

            {/* 날짜·교과·주제로 좁혀서 찾기 (선택) */}
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
            <div className="rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/40 p-4">
              <button
                type="button"
                onClick={() => setShowRef((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                  <span>📚</span>
                  {t("referenceTitle")}
                  <span className="text-xs text-indigo-500">{showRef ? "▾" : "▸"}</span>
                </span>
                <span className="shrink-0 text-xs font-normal text-indigo-500">{t("referenceHint")}</span>
              </button>
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
              onChange={(e) => setContent(e.target.value)}
              rows={4}
            />
            <p className="text-sm text-muted-foreground text-right">{content.length}/500</p>
          </div>

          <Button
            onClick={handleClassify}
            disabled={isLoading || !canAsk || content.trim().length === 0}
            className="w-full"
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
                className="flex-1"
                disabled={isSaving}
                onClick={() => {
                  setResult(null);
                  setContent("");
                }}
              >
                {t("rewriteQuestion")}
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="flex-1">
                {isSaving ? t("saving") : t("saveQuestion")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

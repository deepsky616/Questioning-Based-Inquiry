"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildSessionLabel, sortSessionsAsc } from "@/lib/sessions";
import { groupSharedQuestions } from "@/lib/shared-questions";
import { CommentThread } from "@/components/shared/CommentThread";

interface SharedQuestion {
  type: string;
  content: string;
  contentGroup?: string;
  lessonPhase?: string;
  rationale?: string;
  priority?: number;
}

interface QuestionSession {
  id: string;
  date: string;
  subject: string;
  topic: string;
  teacher?: { name: string };
  unitDesignId?: string | null;
  sharedQuestions?: SharedQuestion[];
}

interface Published {
  id: string;
  content: string;
  likeCount: number;
  commentCount: number;
  myLike: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  factual: "사실",
  conceptual: "개념",
  controversial: "논쟁",
  student: "학생",
};

const TYPE_STYLE: Record<string, string> = {
  factual: "bg-blue-50 text-blue-700 border-blue-200",
  conceptual: "bg-violet-50 text-violet-700 border-violet-200",
  controversial: "bg-amber-50 text-amber-700 border-amber-200",
  student: "bg-gray-50 text-gray-700 border-gray-200",
};

function LikeButton({
  id, likeCount, myLike, onChange,
}: { id: string; likeCount: number; myLike: boolean; onChange: (count: number, my: boolean) => void }) {
  const [pending, setPending] = useState(false);
  const click = async () => {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/questions/${id}/likes`, { method: myLike ? "DELETE" : "POST" });
      if (res.ok) {
        const d = await res.json();
        onChange(typeof d.likeCount === "number" ? d.likeCount : likeCount, !myLike);
      }
    } catch {
      // 무시
    } finally {
      setPending(false);
    }
  };
  return (
    <button
      onClick={click}
      disabled={pending}
      className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
        myLike ? "bg-rose-100 text-rose-600 hover:bg-rose-200" : "bg-gray-100 text-gray-500 hover:bg-rose-50 hover:text-rose-500"
      } ${pending ? "opacity-50" : ""}`}
    >
      <span>{myLike ? "❤️" : "🤍"}</span>
      <span>{likeCount}</span>
    </button>
  );
}

export default function StudentUnitDesignPage() {
  const [sessions, setSessions] = useState<QuestionSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [published, setPublished] = useState<Published[]>([]);
  const [likesVisible, setLikesVisible] = useState(true);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sessions")
      .then((res) => res.json())
      .then((data: QuestionSession[]) => {
        const unitDesignSessions = sortSessionsAsc(Array.isArray(data) ? data : [])
          .filter((session) => (session.sharedQuestions?.length ?? 0) > 0);
        setSessions(unitDesignSessions);
        if (unitDesignSessions.length > 0) setSelectedId(unitDesignSessions[0].id);
      })
      .catch(() => setSessions([]))
      .finally(() => setIsLoading(false));
  }, []);

  // 선택한 세션의 배포 질문(좋아요·댓글 대상)과 공개 설정을 불러온다
  useEffect(() => {
    if (!selectedId) return;
    setExpandedId(null);
    fetch(`/api/sessions/${selectedId}/publish-questions`)
      .then((r) => r.json())
      .then((d) => {
        setPublished(Array.isArray(d.published) ? d.published : []);
        setLikesVisible(d.likesVisible ?? true);
        setCommentsVisible(d.commentsVisible ?? false);
      })
      .catch(() => setPublished([]));
  }, [selectedId]);

  const selectedSession = sessions.find((session) => session.id === selectedId) ?? sessions[0] ?? null;
  const grouped = useMemo(
    () => groupSharedQuestions(selectedSession?.sharedQuestions ?? []).map(
      (g) => [g.group, g.questions] as [string, typeof g.questions],
    ),
    [selectedSession],
  );
  const pubByContent = useMemo(
    () => new Map(published.map((p) => [p.content.trim(), p])),
    [published],
  );

  const updateLike = (id: string, count: number, my: boolean) =>
    setPublished((prev) => prev.map((p) => (p.id === id ? { ...p, likeCount: count, myLike: my } : p)));
  const setCommentCount = (id: string, n: number) =>
    setPublished((prev) => prev.map((p) => (p.id === id ? { ...p, commentCount: n } : p)));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">질문 중심 탐구설계</h2>
        <p className="text-gray-600">선생님이 배포한 탐구 질문에 좋아요·댓글로 참여해 보세요</p>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">로딩 중...</div>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <p className="font-medium mb-1">배포된 탐구설계가 없습니다</p>
            <p className="text-sm text-gray-400">선생님이 탐구설계를 배포하면 여기에 표시됩니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">날짜 · 교과 · 단원/주제</CardTitle>
              <CardDescription>확인할 단원설계를 선택하세요</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setSelectedId(session.id)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    selectedSession?.id === session.id ? "border-indigo-300 bg-indigo-50" : "bg-white hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {buildSessionLabel(session.date, session.subject, session.topic)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {session.sharedQuestions?.length ?? 0}개 질문
                        {session.teacher?.name ? ` · ${session.teacher.name} 선생님` : ""}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {selectedSession
                    ? buildSessionLabel(selectedSession.date, selectedSession.subject, selectedSession.topic)
                    : "단원설계"}
                </CardTitle>
                <CardDescription>수업에서 다룰 질문 순서입니다. 질문에 좋아요·댓글로 참여해 보세요.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(selectedSession?.sharedQuestions ?? []).map((question, index) => {
                    const pub = pubByContent.get(question.content.trim());
                    return (
                      <div key={`${question.content}-${index}`} className="rounded-lg border bg-white p-3 dark:bg-card">
                        <div className="flex gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold text-white">
                            {index + 1}
                          </div>
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2 py-0.5 text-xs ${TYPE_STYLE[question.type] ?? TYPE_STYLE.student}`}>
                                {TYPE_LABEL[question.type] ?? question.type}
                              </span>
                              {question.contentGroup && (
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                                  {question.contentGroup}
                                </span>
                              )}
                              {question.lessonPhase && (
                                <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600">
                                  {question.lessonPhase}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-gray-900">{question.content}</p>
                            {question.rationale && <p className="text-xs text-gray-500">{question.rationale}</p>}
                            {pub && (
                              <div className="flex items-center gap-3 pt-1">
                                {likesVisible && (
                                  <LikeButton
                                    id={pub.id}
                                    likeCount={pub.likeCount}
                                    myLike={pub.myLike}
                                    onChange={(c, m) => updateLike(pub.id, c, m)}
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() => setExpandedId((e) => (e === pub.id ? null : pub.id))}
                                  className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                                >
                                  <span>💬 {pub.commentCount}</span>
                                  <span>{expandedId === pub.id ? "닫기" : "댓글"}</span>
                                </button>
                              </div>
                            )}
                            {pub && expandedId === pub.id && (
                              <div className="border-t pt-3">
                                <CommentThread questionId={pub.id} onCountChange={(n) => setCommentCount(pub.id, n)} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {grouped.length > 1 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">내용별 묶음</CardTitle>
                  <CardDescription>비슷한 질문끼리 정리된 결과입니다</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-2">
                    {grouped.map(([group, questions]) => (
                      <div key={group} className="rounded-lg border bg-white p-3 dark:bg-card">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-gray-800">{group}</h3>
                          <span className="text-xs text-gray-400">총 {questions.length}개</span>
                        </div>
                        <ul className="space-y-1 text-xs text-gray-600">
                          {questions.map((question, index) => (
                            <li key={`${question.content}-${index}`} className="line-clamp-2">
                              {question.priority}. {question.content}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

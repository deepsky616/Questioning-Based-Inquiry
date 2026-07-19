"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { useConfirm } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  AnyGame,
  GameVisibility,
  localizeQuestionGames,
} from "@/lib/question-games-data";
import { useTeacherStudents } from "@/lib/app-queries";
import { formatDateOnly } from "@/lib/datetime";
import {
  sumQuestionGameModes,
  type QuestionGameModeStats,
} from "@/lib/question-game-learning-summary";
import { QuestionGameSettlementHealthPanel } from "@/components/question-games/QuestionGameSettlementHealthPanel";
import {
  isQuestionGameSettlementHealth,
  type QuestionGameSettlementHealth,
} from "@/lib/question-game-settlement-health";
import { TeacherQuestionGameLearningOverview } from "@/components/question-games/TeacherQuestionGameLearningOverview";

type VisType = "all" | "classes" | "students" | "hidden";

interface TeacherClass {
  grade: string;
  className: string;
}
interface Student {
  id: string;
  name: string;
  grade: string;
  className: string;
}
interface StudentPlay {
  id: string;
  name: string;
  studentNumber: string | null;
  plays: number;
  completions: number;
  points: number;
  goodQuestions: number;
  modes: Record<"solo" | "ai" | "friend", QuestionGameModeStats>;
}
interface StudentLite { id: string; name: string; studentNumber: string | null }
interface GameStat { participants: number; plays: number; completions: number; goodQuestions: number; lastPlayedAt: string | null; students: StudentPlay[]; nonParticipants: StudentLite[] }

const VIS_LABEL: Record<VisType, { emoji: string; color: string }> = {
  all:      { emoji: "🌍", color: "#10b981" },
  classes:  { emoji: "🏫", color: "#3b82f6" },
  students: { emoji: "👤", color: "#8b5cf6" },
  hidden:   { emoji: "🔒", color: "#ef4444" },
};

export default function TeacherQuestionPlayPage() {
  const t = useTranslations("qPlay");
  const tc = useTranslations("common");
  const locale = useLocale();
  const tg = useTranslations("gamePlay");
  const { toast } = useToast();
  const [games, setGames] = useState<AnyGame[]>([]);
  const [visibilityMap, setVisibilityMap] = useState<Record<string, GameVisibility>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState("all");

  const { data: targetData } = useTeacherStudents<Student, TeacherClass>();
  const teacherClasses = useMemo(() => targetData?.teacherClasses ?? [], [targetData]);
  const students = useMemo(() => targetData?.students ?? [], [targetData]);

  // 참여 통계
  const [statsByGame, setStatsByGame] = useState<Record<string, GameStat>>({});
  const [statsDialogGame, setStatsDialogGame] = useState<AnyGame | null>(null);
  const [settlementHealth, setSettlementHealth] = useState<QuestionGameSettlementHealth | null>(null);
  const [settlementRepairing, setSettlementRepairing] = useState(false);

  // 가시성 편집 다이얼로그
  const [visDialogGame, setVisDialogGame] = useState<AnyGame | null>(null);
  const [editVis, setEditVis] = useState<GameVisibility>({ type: "all" });
  const [visSaving, setVisSaving] = useState(false);

  const load = useCallback(() => {
    setIsLoading(true);
    Promise.all([
      fetch("/api/teacher/question-games").then((r) => r.json()),
      fetch("/api/teacher/question-games/stats").then((r) => r.json()),
      fetch("/api/teacher/question-games/settlements")
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null),
    ])
      .then(([gamesData, statsData, settlementData]) => {
        setGames(gamesData.games ?? []);
        setVisibilityMap(gamesData.visibilityMap ?? {});
        setStatsByGame(statsData.byGame ?? {});
        if (isQuestionGameSettlementHealth(settlementData)) {
          setSettlementHealth(settlementData);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function repairSettlements() {
    setSettlementRepairing(true);
    try {
      const response = await fetch("/api/teacher/question-games/settlements", {
        method: "POST",
      });
      if (!response.ok) throw new Error();
      const data: unknown = await response.json();
      if (!isQuestionGameSettlementHealth(data)) throw new Error();
      setSettlementHealth(data);
      toast({ variant: "success", description: t("settlementRepairDone") });
    } catch {
      toast({ variant: "destructive", description: t("settlementRepairFailed") });
    } finally {
      setSettlementRepairing(false);
    }
  }

  // 가시성 저장
  async function saveVisibility() {
    if (!visDialogGame) return;
    setVisSaving(true);
    try {
      const res = await fetch(`/api/teacher/question-games/${visDialogGame.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: editVis }),
      });
      if (!res.ok) throw new Error();
      setVisibilityMap((prev) => ({ ...prev, [visDialogGame.id]: editVis }));
      setVisDialogGame(null);
      toast({ variant: "success", description: t("visSaveSuccess") });
    } catch {
      toast({ variant: "destructive", description: t("visSaveFailed") });
    }
    setVisSaving(false);
  }

  // 게임 삭제
  const confirm = useConfirm();

  async function deleteGame(game: AnyGame) {
    if (!(await confirm({ description: t("deleteConfirm", { title: game.title }), confirmText: tc("delete"), destructive: true }))) return;
    const res = await fetch(`/api/teacher/question-games/${game.id}`, { method: "DELETE" }).catch(() => null);
    if (!res || !res.ok) {
      toast({ variant: "destructive", description: t("deleteFailed") });
      return;
    }
    load();
  }

  const getVis = (gameId: string): GameVisibility =>
    visibilityMap[gameId] ?? { type: "all" };

  const localizedGames = useMemo(() => localizeQuestionGames(games, locale), [games, locale]);

  const filtered = localizedGames.filter((g) => {
    if (tab === "all") return true;
    if (tab === "public") return g.isBuiltIn && getVis(g.id).type !== "hidden";
    if (tab === "hidden") return g.isBuiltIn && getVis(g.id).type === "hidden";
    return true;
  });

  const publicCount = games.filter(
    (g) => g.isBuiltIn && getVis(g.id).type !== "hidden",
  ).length;
  const hiddenCount = games.filter(
    (g) => g.isBuiltIn && getVis(g.id).type === "hidden",
  ).length;

  // 드래그앤드롭 순서 변경(전체 탭에서만). 저장하면 학생 목록에도 반영
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const saveOrder = async (ordered: AnyGame[]) => {
    await fetch("/api/teacher/question-games/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: ordered.map((g) => g.id) }),
    }).catch(() => {});
  };
  const handleDropAt = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) { setDragIndex(null); return; }
    setGames((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(dragIndex, 1);
      copy.splice(targetIndex, 0, moved);
      saveOrder(copy);
      return copy;
    });
    setDragIndex(null);
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("subtitle")}
        </p>
      </div>

      <QuestionGameSettlementHealthPanel
        health={settlementHealth}
        repairing={settlementRepairing}
        onRepair={() => { void repairSettlements(); }}
      />

      <TeacherQuestionGameLearningOverview
        classes={teacherClasses}
        students={students}
        statsByGame={statsByGame}
      />

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: t("statAll"), value: games.length, emoji: "🎮", color: "#7C3AED" },
          { label: t("statPublic"), value: publicCount, emoji: "🌍", color: "#047857" },
          { label: t("statHidden"), value: hiddenCount, emoji: "🔒", color: "#B91C1C" },
        ].map((stat) => (
          <div
            key={stat.emoji}
            className="rounded-2xl p-4 text-white text-center"
            style={{ background: stat.color }}
          >
            <div className="text-3xl mb-1">{stat.emoji}</div>
            <div className="text-2xl font-black">{stat.value}</div>
            <div className="text-sm text-white">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* 필터 탭 */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">{t("tabAll", { count: games.length })}</TabsTrigger>
          <TabsTrigger value="public">{t("tabPublic", { count: publicCount })}</TabsTrigger>
          <TabsTrigger value="hidden">{t("tabHidden", { count: hiddenCount })}</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* 로딩 */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="text-4xl animate-bounce">🎲</div>
        </div>
      )}

      {/* 게임 카드 그리드 */}
      {!isLoading && tab === "all" && (
        <p className="text-xs text-muted-foreground mb-2">{t("dragHint")}</p>
      )}
      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((game, index) => {
            const vis = getVis(game.id);
            const visInfo = VIS_LABEL[vis.type];
            const dndEnabled = tab === "all";
            return (
              <div
                key={game.id}
                draggable={dndEnabled}
                onDragStart={() => dndEnabled && setDragIndex(index)}
                onDragOver={(e) => { if (dndEnabled) e.preventDefault(); }}
                onDrop={() => dndEnabled && handleDropAt(index)}
                className={`rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-md transition-shadow ${dndEnabled ? "cursor-move" : ""} ${dragIndex === index ? "opacity-50 ring-2 ring-indigo-400" : ""}`}
              >
                {/* 카드 헤더 */}
                <div
                  className="relative h-28 flex items-center justify-between px-5 overflow-hidden"
                  style={{ background: game.gradientCss }}
                >
                  <div
                    className="absolute -top-4 -right-4 w-20 h-20 rounded-full"
                    style={{ background: "rgba(255,255,255,0.1)" }}
                  />
                  <div className="flex items-center gap-4">
                    <span className="text-5xl drop-shadow">{game.emoji}</span>
                    <div className="text-white">
                      <h3 className="font-black text-lg leading-tight">{game.title}</h3>
                      {game.isBuiltIn ? (
                        <span className="text-white text-xs">{t("builtIn")}</span>
                      ) : (
                        <span className="text-white text-xs">{t("custom")}</span>
                      )}
                    </div>
                  </div>
                  {game.isBuiltIn ? (
                    <span
                      className="bg-black/25 backdrop-blur-sm rounded-full px-3 py-1 text-white text-xs font-bold flex items-center gap-1"
                    >
                      {visInfo.emoji} {t(`vis_${vis.type}`)}
                    </span>
                  ) : (
                    <span className="max-w-32 bg-black/25 backdrop-blur-sm rounded-lg px-3 py-1.5 text-center text-white text-xs font-bold leading-tight">
                      {t("customStudentUnavailable")}
                    </span>
                  )}
                </div>

                {/* 카드 바디 */}
                <div className="p-4">
                  <p className="text-muted-foreground text-sm mb-3 line-clamp-2 leading-relaxed">
                    {game.description}
                  </p>
                  <div className="flex gap-2 mb-3">
                    <span className="text-xs bg-muted border border-border rounded-full px-2.5 py-0.5 text-muted-foreground">
                      👥 {game.playerCount}
                    </span>
                    <span className="text-xs bg-muted border border-border rounded-full px-2.5 py-0.5 text-muted-foreground">
                      ⏱ {game.duration}
                    </span>
                  </div>

                  {/* 참여 요약 */}
                  {(() => {
                    const st = statsByGame[game.id];
                    const rate = st && st.plays > 0 ? Math.round((st.completions / st.plays) * 100) : 0;
                    return (
                      <div className="mb-3 rounded-xl bg-indigo-50/60 px-3 py-2 text-xs text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
                        {st && st.plays > 0 ? (
                          <span>{t.rich("statLine", { participants: st.participants, plays: st.plays, rate, good: st.goodQuestions, b: (c) => <b>{c}</b> })}</span>
                        ) : (
                          <span className="text-muted-foreground dark:text-muted-foreground">{t("noStats")}</span>
                        )}
                      </div>
                    );
                  })()}

                  {/* 기본 제공 놀이 실행 */}
                  {game.isBuiltIn && (
                    <div className="mb-2 grid grid-cols-2 gap-2">
                      <Button asChild variant="gradient" size="sm" className="text-xs rounded-lg">
                        <Link href={`/teacher-question-play/${game.id}/host`}>{t("openFriendRoom")}</Link>
                      </Button>
                      <Button asChild variant="outline" size="sm" className="text-xs rounded-lg">
                        <Link href={`/teacher-question-play/${game.id}/preview`}>{t("experience")}</Link>
                      </Button>
                    </div>
                  )}

                  {/* 액션 버튼 */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs rounded-xl"
                      onClick={() => setStatsDialogGame(game)}
                    >
                      {t("participation")}
                    </Button>
                    {game.isBuiltIn && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs rounded-xl"
                        onClick={() => {
                          setVisDialogGame(game);
                          setEditVis(getVis(game.id));
                        }}
                      >
                        {t("visSettings")}
                      </Button>
                    )}
                    {!game.isBuiltIn && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs rounded-xl text-red-500 border-red-200 hover:bg-red-50"
                        onClick={() => deleteGame(game)}
                      >
                        🗑
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 참여 현황 다이얼로그 ── */}
      <Dialog open={!!statsDialogGame} onOpenChange={(o) => { if (!o) setStatsDialogGame(null); }}>
        <DialogContent className="max-w-lg">
          {statsDialogGame && (() => {
            const st = statsByGame[statsDialogGame.id];
            const rate = st && st.plays > 0 ? Math.round((st.completions / st.plays) * 100) : 0;
            const modeTotals = sumQuestionGameModes(st?.students ?? []);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span>{statsDialogGame.emoji}</span> {t("statsDialogTitle", { title: statsDialogGame.title })}
                  </DialogTitle>
                </DialogHeader>
                {!st || st.students.length === 0 ? (
                  <EmptyState icon="🎮" title={t("noParticipants")} />
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-1">{t("chipParticipants", { n: st.participants })}</span>
                      <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-1">{t("chipPlays", { n: st.plays })}</span>
                      <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-1">{t("chipRate", { n: rate })}</span>
                      <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-1">{t("chipGood", { n: st.goodQuestions })}</span>
                      {st.lastPlayedAt && (
                        <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-1">{t("chipRecent", { date: formatDateOnly(st.lastPlayedAt) })}</span>
                      )}
                    </div>
                    <section aria-label={t("modeCompareTitle")} className="border-y border-border py-3">
                      <h3 className="mb-2 text-xs font-bold text-foreground">{t("modeCompareTitle")}</h3>
                      <div className="grid grid-cols-3 divide-x divide-border">
                        {(["solo", "ai", "friend"] as const).map((mode) => (
                          <div className="min-w-0 px-2 text-center first:pl-0 last:pr-0" key={mode}>
                            <p className="text-xs font-bold text-foreground">{t(`mode_${mode}`)}</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {t("modeStatLine", {
                                plays: modeTotals[mode].plays,
                                completions: modeTotals[mode].completions,
                              })}
                            </p>
                            <p className="text-xs font-semibold text-foreground">
                              {t("modePointLine", { points: modeTotals[mode].points })}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left">{t("colStudent")}</th>
                            <th className="px-3 py-2 text-right">{t("colPlay")}</th>
                            <th className="px-3 py-2 text-right">{t("colComplete")}</th>
                            <th className="px-3 py-2 text-right">{t("colGood")}</th>
                            <th className="px-3 py-2 text-right">{t("colPoint")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {st.students.map((s) => (
                            <tr key={s.id}>
                              <td className="px-3 py-2">
                                {s.studentNumber ? <span className="text-muted-foreground mr-1">{s.studentNumber}.</span> : null}
                                <span className="font-medium text-foreground">{s.name}</span>
                                <p className="mt-0.5 whitespace-nowrap text-[11px] text-muted-foreground">
                                  {t("studentModeLine", {
                                    solo: s.modes?.solo.plays ?? 0,
                                    ai: s.modes?.ai.plays ?? 0,
                                    friend: s.modes?.friend.plays ?? 0,
                                  })}
                                </p>
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-indigo-900 dark:text-indigo-200">{s.plays}</td>
                              <td className="px-3 py-2 text-right text-emerald-900 dark:text-emerald-200">{s.completions}</td>
                              <td className="px-3 py-2 text-right text-amber-900 dark:text-amber-200">{s.goodQuestions}</td>
                              <td className="px-3 py-2 text-right font-bold text-rose-900 dark:text-rose-200">{s.points}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* 미참여 학생 */}
                    {st.nonParticipants.length > 0 && (
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-xs font-semibold text-foreground mb-1.5">{t("notParticipated", { n: st.nonParticipants.length })}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {st.nonParticipants.map((s) => (
                            <span key={s.id} className="text-xs rounded-full bg-muted text-muted-foreground px-2 py-0.5">
                              {s.studentNumber ? `${s.studentNumber}. ` : ""}{s.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── 가시성 편집 다이얼로그 ── */}
      <Dialog open={!!visDialogGame} onOpenChange={(o) => { if (!o) setVisDialogGame(null); }}>
        <DialogContent className="max-w-md">
          {visDialogGame && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span>{visDialogGame.emoji}</span> {t("visDialogTitle", { title: visDialogGame.title })}
                </DialogTitle>
              </DialogHeader>

              {/* 가시성 타입 선택 */}
              <div className="space-y-2 mt-2">
                {(["all", "classes", "students", "hidden"] as VisType[]).map((type) => {
                  const info = VIS_LABEL[type];
                  const selected = editVis.type === type;
                  return (
                    <button
                      key={type}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-border transition-all text-left hover:bg-muted/50"
                      style={{
                        borderColor: selected ? info.color : undefined,
                        background: selected ? `${info.color}1a` : undefined,
                      }}
                      onClick={() => setEditVis({ type })}
                    >
                      <span className="text-2xl">{info.emoji}</span>
                      <div>
                        <p className="font-bold text-foreground text-sm">{t(`vis_${type}`)}</p>
                        <p className="text-muted-foreground text-xs">
                          {type === "all" && t("visDesc_all")}
                          {type === "classes" && t("visDesc_classes")}
                          {type === "students" && t("visDesc_students")}
                          {type === "hidden" && t("visDesc_hidden")}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 학급 선택 */}
              {editVis.type === "classes" && teacherClasses.length > 0 && (
                <div className="mt-4">
                  <Label className="text-sm font-bold text-foreground mb-2 block">
                    {t("selectClasses")}
                  </Label>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {teacherClasses.map((tc) => {
                      const key = `${tc.grade}-${tc.className}`;
                      const checked = (editVis.classKeys ?? []).includes(key);
                      return (
                        <label
                          key={key}
                          className="flex items-center gap-2 p-2.5 rounded-lg border border-border cursor-pointer hover:bg-muted text-sm text-foreground"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const keys = editVis.classKeys ?? [];
                              setEditVis({
                                ...editVis,
                                classKeys: e.target.checked
                                  ? [...keys, key]
                                  : keys.filter((k) => k !== key),
                              });
                            }}
                            className="accent-blue-500"
                          />
                          {t("gradeClass", { grade: tc.grade, className: tc.className })}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 학생 선택 */}
              {editVis.type === "students" && students.length > 0 && (
                <div className="mt-4">
                  <Label className="text-sm font-bold text-foreground mb-2 block">
                    {t("selectStudents")}
                  </Label>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {students.map((s) => {
                      const checked = (editVis.studentIds ?? []).includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className="flex items-center gap-2 p-2 rounded-lg border border-border cursor-pointer hover:bg-muted text-sm text-foreground"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const ids = editVis.studentIds ?? [];
                              setEditVis({
                                ...editVis,
                                studentIds: e.target.checked
                                  ? [...ids, s.id]
                                  : ids.filter((i) => i !== s.id),
                              });
                            }}
                            className="accent-purple-500"
                          />
                          <span className="font-medium">{s.name}</span>
                          <span className="text-muted-foreground text-xs ml-auto">
                            {t("gradeClass", { grade: s.grade, className: s.className })}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <DialogFooter className="mt-6">
                <Button variant="outline" onClick={() => setVisDialogGame(null)}>
                  {tc("cancel")}
                </Button>
                <Button onClick={saveVisibility} disabled={visSaving} className="font-bold">
                  {visSaving ? t("saving") : tc("save")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

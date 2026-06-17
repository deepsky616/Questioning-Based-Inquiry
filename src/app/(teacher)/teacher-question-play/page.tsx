"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AnyGame,
  GameVisibility,
} from "@/lib/question-games-data";

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

const VIS_LABEL: Record<VisType, { label: string; emoji: string; color: string }> = {
  all:      { label: "전체공개", emoji: "🌍", color: "#10b981" },
  classes:  { label: "학급공개", emoji: "🏫", color: "#3b82f6" },
  students: { label: "학생공개", emoji: "👤", color: "#8b5cf6" },
  hidden:   { label: "비공개",   emoji: "🔒", color: "#ef4444" },
};

export default function TeacherQuestionPlayPage() {
  const [games, setGames] = useState<AnyGame[]>([]);
  const [visibilityMap, setVisibilityMap] = useState<Record<string, GameVisibility>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState("all");

  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  // 가시성 편집 다이얼로그
  const [visDialogGame, setVisDialogGame] = useState<AnyGame | null>(null);
  const [editVis, setEditVis] = useState<GameVisibility>({ type: "all" });
  const [visSaving, setVisSaving] = useState(false);

  const load = useCallback(() => {
    setIsLoading(true);
    Promise.all([
      fetch("/api/teacher/question-games").then((r) => r.json()),
      fetch("/api/teacher/students").then((r) => r.json()),
    ])
      .then(([gamesData, studentsData]) => {
        setGames(gamesData.games ?? []);
        setVisibilityMap(gamesData.visibilityMap ?? {});
        setTeacherClasses(studentsData.teacherClasses ?? []);
        setStudents(studentsData.students ?? []);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // 가시성 저장
  async function saveVisibility() {
    if (!visDialogGame) return;
    setVisSaving(true);
    try {
      await fetch(`/api/teacher/question-games/${visDialogGame.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: editVis }),
      });
      setVisibilityMap((prev) => ({ ...prev, [visDialogGame.id]: editVis }));
      setVisDialogGame(null);
    } catch {}
    setVisSaving(false);
  }

  // 게임 삭제
  async function deleteGame(game: AnyGame) {
    if (!confirm(`"${game.title}" 놀이를 삭제할까요?`)) return;
    await fetch(`/api/teacher/question-games/${game.id}`, { method: "DELETE" });
    load();
  }

  const getVis = (gameId: string): GameVisibility =>
    visibilityMap[gameId] ?? { type: "all" };

  const filtered = games.filter((g) => {
    if (tab === "all") return true;
    if (tab === "public") return getVis(g.id).type !== "hidden";
    if (tab === "hidden") return getVis(g.id).type === "hidden";
    return true;
  });

  const publicCount = games.filter((g) => getVis(g.id).type !== "hidden").length;
  const hiddenCount = games.filter((g) => getVis(g.id).type === "hidden").length;

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
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          🎮 질문놀이 관리
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          학생들에게 질문놀이를 공개해보세요
        </p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "전체 놀이", value: games.length, emoji: "🎮", color: "#7C3AED" },
          { label: "공개 중",   value: publicCount,   emoji: "🌍", color: "#10b981" },
          { label: "비공개",    value: hiddenCount,   emoji: "🔒", color: "#ef4444" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl p-4 text-white text-center"
            style={{ background: stat.color }}
          >
            <div className="text-3xl mb-1">{stat.emoji}</div>
            <div className="text-2xl font-black">{stat.value}</div>
            <div className="text-sm opacity-80">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* 필터 탭 */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">전체 ({games.length})</TabsTrigger>
          <TabsTrigger value="public">공개 ({publicCount})</TabsTrigger>
          <TabsTrigger value="hidden">비공개 ({hiddenCount})</TabsTrigger>
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
        <p className="text-xs text-gray-500 mb-2">↕️ 카드를 드래그해 순서를 바꾸면 학생 질문놀이 목록에도 같은 순서로 표시돼요.</p>
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
                className={`rounded-2xl overflow-hidden border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow ${dndEnabled ? "cursor-move" : ""} ${dragIndex === index ? "opacity-50 ring-2 ring-indigo-400" : ""}`}
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
                        <span className="text-white/70 text-xs">기본 제공</span>
                      ) : (
                        <span className="text-white/70 text-xs">커스텀</span>
                      )}
                    </div>
                  </div>
                  {/* 가시성 뱃지 */}
                  <span
                    className="bg-white/25 backdrop-blur-sm rounded-full px-3 py-1 text-white text-xs font-bold flex items-center gap-1"
                  >
                    {visInfo.emoji} {visInfo.label}
                  </span>
                </div>

                {/* 카드 바디 */}
                <div className="p-4">
                  <p className="text-gray-500 text-sm mb-3 line-clamp-2 leading-relaxed">
                    {game.description}
                  </p>
                  <div className="flex gap-2 mb-4">
                    <span className="text-xs bg-gray-50 border border-gray-100 rounded-full px-2.5 py-0.5 text-gray-500">
                      👥 {game.playerCount}
                    </span>
                    <span className="text-xs bg-gray-50 border border-gray-100 rounded-full px-2.5 py-0.5 text-gray-500">
                      ⏱ {game.duration}
                    </span>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs rounded-xl"
                      onClick={() => {
                        setVisDialogGame(game);
                        setEditVis(getVis(game.id));
                      }}
                    >
                      ⚙️ 공개 설정
                    </Button>
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

      {/* ── 가시성 편집 다이얼로그 ── */}
      <Dialog open={!!visDialogGame} onOpenChange={(o) => { if (!o) setVisDialogGame(null); }}>
        <DialogContent className="max-w-md">
          {visDialogGame && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span>{visDialogGame.emoji}</span> {visDialogGame.title} 공개 설정
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
                      className="w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left"
                      style={{
                        borderColor: selected ? info.color : "#e5e7eb",
                        background: selected ? `${info.color}10` : "white",
                      }}
                      onClick={() => setEditVis({ type })}
                    >
                      <span className="text-2xl">{info.emoji}</span>
                      <div>
                        <p className="font-bold text-gray-800 text-sm">{info.label}</p>
                        <p className="text-gray-400 text-xs">
                          {type === "all" && "모든 학생이 볼 수 있어요"}
                          {type === "classes" && "특정 학급 학생만 볼 수 있어요"}
                          {type === "students" && "특정 학생만 볼 수 있어요"}
                          {type === "hidden" && "학생에게 표시되지 않아요"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 학급 선택 */}
              {editVis.type === "classes" && teacherClasses.length > 0 && (
                <div className="mt-4">
                  <Label className="text-sm font-bold text-gray-700 mb-2 block">
                    공개할 학급 선택
                  </Label>
                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {teacherClasses.map((tc) => {
                      const key = `${tc.grade}-${tc.className}`;
                      const checked = (editVis.classKeys ?? []).includes(key);
                      return (
                        <label
                          key={key}
                          className="flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer hover:bg-gray-50 text-sm"
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
                          {tc.grade}학년 {tc.className}반
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 학생 선택 */}
              {editVis.type === "students" && students.length > 0 && (
                <div className="mt-4">
                  <Label className="text-sm font-bold text-gray-700 mb-2 block">
                    공개할 학생 선택
                  </Label>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {students.map((s) => {
                      const checked = (editVis.studentIds ?? []).includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:bg-gray-50 text-sm"
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
                          <span className="text-gray-400 text-xs ml-auto">
                            {s.grade}학년 {s.className}반
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <DialogFooter className="mt-6">
                <Button variant="outline" onClick={() => setVisDialogGame(null)}>
                  취소
                </Button>
                <Button onClick={saveVisibility} disabled={visSaving} className="font-bold">
                  {visSaving ? "저장 중..." : "저장"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

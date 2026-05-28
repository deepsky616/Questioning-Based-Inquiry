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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  AnyGame,
  GameVisibility,
  GRADIENT_PRESETS,
  EMOJI_PRESETS,
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

  // 새 게임 생성 다이얼로그
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    emoji: "🎮",
    gradientPresetId: "violet",
    playerCount: "2~30명",
    duration: "20분",
    instructions: [""],
  });

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

  // 새 게임 생성
  async function createGame() {
    const preset = GRADIENT_PRESETS.find((p) => p.id === form.gradientPresetId) ?? GRADIENT_PRESETS[0];
    setCreating(true);
    try {
      await fetch("/api/teacher/question-games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          emoji: form.emoji,
          gradientCss: preset.css,
          accentColor: preset.accent,
          playerCount: form.playerCount,
          duration: form.duration,
          instructions: form.instructions.filter((i) => i.trim()),
        }),
      });
      setShowCreate(false);
      setForm({ title: "", description: "", emoji: "🎮", gradientPresetId: "violet", playerCount: "2~30명", duration: "20분", instructions: [""] });
      load();
    } catch {}
    setCreating(false);
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

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            🎮 질문놀이 관리
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            학생들에게 질문놀이를 공개하고 새로운 놀이를 만들어보세요
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 font-bold rounded-xl px-6"
          style={{ background: "linear-gradient(135deg, #7C3AED, #EC4899)" }}
        >
          <span className="text-lg">+</span> 새 놀이 만들기
        </Button>
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
      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((game) => {
            const vis = getVis(game.id);
            const visInfo = VIS_LABEL[vis.type];
            return (
              <div
                key={game.id}
                className="rounded-2xl overflow-hidden border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow"
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

      {/* ── 새 놀이 만들기 다이얼로그 ── */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) setShowCreate(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">🎨 새 질문놀이 만들기</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* 이름 */}
            <div>
              <Label className="text-sm font-bold text-gray-700 mb-1.5 block">
                놀이 이름 <span className="text-red-500">*</span>
              </Label>
              <Input
                placeholder="예) 질문 스피드 퀴즈"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="rounded-xl"
              />
            </div>

            {/* 설명 */}
            <div>
              <Label className="text-sm font-bold text-gray-700 mb-1.5 block">
                놀이 설명 <span className="text-red-500">*</span>
              </Label>
              <Textarea
                placeholder="이 놀이가 어떤 놀이인지 간단히 설명해주세요"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="rounded-xl resize-none h-20"
              />
            </div>

            {/* 이모지 선택 */}
            <div>
              <Label className="text-sm font-bold text-gray-700 mb-1.5 block">
                아이콘 이모지 선택
              </Label>
              <div className="grid grid-cols-8 gap-1 p-3 bg-gray-50 rounded-xl">
                {EMOJI_PRESETS.map((emoji) => (
                  <button
                    key={emoji}
                    className="text-2xl p-1.5 rounded-lg transition-all hover:scale-110"
                    style={{
                      background: form.emoji === emoji ? "#ede9fe" : "transparent",
                      outline: form.emoji === emoji ? "2px solid #7C3AED" : "none",
                    }}
                    onClick={() => setForm({ ...form, emoji })}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* 색상 선택 */}
            <div>
              <Label className="text-sm font-bold text-gray-700 mb-1.5 block">
                테마 색상 선택
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {GRADIENT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className="h-12 rounded-xl font-medium text-white text-sm transition-all hover:scale-105"
                    style={{
                      background: preset.css,
                      outline: form.gradientPresetId === preset.id ? "3px solid #1f2937" : "none",
                      outlineOffset: "2px",
                    }}
                    onClick={() => setForm({ ...form, gradientPresetId: preset.id })}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 인원/시간 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-bold text-gray-700 mb-1.5 block">
                  참여 인원
                </Label>
                <Input
                  placeholder="예) 2~30명"
                  value={form.playerCount}
                  onChange={(e) => setForm({ ...form, playerCount: e.target.value })}
                  className="rounded-xl"
                />
              </div>
              <div>
                <Label className="text-sm font-bold text-gray-700 mb-1.5 block">
                  소요 시간
                </Label>
                <Input
                  placeholder="예) 20~30분"
                  value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>

            {/* 게임 방법 */}
            <div>
              <Label className="text-sm font-bold text-gray-700 mb-1.5 block">
                게임 방법 (단계별로 입력)
              </Label>
              <div className="space-y-2">
                {form.instructions.map((step, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <span
                      className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white mt-1"
                      style={{ background: GRADIENT_PRESETS.find((p) => p.id === form.gradientPresetId)?.accent }}
                    >
                      {idx + 1}
                    </span>
                    <Input
                      placeholder={`${idx + 1}단계 설명`}
                      value={step}
                      onChange={(e) => {
                        const updated = [...form.instructions];
                        updated[idx] = e.target.value;
                        setForm({ ...form, instructions: updated });
                      }}
                      className="rounded-xl flex-1"
                    />
                    {form.instructions.length > 1 && (
                      <button
                        className="text-red-400 hover:text-red-600 text-lg mt-1"
                        onClick={() =>
                          setForm({
                            ...form,
                            instructions: form.instructions.filter((_, i) => i !== idx),
                          })
                        }
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm hover:border-gray-300 hover:text-gray-500 transition-colors"
                  onClick={() => setForm({ ...form, instructions: [...form.instructions, ""] })}
                >
                  + 단계 추가
                </button>
              </div>
            </div>

            {/* 미리보기 */}
            {form.title && (
              <div>
                <Label className="text-sm font-bold text-gray-700 mb-1.5 block">
                  미리보기
                </Label>
                <div className="rounded-xl overflow-hidden border border-gray-100">
                  <div
                    className="h-24 flex items-center justify-center gap-4"
                    style={{
                      background: GRADIENT_PRESETS.find((p) => p.id === form.gradientPresetId)?.css,
                    }}
                  >
                    <span className="text-5xl">{form.emoji}</span>
                    <span className="text-white font-black text-xl">{form.title}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              취소
            </Button>
            <Button
              onClick={createGame}
              disabled={creating || !form.title.trim() || !form.description.trim()}
              className="font-bold text-white"
              style={{
                background: GRADIENT_PRESETS.find((p) => p.id === form.gradientPresetId)?.css,
              }}
            >
              {creating ? "만드는 중..." : "놀이 만들기 🎉"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

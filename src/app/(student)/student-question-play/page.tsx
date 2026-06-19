"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AnyGame } from "@/lib/question-games-data";
import { EmptyState } from "@/components/shared/EmptyState";

export default function StudentQuestionPlayPage() {
  const [games, setGames] = useState<AnyGame[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<AnyGame | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/question-games")
      .then((r) => r.json())
      .then((data: AnyGame[]) => setGames(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  function startGame(game: AnyGame) {
    setSelectedGame(null);
    router.push(`/student-question-play/${game.id}`);
  }

  return (
    <div className="min-h-screen">
      {/* 히어로 배너 */}
      <div
        className="relative overflow-hidden rounded-3xl mb-10 py-14 px-8 text-center text-white"
        style={{ background: "linear-gradient(135deg, #7C3AED 0%, #EC4899 50%, #F59E0B 100%)" }}
      >
        <span className="absolute top-4 left-6 text-5xl opacity-20 select-none">⭐</span>
        <span className="absolute top-8 right-10 text-4xl opacity-20 select-none">🌟</span>
        <span className="absolute bottom-4 left-20 text-3xl opacity-20 select-none">✨</span>
        <span className="absolute bottom-6 right-16 text-5xl opacity-20 select-none">💫</span>
        <span className="absolute top-1/2 left-4 -translate-y-1/2 text-6xl opacity-10 select-none">🎮</span>
        <span className="absolute top-1/2 right-4 -translate-y-1/2 text-6xl opacity-10 select-none">🎮</span>
        <div className="relative z-10">
          <div className="text-7xl mb-4 drop-shadow-lg">🎮</div>
          <h1 className="text-5xl font-black mb-3 tracking-tight" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
            질문놀이
          </h1>
          <p className="text-xl font-medium opacity-90">놀이로 배우는 신나는 질문의 세계! 🚀</p>
          <div className="mt-4 flex justify-center gap-3">
            <span className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-1 text-sm font-medium">
              총 {games.length}가지 놀이
            </span>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="text-5xl animate-bounce">🎲</div>
          <p className="text-muted-foreground font-medium">놀이를 불러오는 중...</p>
        </div>
      )}

      {!isLoading && games.length === 0 && (
        <EmptyState icon="😢" title="아직 공개된 놀이가 없어요" description="선생님께 질문놀이 공개를 요청해보세요!" className="py-24" />
      )}

      {!isLoading && games.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {games.map((game, i) => (
            <GameCard key={game.id} game={game} index={i} onSelect={() => setSelectedGame(game)} />
          ))}
        </div>
      )}

      {/* 게임 안내 다이얼로그 */}
      <Dialog open={!!selectedGame} onOpenChange={(o) => { if (!o) setSelectedGame(null); }}>
        <DialogContent className="max-w-md">
          {selectedGame && (
            <>
              <div
                className="relative -mx-6 -mt-6 mb-6 rounded-t-lg py-8 flex flex-col items-center text-white overflow-hidden"
                style={{ background: selectedGame.gradientCss }}
              >
                <span className="absolute top-2 left-4 text-2xl opacity-20">⭐</span>
                <span className="absolute bottom-2 right-4 text-2xl opacity-20">✨</span>
                <div className="text-6xl mb-2 drop-shadow">{selectedGame.emoji}</div>
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black text-white text-center">
                    {selectedGame.title}
                  </DialogTitle>
                </DialogHeader>
                <p className="text-white/90 text-sm mt-1 text-center px-6">{selectedGame.description}</p>
                <div className="flex gap-3 mt-3">
                  <span className="bg-white/20 rounded-full px-3 py-0.5 text-xs font-medium">👥 {selectedGame.playerCount}</span>
                  <span className="bg-white/20 rounded-full px-3 py-0.5 text-xs font-medium">⏱ {selectedGame.duration}</span>
                </div>
              </div>

              <div className="px-2">
                <h3 className="font-bold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white font-bold"
                    style={{ background: selectedGame.accentColor }}>!</span>
                  게임 방법
                </h3>
                <ol className="space-y-3">
                  {selectedGame.instructions.map((step, idx) => (
                    <li key={idx} className="flex gap-3">
                      <span className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white mt-0.5"
                        style={{ background: selectedGame.accentColor }}>
                        {idx + 1}
                      </span>
                      <span className="text-foreground text-sm leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="mt-6 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setSelectedGame(null)}>
                  닫기
                </Button>
                <Button
                  className="flex-1 font-bold text-white rounded-xl"
                  style={{ background: selectedGame.gradientCss }}
                  onClick={() => startGame(selectedGame)}
                >
                  🎮 게임 시작!
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GameCard({ game, index, onSelect }: { game: AnyGame; index: number; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="rounded-2xl overflow-hidden bg-card border border-border cursor-pointer"
      style={{
        boxShadow: hovered ? "0 20px 40px rgba(0,0,0,0.12)" : "0 4px 16px rgba(0,0,0,0.06)",
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
        transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
        animationDelay: `${index * 60}ms`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
    >
      <div className="relative h-44 flex items-center justify-center overflow-hidden" style={{ background: game.gradientCss }}>
        <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
        <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
        <span className="absolute top-3 left-5 text-white/30 text-xl select-none">✦</span>
        <span className="absolute bottom-3 right-5 text-white/30 text-xl select-none">✦</span>
        <span
          className="relative z-10 select-none"
          style={{
            fontSize: "5rem",
            filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.2))",
            transform: hovered ? "scale(1.1) rotate(-5deg)" : "scale(1) rotate(0deg)",
            transition: "transform 0.3s ease",
            display: "block",
          }}
        >
          {game.emoji}
        </span>
        {game.isBuiltIn && (
          <span className="absolute top-3 right-3 bg-white/25 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full font-medium">
            기본 제공
          </span>
        )}
      </div>
      <div className="p-5">
        <h3 className="text-xl font-black text-foreground mb-1.5">{game.title}</h3>
        <p className="text-muted-foreground text-sm mb-4 leading-relaxed line-clamp-2">{game.description}</p>
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="flex items-center gap-1 bg-muted/40 border border-border text-muted-foreground text-xs px-2.5 py-1 rounded-full">
            👥 {game.playerCount}
          </span>
          <span className="flex items-center gap-1 bg-muted/40 border border-border text-muted-foreground text-xs px-2.5 py-1 rounded-full">
            ⏱ {game.duration}
          </span>
        </div>
        <button
          className="w-full py-3 rounded-xl font-bold text-white text-sm tracking-wide transition-opacity hover:opacity-90"
          style={{ background: game.gradientCss }}
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          놀이하기 →
        </button>
      </div>
    </div>
  );
}

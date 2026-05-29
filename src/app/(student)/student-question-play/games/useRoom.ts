import { useState, useEffect, useRef, useCallback } from "react";
import type { GameRoom } from "@/lib/question-games-data";

const POLL_INTERVAL = 2000;

interface UseRoomResult {
  room: GameRoom | null;
  error: string | null;
  actionLoading: boolean;
  createRoom: (gameId: string) => Promise<GameRoom | null>;
  joinRoom: (code: string) => Promise<GameRoom | null>;
  sendAction: (action: string, extra?: Record<string, unknown>) => Promise<GameRoom | null>;
  leaveRoom: () => Promise<void>;
  setActiveCode: (code: string | null) => void;
}

export function useRoom(): UseRoomResult {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 폴링: activeCode가 있으면 2초마다 방 상태 갱신
  useEffect(() => {
    if (!activeCode) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/question-games/rooms/${activeCode}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.room) setRoom(data.room);
      } catch {}
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      cancelled = true;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [activeCode]);

  const createRoom = useCallback(async (gameId: string): Promise<GameRoom | null> => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/question-games/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "방 생성 실패"); return null; }
      setRoom(data.room);
      setActiveCode(data.room.code);
      return data.room;
    } catch {
      setError("네트워크 오류");
      return null;
    } finally {
      setActionLoading(false);
    }
  }, []);

  const joinRoom = useCallback(async (code: string): Promise<GameRoom | null> => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/question-games/rooms/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "참가 실패"); return null; }
      setRoom(data.room);
      setActiveCode(code);
      return data.room;
    } catch {
      setError("네트워크 오류");
      return null;
    } finally {
      setActionLoading(false);
    }
  }, []);

  const sendAction = useCallback(
    async (action: string, extra: Record<string, unknown> = {}): Promise<GameRoom | null> => {
      if (!activeCode) return null;
      setActionLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/question-games/rooms/${activeCode}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? "작업 실패"); return null; }
        if (data.room) setRoom(data.room);
        return data.room;
      } catch {
        setError("네트워크 오류");
        return null;
      } finally {
        setActionLoading(false);
      }
    },
    [activeCode]
  );

  const leaveRoom = useCallback(async () => {
    if (!activeCode) return;
    try {
      await fetch(`/api/question-games/rooms/${activeCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave" }),
      });
    } catch {}
    setActiveCode(null);
    setRoom(null);
  }, [activeCode]);

  return { room, error, actionLoading, createRoom, joinRoom, sendAction, leaveRoom, setActiveCode };
}

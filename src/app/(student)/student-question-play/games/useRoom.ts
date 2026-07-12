import { useState, useEffect, useRef, useCallback } from "react";
import type { GameRoom, RoomActionHandler } from "@/lib/question-games-data";
import { APP_ROOM_POLL_MS, visibleRefetchInterval } from "@/lib/query-refresh";

interface UseRoomResult {
  room: GameRoom | null;
  error: string | null;
  actionLoading: boolean;
  createRoom: (gameId: string) => Promise<GameRoom | null>;
  joinRoom: (code: string) => Promise<GameRoom | null>;
  sendAction: RoomActionHandler;
  leaveRoom: () => Promise<boolean>;
  setActiveCode: (code: string | null) => void;
}

export function useRoom(): UseRoomResult {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeCode, setActiveCodeState] = useState<string | null>(null);
  const roomRef = useRef<GameRoom | null>(null);
  const activeCodeRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollGenerationRef = useRef(0);

  const replaceRoom = useCallback((nextRoom: GameRoom) => {
    activeCodeRef.current = nextRoom.code;
    roomRef.current = nextRoom;
    setActiveCodeState(nextRoom.code);
    setRoom(nextRoom);
    return nextRoom;
  }, []);

  const applyRoom = useCallback((nextRoom: GameRoom): GameRoom | null => {
    const current = roomRef.current;
    if (activeCodeRef.current !== nextRoom.code) return current;
    if (current?.code === nextRoom.code && nextRoom.version < current.version) {
      return current;
    }
    roomRef.current = nextRoom;
    setRoom(nextRoom);
    return nextRoom;
  }, []);

  const setActiveCode = useCallback((code: string | null) => {
    activeCodeRef.current = code;
    setActiveCodeState(code);
  }, []);

  // 폴링: activeCode가 있으면 2초마다 방 상태 갱신
  useEffect(() => {
    const generation = ++pollGenerationRef.current;
    if (!activeCode) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    let cancelled = false;

    const poll = async () => {
      if (visibleRefetchInterval(APP_ROOM_POLL_MS) === false) return;
      try {
        const res = await fetch(`/api/question-games/rooms/${activeCode}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && generation === pollGenerationRef.current && data.room) {
          applyRoom(data.room);
        }
      } catch {}
    };

    poll();
    pollRef.current = setInterval(poll, APP_ROOM_POLL_MS);
    const onVisibilityChange = () => {
      if (visibleRefetchInterval(APP_ROOM_POLL_MS) !== false) void poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [activeCode, applyRoom]);

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
      return replaceRoom(data.room);
    } catch {
      setError("네트워크 오류");
      return null;
    } finally {
      setActionLoading(false);
    }
  }, [replaceRoom]);

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
      return replaceRoom(data.room);
    } catch {
      setError("네트워크 오류");
      return null;
    } finally {
      setActionLoading(false);
    }
  }, [replaceRoom]);

  const sendAction = useCallback<RoomActionHandler>(
    async (action, extra = {}) => {
      const code = activeCodeRef.current;
      const currentRoom = roomRef.current;
      if (!code || !currentRoom) {
        return { ok: false, room: currentRoom, status: null, reason: "inactive" };
      }
      setActionLoading(true);
      setError(null);
      try {
        const body = action === "memory-roll"
          ? { action, ...extra }
          : { action, ...extra, expectedVersion: currentRoom.version };
        const res = await fetch(`/api/question-games/rooms/${code}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (res.status === 409) {
          const applied = data.room ? applyRoom(data.room) : roomRef.current;
          setError(data.error ?? "작업 실패");
          return { ok: false, room: applied, status: 409, reason: "conflict" };
        }
        if (res.status === 404) {
          return { ok: false, room: null, status: 404, reason: "missing" };
        }
        if (!res.ok || !data.room || data.room.code !== code) {
          setError(data.error ?? "작업 실패");
          return {
            ok: false,
            room: roomRef.current,
            status: res.status,
            reason: "rejected",
          };
        }
        return { ok: true, room: applyRoom(data.room) ?? data.room };
      } catch {
        setError("네트워크 오류");
        return {
          ok: false,
          room: roomRef.current,
          status: null,
          reason: "network",
        };
      } finally {
        setActionLoading(false);
      }
    },
    [applyRoom]
  );

  const leaveRoom = useCallback(async (): Promise<boolean> => {
    const code = activeCodeRef.current;
    if (!code) return true;
    try {
      const res = await fetch(`/api/question-games/rooms/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && data.room) applyRoom(data.room);
        setError(data.error ?? "나가기 실패");
        return false;
      }
      pollGenerationRef.current += 1;
      activeCodeRef.current = null;
      roomRef.current = null;
      setActiveCodeState(null);
      setRoom(null);
      setError(null);
      return true;
    } catch {
      setError("네트워크 오류");
      return false;
    }
  }, [applyRoom]);

  return { room, error, actionLoading, createRoom, joinRoom, sendAction, leaveRoom, setActiveCode };
}

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
  const roomGenerationRef = useRef(0);
  const connectIntentRef = useRef(0);
  const pendingActionCountRef = useRef(0);

  const isCurrentRequest = useCallback((code: string, generation: number) => {
    return activeCodeRef.current === code &&
      roomGenerationRef.current === generation;
  }, []);

  const beginAction = useCallback(() => {
    pendingActionCountRef.current += 1;
    if (pendingActionCountRef.current === 1) setActionLoading(true);
  }, []);

  const endAction = useCallback(() => {
    pendingActionCountRef.current = Math.max(
      0,
      pendingActionCountRef.current - 1,
    );
    if (pendingActionCountRef.current === 0) setActionLoading(false);
  }, []);

  const replaceRoom = useCallback((nextRoom: GameRoom) => {
    roomGenerationRef.current += 1;
    activeCodeRef.current = nextRoom.code;
    roomRef.current = nextRoom;
    setActiveCodeState(nextRoom.code);
    setRoom(nextRoom);
    return nextRoom;
  }, []);

  const applyRoom = useCallback((nextRoom: GameRoom) => {
    const current = roomRef.current;
    if (activeCodeRef.current !== nextRoom.code) {
      return { room: current, applied: false };
    }
    if (current?.code === nextRoom.code && nextRoom.version < current.version) {
      return { room: current, applied: false };
    }
    roomRef.current = nextRoom;
    setRoom(nextRoom);
    return { room: nextRoom, applied: true };
  }, []);

  const clearRoom = useCallback(() => {
    roomGenerationRef.current += 1;
    connectIntentRef.current += 1;
    activeCodeRef.current = null;
    roomRef.current = null;
    setActiveCodeState(null);
    setRoom(null);
  }, []);

  const setActiveCode = useCallback((code: string | null) => {
    if (activeCodeRef.current === code) return;
    if (code === null) {
      clearRoom();
      return;
    }
    roomGenerationRef.current += 1;
    connectIntentRef.current += 1;
    activeCodeRef.current = code;
    roomRef.current = null;
    setActiveCodeState(code);
    setRoom(null);
  }, [clearRoom]);

  // 폴링: activeCode가 있으면 2초마다 방 상태 갱신
  useEffect(() => {
    if (!activeCode) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const code = activeCode;
    const generation = roomGenerationRef.current;
    let cancelled = false;

    const poll = async () => {
      if (visibleRefetchInterval(APP_ROOM_POLL_MS) === false) return;
      try {
        const res = await fetch(`/api/question-games/rooms/${code}`);
        if (cancelled || !isCurrentRequest(code, generation)) return;
        const data = await res.json().catch(() => ({}));
        if (cancelled || !isCurrentRequest(code, generation)) return;
        if (res.status === 404) {
          setError(data.error ?? "방을 찾을 수 없어요");
          clearRoom();
          return;
        }
        if (!res.ok) return;
        if (data.room) applyRoom(data.room);
      } catch {
        if (cancelled || !isCurrentRequest(code, generation)) return;
      }
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
  }, [activeCode, applyRoom, clearRoom, isCurrentRequest]);

  const createRoom = useCallback(async (gameId: string): Promise<GameRoom | null> => {
    const intent = ++connectIntentRef.current;
    beginAction();
    setError(null);
    try {
      const res = await fetch("/api/question-games/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      const data = await res.json();
      if (intent !== connectIntentRef.current) return null;
      if (!res.ok) { setError(data.error ?? "방 생성 실패"); return null; }
      return replaceRoom(data.room);
    } catch {
      if (intent === connectIntentRef.current) setError("네트워크 오류");
      return null;
    } finally {
      endAction();
    }
  }, [beginAction, endAction, replaceRoom]);

  const joinRoom = useCallback(async (code: string): Promise<GameRoom | null> => {
    const intent = ++connectIntentRef.current;
    beginAction();
    setError(null);
    try {
      const res = await fetch(`/api/question-games/rooms/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join" }),
      });
      const data = await res.json();
      if (intent !== connectIntentRef.current) return null;
      if (!res.ok) { setError(data.error ?? "참가 실패"); return null; }
      return replaceRoom(data.room);
    } catch {
      if (intent === connectIntentRef.current) setError("네트워크 오류");
      return null;
    } finally {
      endAction();
    }
  }, [beginAction, endAction, replaceRoom]);

  const sendAction = useCallback<RoomActionHandler>(
    async (action, extra = {}) => {
      const code = activeCodeRef.current;
      const currentRoom = roomRef.current;
      if (!code || !currentRoom) {
        return { ok: false, room: currentRoom, status: null, reason: "inactive" };
      }
      const generation = roomGenerationRef.current;
      beginAction();
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
        if (!isCurrentRequest(code, generation)) {
          return {
            ok: false,
            room: roomRef.current,
            status: null,
            reason: "superseded",
          };
        }
        const data = await res.json();
        if (!isCurrentRequest(code, generation)) {
          return {
            ok: false,
            room: roomRef.current,
            status: null,
            reason: "superseded",
          };
        }
        if (res.status === 409) {
          const outcome = data.room
            ? applyRoom(data.room)
            : { room: roomRef.current, applied: true };
          if (outcome.applied) setError(data.error ?? "작업 실패");
          return { ok: false, room: outcome.room, status: 409, reason: "conflict" };
        }
        if (res.status === 404) {
          setError(data.error ?? "방을 찾을 수 없어요");
          clearRoom();
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
        return { ok: true, room: applyRoom(data.room).room ?? data.room };
      } catch {
        if (!isCurrentRequest(code, generation)) {
          return {
            ok: false,
            room: roomRef.current,
            status: null,
            reason: "superseded",
          };
        }
        setError("네트워크 오류");
        return {
          ok: false,
          room: roomRef.current,
          status: null,
          reason: "network",
        };
      } finally {
        endAction();
      }
    },
    [applyRoom, beginAction, clearRoom, endAction, isCurrentRequest]
  );

  const leaveRoom = useCallback(async (): Promise<boolean> => {
    const code = activeCodeRef.current;
    if (!code) return true;
    const generation = roomGenerationRef.current;
    beginAction();
    setError(null);
    try {
      const res = await fetch(`/api/question-games/rooms/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave" }),
      });
      if (!isCurrentRequest(code, generation)) return false;
      const data = await res.json().catch(() => ({}));
      if (!isCurrentRequest(code, generation)) return false;
      if (res.status === 404) {
        setError(data.error ?? "방을 찾을 수 없어요");
        clearRoom();
        return false;
      }
      if (!res.ok) {
        const outcome = res.status === 409 && data.room
          ? applyRoom(data.room)
          : null;
        if (!outcome || outcome.applied) {
          setError(data.error ?? "나가기 실패");
        }
        return false;
      }
      clearRoom();
      setError(null);
      return true;
    } catch {
      if (!isCurrentRequest(code, generation)) return false;
      setError("네트워크 오류");
      return false;
    } finally {
      endAction();
    }
  }, [applyRoom, beginAction, clearRoom, endAction, isCurrentRequest]);

  return { room, error, actionLoading, createRoom, joinRoom, sendAction, leaveRoom, setActiveCode };
}

import { useState, useEffect, useRef, useCallback } from "react";
import {
  isGameRoom,
  type GameRoom,
  type RoomActionHandler,
} from "@/lib/question-games-data";
import { APP_ROOM_POLL_MS, visibleRefetchInterval } from "@/lib/query-refresh";

const ROOM_REPLACED_MESSAGE =
  "방이 새로 만들어졌어요. 다시 참가해 주세요.";

function isResponseData(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readResponseData(response: Response) {
  const value: unknown = await response.json().catch(() => null);
  return isResponseData(value) ? value : {};
}

function responseError(
  data: Record<string, unknown>,
  fallback: string,
) {
  return typeof data.error === "string" ? data.error : fallback;
}

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
  const [roomGeneration, setRoomGeneration] = useState(0);
  const roomRef = useRef<GameRoom | null>(null);
  const activeCodeRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roomGenerationRef = useRef(0);
  const connectIntentRef = useRef(0);
  const pendingActionCountRef = useRef(0);

  const advanceRoomGeneration = useCallback(() => {
    roomGenerationRef.current += 1;
    setRoomGeneration(roomGenerationRef.current);
  }, []);

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

  const clearRoom = useCallback(() => {
    advanceRoomGeneration();
    connectIntentRef.current += 1;
    activeCodeRef.current = null;
    roomRef.current = null;
    setActiveCodeState(null);
    setRoom(null);
  }, [advanceRoomGeneration]);

  const replaceRoom = useCallback((nextRoom: GameRoom) => {
    advanceRoomGeneration();
    activeCodeRef.current = nextRoom.code;
    roomRef.current = nextRoom;
    setActiveCodeState(nextRoom.code);
    setRoom(nextRoom);
    return nextRoom;
  }, [advanceRoomGeneration]);

  const applyRoom = useCallback((nextRoom: GameRoom) => {
    const current = roomRef.current;
    if (activeCodeRef.current !== nextRoom.code) {
      return { room: current, applied: false, lifetimeChanged: false };
    }
    if (
      current?.code === nextRoom.code &&
      current.createdAt !== nextRoom.createdAt
    ) {
      clearRoom();
      return { room: null, applied: false, lifetimeChanged: true };
    }
    if (current?.code === nextRoom.code && nextRoom.version < current.version) {
      return { room: current, applied: false, lifetimeChanged: false };
    }
    roomRef.current = nextRoom;
    setRoom(nextRoom);
    return { room: nextRoom, applied: true, lifetimeChanged: false };
  }, [clearRoom]);

  const setActiveCode = useCallback((code: string | null) => {
    if (activeCodeRef.current === code) return;
    if (code === null) {
      clearRoom();
      return;
    }
    advanceRoomGeneration();
    connectIntentRef.current += 1;
    activeCodeRef.current = code;
    roomRef.current = null;
    setActiveCodeState(code);
    setRoom(null);
  }, [advanceRoomGeneration, clearRoom]);

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
        const data = await readResponseData(res);
        if (cancelled || !isCurrentRequest(code, generation)) return;
        if (res.status === 404) {
          setError(responseError(data, "방을 찾을 수 없어요"));
          clearRoom();
          return;
        }
        if (!res.ok) return;
        if (isGameRoom(data.room)) {
          const outcome = applyRoom(data.room);
          if (outcome.lifetimeChanged) setError(ROOM_REPLACED_MESSAGE);
        }
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
  }, [activeCode, applyRoom, clearRoom, isCurrentRequest, roomGeneration]);

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
      const data = await readResponseData(res);
      if (intent !== connectIntentRef.current) return null;
      if (!res.ok || !isGameRoom(data.room)) {
        setError(responseError(data, "방 생성 실패"));
        return null;
      }
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
      const data = await readResponseData(res);
      if (intent !== connectIntentRef.current) return null;
      if (!res.ok || !isGameRoom(data.room) || data.room.code !== code) {
        setError(responseError(data, "참가 실패"));
        return null;
      }
      return replaceRoom(data.room);
    } catch {
      if (intent === connectIntentRef.current) setError("네트워크 오류");
      return null;
    } finally {
      endAction();
    }
  }, [beginAction, endAction, replaceRoom]);

  const sendAction = useCallback<RoomActionHandler>(
    async (action, extra = {}, options) => {
      const code = activeCodeRef.current;
      const currentRoom = roomRef.current;
      const expectedRoom = options?.expectedRoom;
      if (
        expectedRoom &&
        (!currentRoom ||
          currentRoom.code !== expectedRoom.code ||
          currentRoom.createdAt !== expectedRoom.createdAt)
      ) {
        return {
          ok: false,
          room: currentRoom,
          status: null,
          reason: "superseded",
        };
      }
      if (!code || !currentRoom) {
        return { ok: false, room: currentRoom, status: null, reason: "inactive" };
      }
      const generation = roomGenerationRef.current;
      beginAction();
      setError(null);
      try {
        const body = action === "memory-roll"
          ? { action, ...extra, expectedCreatedAt: currentRoom.createdAt }
          : {
              action,
              ...extra,
              expectedVersion: currentRoom.version,
              expectedCreatedAt: currentRoom.createdAt,
            };
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
        const data = await readResponseData(res);
        if (!isCurrentRequest(code, generation)) {
          return {
            ok: false,
            room: roomRef.current,
            status: null,
            reason: "superseded",
          };
        }
        if (res.status === 409) {
          const responseRoom = data.room;
          let hasValidRoom = false;
          let outcome = {
            room: roomRef.current,
            applied: false,
            lifetimeChanged: false,
          };
          if (isGameRoom(responseRoom)) {
            hasValidRoom = true;
            outcome = applyRoom(responseRoom);
          }
          if (outcome.lifetimeChanged) {
            setError(ROOM_REPLACED_MESSAGE);
          } else if (outcome.applied || !hasValidRoom) {
            setError(responseError(data, "작업 실패"));
          }
          return { ok: false, room: outcome.room, status: 409, reason: "conflict" };
        }
        if (res.status === 404) {
          setError(responseError(data, "방을 찾을 수 없어요"));
          clearRoom();
          return { ok: false, room: null, status: 404, reason: "missing" };
        }
        if (!res.ok || !isGameRoom(data.room) || data.room.code !== code) {
          setError(responseError(data, "작업 실패"));
          return {
            ok: false,
            room: roomRef.current,
            status: res.status,
            reason: "rejected",
          };
        }
        const outcome = applyRoom(data.room);
        if (outcome.lifetimeChanged) {
          setError(ROOM_REPLACED_MESSAGE);
          return {
            ok: false,
            room: null,
            status: null,
            reason: "superseded",
          };
        }
        return { ok: true, room: outcome.room ?? data.room };
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
    const currentRoom = roomRef.current;
    const generation = roomGenerationRef.current;
    beginAction();
    setError(null);
    try {
      const res = await fetch(`/api/question-games/rooms/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "leave",
          expectedCreatedAt: currentRoom?.createdAt,
        }),
      });
      if (!isCurrentRequest(code, generation)) return false;
      const data = await readResponseData(res);
      if (!isCurrentRequest(code, generation)) return false;
      if (res.status === 404) {
        setError(responseError(data, "방을 찾을 수 없어요"));
        clearRoom();
        return false;
      }
      if (!res.ok) {
        const outcome =
          res.status === 409 &&
          isGameRoom(data.room) &&
          data.room.code === code
          ? applyRoom(data.room)
          : null;
        if (outcome?.lifetimeChanged) {
          setError(ROOM_REPLACED_MESSAGE);
        } else if (!outcome || outcome.applied) {
          setError(responseError(data, "나가기 실패"));
        }
        return false;
      }
      if (
        data.room !== null &&
        (!isGameRoom(data.room) || data.room.code !== code)
      ) {
        setError("나가기 실패");
        return false;
      }
      if (
        isGameRoom(data.room) &&
        currentRoom?.code === data.room.code &&
        currentRoom.createdAt !== data.room.createdAt
      ) {
        clearRoom();
        setError(ROOM_REPLACED_MESSAGE);
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

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import {
  isGameRoom,
  type GameRoom,
  type RoomActionHandler,
} from "@/lib/question-games-data";
import { readRoomCommandResult } from "@/lib/question-game-room-response";
import {
  roomPollDelay,
  visibleRefetchInterval,
} from "@/lib/query-refresh";

const ROOM_REPLACED_MESSAGE =
  "방이 새로 만들어졌어요. 다시 참가해 주세요.";
const ROOM_REMOVED_MESSAGE = "방장이 이 방에서 내보냈어요.";
const ROOM_MARKER_PREFIX = "question-game-room:";
const ROOM_PRESENCE_MS = 15_000;
const useClientLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

interface RoomMarker {
  code: string;
  gameId: string;
  createdAt: number;
}

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

function isSameRoomVersion(current: GameRoom | null, next: GameRoom) {
  return current?.code === next.code &&
    current.createdAt === next.createdAt &&
    current.version === next.version;
}

function roomMarkerKey(gameId: string) {
  return `${ROOM_MARKER_PREFIX}${gameId}`;
}

function isRoomMarker(value: unknown, gameId: string): value is RoomMarker {
  return isResponseData(value) &&
    typeof value.code === "string" &&
    /^\d{4}$/.test(value.code) &&
    value.gameId === gameId &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) &&
    value.createdAt >= 0;
}

function readRoomMarker(gameId: string): RoomMarker | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(roomMarkerKey(gameId));
    if (!stored) return null;
    const marker: unknown = JSON.parse(stored);
    if (isRoomMarker(marker, gameId)) return marker;
    window.sessionStorage.removeItem(roomMarkerKey(gameId));
  } catch {
    try {
      window.sessionStorage.removeItem(roomMarkerKey(gameId));
    } catch {
      // 저장소를 쓸 수 없는 환경에서는 현재 연결만 유지한다.
    }
  }
  return null;
}

export function hasStoredGameRoomMarker(gameId: string) {
  return readRoomMarker(gameId) !== null;
}

function writeRoomMarker(gameId: string, room: GameRoom) {
  if (typeof window === "undefined" || room.gameId !== gameId) return;
  try {
    window.sessionStorage.setItem(roomMarkerKey(gameId), JSON.stringify({
      code: room.code,
      gameId: room.gameId,
      createdAt: room.createdAt,
    } satisfies RoomMarker));
  } catch {
    // 세션 저장소가 막혀 있어도 현재 방 연결은 계속 사용할 수 있다.
  }
}

function removeRoomMarker(gameId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(roomMarkerKey(gameId));
  } catch {
    // 세션 저장소가 막힌 환경에서는 별도 정리를 할 수 없다.
  }
}

interface UseRoomResult {
  room: GameRoom | null;
  error: string | null;
  actionNotice: RoomActionNotice | null;
  actionLoading: boolean;
  isRestoring: boolean;
  connectionState: RoomConnectionState;
  createRoom: (gameId: string) => Promise<GameRoom | null>;
  joinRoom: (code: string) => Promise<GameRoom | null>;
  sendAction: RoomActionHandler;
  leaveRoom: () => Promise<boolean>;
  setActiveCode: (code: string | null) => void;
  refreshRoom: () => void;
  clearActionNotice: () => void;
  clearError: () => void;
}

export interface RoomActionNotice {
  kind: "replayed";
  id: number;
}

export type RoomConnectionState =
  | "connecting"
  | "connected"
  | "delayed"
  | "offline";

export function useRoom(gameId?: string): UseRoomResult {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<RoomActionNotice | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [connectionState, setConnectionState] =
    useState<RoomConnectionState>("connecting");
  const [activeCode, setActiveCodeState] = useState<string | null>(null);
  const [roomGeneration, setRoomGeneration] = useState(0);
  const roomRef = useRef<GameRoom | null>(null);
  const activeCodeRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomGenerationRef = useRef(0);
  const connectIntentRef = useRef(0);
  const pendingActionCountRef = useRef(0);
  const pollFailureCountRef = useRef(0);
  const refreshRoomRef = useRef<() => void>(() => {});
  const actionNoticeIdRef = useRef(0);

  const clearActionNotice = useCallback(() => {
    setActionNotice(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

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

  const clearRoomMarker = useCallback(() => {
    if (gameId) removeRoomMarker(gameId);
  }, [gameId]);

  const clearRoom = useCallback(() => {
    advanceRoomGeneration();
    connectIntentRef.current += 1;
    activeCodeRef.current = null;
    roomRef.current = null;
    setActiveCodeState(null);
    setRoom(null);
    setActionNotice(null);
    pollFailureCountRef.current = 0;
    setConnectionState("connecting");
    clearRoomMarker();
  }, [advanceRoomGeneration, clearRoomMarker]);

  const replaceRoom = useCallback((nextRoom: GameRoom) => {
    advanceRoomGeneration();
    activeCodeRef.current = nextRoom.code;
    roomRef.current = nextRoom;
    setActiveCodeState(nextRoom.code);
    setRoom(nextRoom);
    setActionNotice(null);
    pollFailureCountRef.current = 0;
    setConnectionState("connected");
    if (gameId) writeRoomMarker(gameId, nextRoom);
    return nextRoom;
  }, [advanceRoomGeneration, gameId]);

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
    if (
      current?.code === nextRoom.code &&
      current.createdAt === nextRoom.createdAt &&
      nextRoom.version <= current.version
    ) {
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
    pollFailureCountRef.current = 0;
    setConnectionState("connecting");
  }, [advanceRoomGeneration, clearRoom]);

  useClientLayoutEffect(() => {
    if (!gameId) {
      setIsRestoring(false);
      return;
    }

    const marker = readRoomMarker(gameId);
    if (!marker) {
      setIsRestoring(false);
      return;
    }
    setIsRestoring(true);
    setConnectionState("connecting");

    let cancelled = false;
    const restore = async () => {
      try {
        const res = await fetch(`/api/question-games/rooms/${marker.code}`);
        if (cancelled) return;
        const data = await readResponseData(res);
        if (cancelled) return;
        if (res.status === 403 || res.status === 404) {
          clearRoomMarker();
          setError(responseError(data, "방을 다시 연결할 수 없어요"));
          return;
        }
        if (!res.ok) {
          setError(responseError(data, "방을 다시 연결할 수 없어요"));
          setConnectionState(
            typeof navigator !== "undefined" && navigator.onLine === false
              ? "offline"
              : "delayed",
          );
          return;
        }
        if (
          !isGameRoom(data.room) ||
          data.room.code !== marker.code ||
          data.room.gameId !== marker.gameId ||
          data.room.createdAt !== marker.createdAt
        ) {
          clearRoomMarker();
          setError(
            isGameRoom(data.room) &&
              data.room.code === marker.code &&
              data.room.gameId === marker.gameId &&
              data.room.createdAt !== marker.createdAt
              ? ROOM_REPLACED_MESSAGE
              : "방을 다시 연결할 수 없어요",
          );
          return;
        }
        setError(null);
        replaceRoom(data.room);
      } catch {
        if (!cancelled) {
          setError("네트워크 오류");
          setConnectionState(
            typeof navigator !== "undefined" && navigator.onLine === false
              ? "offline"
              : "delayed",
          );
        }
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, [clearRoomMarker, gameId, replaceRoom]);

  // 방 상태 확인은 실패할수록 간격을 늘리고, 다시 연결되면 기본 간격으로 돌아간다.
  useEffect(() => {
    if (!activeCode) {
      if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
      refreshRoomRef.current = () => {};
      return;
    }
    const code = activeCode;
    const generation = roomGenerationRef.current;
    let cancelled = false;
    let inFlight = false;

    const recordFailure = () => {
      pollFailureCountRef.current += 1;
      const browserOffline =
        typeof navigator !== "undefined" && navigator.onLine === false;
      setConnectionState(
        browserOffline || pollFailureCountRef.current >= 3
          ? "offline"
          : "delayed",
      );
    };

    const schedule = () => {
      if (cancelled || !isCurrentRequest(code, generation)) return;
      if (pollRef.current) clearTimeout(pollRef.current);
      const delay = visibleRefetchInterval(
        roomPollDelay(pollFailureCountRef.current),
      );
      if (delay === false) {
        pollRef.current = null;
        return;
      }
      pollRef.current = setTimeout(() => { void poll(); }, delay);
    };

    const poll = async () => {
      if (
        cancelled ||
        inFlight ||
        !isCurrentRequest(code, generation) ||
        visibleRefetchInterval(roomPollDelay(0)) === false
      ) {
        return;
      }
      inFlight = true;
      try {
        // 이미 들고 있는 방의 version을 함께 보내 변화가 없으면 서버가 304로 응답한다
        const knownVersion =
          roomRef.current && roomRef.current.code === code
            ? roomRef.current.version
            : null;
        const res = await fetch(
          knownVersion === null
            ? `/api/question-games/rooms/${code}`
            : `/api/question-games/rooms/${code}?version=${knownVersion}`,
        );
        if (cancelled || !isCurrentRequest(code, generation)) return;
        if (res.status === 304) {
          // 방 상태 그대로 — 연결만 정상으로 표시하고 다음 폴링을 기다린다
          pollFailureCountRef.current = 0;
          setConnectionState("connected");
          return;
        }
        const data = await readResponseData(res);
        if (cancelled || !isCurrentRequest(code, generation)) return;
        if (res.status === 403 || res.status === 404) {
          setError(responseError(data, "방을 찾을 수 없어요"));
          clearRoom();
          return;
        }
        if (!res.ok || !isGameRoom(data.room)) {
          recordFailure();
          return;
        }
        if (
          data.room.code !== code ||
          (gameId !== undefined && data.room.gameId !== gameId)
        ) {
          setError(ROOM_REPLACED_MESSAGE);
          clearRoom();
          return;
        }
        pollFailureCountRef.current = 0;
        setConnectionState("connected");
        const outcome = applyRoom(data.room);
        if (outcome.lifetimeChanged) setError(ROOM_REPLACED_MESSAGE);
      } catch {
        if (cancelled || !isCurrentRequest(code, generation)) return;
        recordFailure();
      } finally {
        inFlight = false;
        schedule();
      }
    };

    refreshRoomRef.current = () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      pollRef.current = null;
      void poll();
    };
    void poll();
    const onVisibilityChange = () => {
      if (document.visibilityState !== "hidden") refreshRoomRef.current();
    };
    const onOnline = () => refreshRoomRef.current();
    const onOffline = () => setConnectionState("offline");
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
      refreshRoomRef.current = () => {};
    };
  }, [activeCode, applyRoom, clearRoom, gameId, isCurrentRequest, roomGeneration]);

  const refreshRoom = useCallback(() => {
    refreshRoomRef.current();
  }, []);

  const connectedRoomCode = room?.code ?? null;
  const connectedRoomGameId = room?.gameId ?? null;
  const connectedRoomCreatedAt = room?.createdAt ?? null;

  useEffect(() => {
    if (
      gameId === undefined ||
      connectedRoomCode === null ||
      connectedRoomGameId === null ||
      connectedRoomCreatedAt === null
    ) {
      return;
    }

    const code = connectedRoomCode;
    const expectedGameId = connectedRoomGameId;
    const expectedCreatedAt = connectedRoomCreatedAt;
    const generation = roomGenerationRef.current;
    let cancelled = false;

    const sendPresence = async () => {
      try {
        const res = await fetch(
          `/api/question-games/rooms/${code}/presence`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedCreatedAt }),
          },
        );
        if (cancelled || !isCurrentRequest(code, generation)) return;
        const data = await readResponseData(res);
        if (cancelled || !isCurrentRequest(code, generation)) return;
        const responseRoom = isGameRoom(data.room) ? data.room : null;
        if (
          responseRoom &&
          (
            responseRoom.code !== code ||
            responseRoom.gameId !== expectedGameId ||
            responseRoom.createdAt !== expectedCreatedAt
          )
        ) {
          clearRoom();
          return;
        }
        if (res.status === 403 || res.status === 404) {
          if (data.error === ROOM_REMOVED_MESSAGE) {
            setError(ROOM_REMOVED_MESSAGE);
          }
          clearRoom();
          return;
        }
        if (!res.ok || !responseRoom) return;
        pollFailureCountRef.current = 0;
        setConnectionState("connected");
        applyRoom(responseRoom);
      } catch {
        // 접속 확인 실패는 놀이 동작 오류와 현재 화면을 바꾸지 않는다.
      }
    };

    void sendPresence();
    const interval = setInterval(() => {
      void sendPresence();
    }, ROOM_PRESENCE_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState !== "hidden") void sendPresence();
    };
    const onOnline = () => {
      void sendPresence();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
    };
  }, [
    applyRoom,
    clearRoom,
    connectedRoomCode,
    connectedRoomCreatedAt,
    connectedRoomGameId,
    gameId,
    isCurrentRequest,
  ]);

  const createRoom = useCallback(async (requestedGameId: string): Promise<GameRoom | null> => {
    const intent = ++connectIntentRef.current;
    beginAction();
    setError(null);
    try {
      const res = await fetch("/api/question-games/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: requestedGameId }),
      });
      const data = await readResponseData(res);
      if (intent !== connectIntentRef.current) return null;
      if (res.status === 403 || res.status === 404) clearRoomMarker();
      if (
        !res.ok ||
        !isGameRoom(data.room) ||
        data.room.gameId !== requestedGameId ||
        (gameId !== undefined && data.room.gameId !== gameId)
      ) {
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
  }, [beginAction, clearRoomMarker, endAction, gameId, replaceRoom]);

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
      if (res.status === 403 || res.status === 404) clearRoomMarker();
      if (
        !res.ok ||
        !isGameRoom(data.room) ||
        data.room.code !== code ||
        (gameId !== undefined && data.room.gameId !== gameId)
      ) {
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
  }, [beginAction, clearRoomMarker, endAction, gameId, replaceRoom]);

  const sendAction = useCallback<RoomActionHandler>(
    async (action, extra = {}, options) => {
      const code = activeCodeRef.current;
      const currentRoom = roomRef.current;
      const expectedRoom = options?.expectedRoom;
      if (
        expectedRoom &&
        (!currentRoom ||
          currentRoom.code !== expectedRoom.code ||
          currentRoom.createdAt !== expectedRoom.createdAt ||
          (expectedRoom.playId !== undefined &&
            currentRoom.playId !== expectedRoom.playId))
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
      const commandId = options?.commandId ?? crypto.randomUUID();
      const generation = roomGenerationRef.current;
      beginAction();
      setError(null);
      setActionNotice(null);
      try {
        const isLegacyMemoryRoll =
          action === "memory-roll" && currentRoom.gameState.stateVersion !== 2;
        const body = isLegacyMemoryRoll
          ? {
              action,
              ...extra,
              commandId,
              expectedCreatedAt: currentRoom.createdAt,
            }
          : {
              action,
              ...extra,
              commandId,
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
        pollFailureCountRef.current = 0;
        setConnectionState("connected");
        if (res.status === 409) {
          const responseRoom = data.room;
          let hasApplicableRoom = false;
          let outcome = {
            room: roomRef.current,
            applied: false,
            lifetimeChanged: false,
          };
          let responseMatchesCurrent = false;
          if (isGameRoom(responseRoom) && responseRoom.code === code) {
            hasApplicableRoom = true;
            outcome = applyRoom(responseRoom);
            responseMatchesCurrent = isSameRoomVersion(
              outcome.room,
              responseRoom,
            );
          }
          if (outcome.lifetimeChanged) {
            setError(ROOM_REPLACED_MESSAGE);
          } else if (
            outcome.applied ||
            responseMatchesCurrent ||
            !hasApplicableRoom
          ) {
            setError(responseError(data, "작업 실패"));
          }
          return { ok: false, room: outcome.room, status: 409, reason: "conflict" };
        }
        if (res.status === 403 || res.status === 404) {
          setError(responseError(data, "방을 찾을 수 없어요"));
          clearRoom();
          return {
            ok: false,
            room: null,
            status: res.status,
            reason: res.status === 404 ? "missing" : "rejected",
          };
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
        const result = readRoomCommandResult(data.result);
        if (result?.replayed === true) {
          actionNoticeIdRef.current += 1;
          setActionNotice({
            kind: "replayed",
            id: actionNoticeIdRef.current,
          });
        }
        return {
          ok: true,
          room: outcome.room ?? data.room,
          ...(result ? { result } : {}),
        };
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
        setConnectionState(
          typeof navigator !== "undefined" && navigator.onLine === false
            ? "offline"
            : "delayed",
        );
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
      setConnectionState("connected");
      if (!isCurrentRequest(code, generation)) return false;
      if (res.status === 403 || res.status === 404) {
        setError(responseError(data, "방을 찾을 수 없어요"));
        clearRoom();
        return false;
      }
      if (!res.ok) {
        const responseRoom = data.room;
        const outcome =
          res.status === 409 &&
          isGameRoom(responseRoom) &&
          responseRoom.code === code
          ? applyRoom(responseRoom)
          : null;
        const responseMatchesCurrent = Boolean(
          outcome &&
          isGameRoom(responseRoom) &&
          isSameRoomVersion(outcome.room, responseRoom),
        );
        if (outcome?.lifetimeChanged) {
          setError(ROOM_REPLACED_MESSAGE);
        } else if (!outcome || outcome.applied || responseMatchesCurrent) {
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
  }, [
    applyRoom,
    beginAction,
    clearRoom,
    endAction,
    isCurrentRequest,
  ]);

  return {
    room,
    error,
    actionNotice,
    actionLoading,
    isRestoring,
    connectionState,
    createRoom,
    joinRoom,
    sendAction,
    leaveRoom,
    setActiveCode,
    refreshRoom,
    clearActionNotice,
    clearError,
  };
}

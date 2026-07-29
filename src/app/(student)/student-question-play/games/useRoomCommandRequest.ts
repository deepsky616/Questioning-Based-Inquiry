"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  GameRoom,
  RoomActionHandler,
  RoomActionResult,
} from "@/lib/question-games-data";

export interface RoomCommandRequestState {
  phase: string;
  roundId?: string;
  recentCommandIds: readonly string[];
}

export type RoomCommandRequestOutcome =
  | "confirmed"
  | "retryable"
  | "stale";

export type RoomCommandRequestJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly RoomCommandRequestJsonValue[]
  | { readonly [key: string]: RoomCommandRequestJsonValue };

interface TrackedRequest {
  action: string;
  commandId: string;
  executionKey: string;
  lifetimeKey: string;
  signature: string;
  confirmedByPolling: boolean;
}

export interface UseRoomCommandRequestOptions<
  State extends RoomCommandRequestState,
> {
  room: GameRoom;
  gameId: string;
  state: State | null;
  readState: (value: unknown) => State | null;
  onAction: RoomActionHandler;
  lifetimeParts?: readonly RoomCommandRequestJsonValue[];
  createCommandId?: () => string;
}

export interface RoomCommandRequestController {
  send: (
    action: string,
    body: Record<string, unknown>,
    dedupeValue: RoomCommandRequestJsonValue,
  ) => Promise<RoomCommandRequestOutcome>;
  pendingKind: string | null;
  acknowledgementVersion: number;
  requestError: string | null;
  clearRequestError: () => void;
}

const JSON_KEY_ERROR =
  "Room command keys must contain only lossless JSON values";

function serializeJsonValue(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(JSON_KEY_ERROR);
    return Object.is(value, -0) ? "-0" : String(value);
  }
  if (typeof value !== "object") throw new TypeError(JSON_KEY_ERROR);
  if (ancestors.has(value)) throw new TypeError(JSON_KEY_ERROR);

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (
        Object.getOwnPropertySymbols(value).length > 0 ||
        Object.getOwnPropertyNames(value).length !== value.length + 1
      ) {
        throw new TypeError(JSON_KEY_ERROR);
      }
      const items = Array.from({ length: value.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !("value" in descriptor)) {
          throw new TypeError(JSON_KEY_ERROR);
        }
        return serializeJsonValue(descriptor.value, ancestors);
      });
      return `[${items.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(JSON_KEY_ERROR);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError(JSON_KEY_ERROR);
    }

    const keys = Object.keys(value).sort();
    if (Object.getOwnPropertyNames(value).length !== keys.length) {
      throw new TypeError(JSON_KEY_ERROR);
    }
    return `{${keys.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) {
        throw new TypeError(JSON_KEY_ERROR);
      }
      return `${JSON.stringify(key)}:${serializeJsonValue(descriptor.value, ancestors)}`;
    }).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

function serializeKey(value: RoomCommandRequestJsonValue): string {
  return serializeJsonValue(value, new Set());
}

function executionKey(
  room: Pick<GameRoom, "code" | "createdAt" | "playId">,
  gameId: string,
): string {
  return serializeKey([
    room.code,
    room.createdAt,
    gameId,
    room.playId ?? "",
  ]);
}

function responseMatchesExecution(
  result: RoomActionResult | null,
  request: TrackedRequest,
  gameId: string,
): boolean {
  return result?.room?.gameId === gameId &&
    executionKey(result.room, gameId) === request.executionKey;
}

function defaultCommandId(): string {
  return crypto.randomUUID();
}

export function useRoomCommandRequest<
  State extends RoomCommandRequestState,
>({
  room,
  gameId,
  state,
  readState,
  onAction,
  lifetimeParts = [],
  createCommandId = defaultCommandId,
}: UseRoomCommandRequestOptions<State>): RoomCommandRequestController {
  const currentExecutionKey = executionKey(room, gameId);
  const currentLifetimeKey = serializeKey([
    currentExecutionKey,
    state?.phase ?? "invalid",
    state?.roundId ?? "",
    room.players.map(({ id, name }) => [id, name]),
    lifetimeParts,
  ]);
  const executionRef = useRef(currentExecutionKey);
  const lifetimeRef = useRef(currentLifetimeKey);
  const mountedRef = useRef(true);
  const pendingRef = useRef<TrackedRequest | null>(null);
  const retriesRef = useRef(new Map<string, TrackedRequest>());
  const [pendingKind, setPendingKind] = useState<string | null>(null);
  const [acknowledgementVersion, setAcknowledgementVersion] = useState(0);
  const [requestError, setRequestError] = useState<string | null>(null);
  const clearRequestError = useCallback(() => setRequestError(null), []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    executionRef.current = currentExecutionKey;
    if (lifetimeRef.current === currentLifetimeKey) return;

    lifetimeRef.current = currentLifetimeKey;
    pendingRef.current = null;
    retriesRef.current.clear();
    setPendingKind(null);
    setRequestError(null);
  }, [currentExecutionKey, currentLifetimeKey]);

  useEffect(() => {
    if (!state) return;
    for (const request of retriesRef.current.values()) {
      if (
        request.lifetimeKey !== currentLifetimeKey ||
        !state.recentCommandIds.includes(request.commandId)
      ) {
        continue;
      }

      request.confirmedByPolling = true;
      if (retriesRef.current.get(request.signature) === request) {
        retriesRef.current.delete(request.signature);
      }
      if (pendingRef.current === request) {
        pendingRef.current = null;
        setPendingKind(null);
      }
      setAcknowledgementVersion((version) => version + 1);
    }
  }, [currentLifetimeKey, state]);

  const send = useCallback(async (
    action: string,
    body: Record<string, unknown>,
    dedupeValue: RoomCommandRequestJsonValue,
  ): Promise<RoomCommandRequestOutcome> => {
    if (
      !mountedRef.current ||
      executionRef.current !== currentExecutionKey ||
      lifetimeRef.current !== currentLifetimeKey
    ) {
      return "stale";
    }
    if (pendingRef.current?.lifetimeKey === currentLifetimeKey) {
      return "retryable";
    }

    const signature = serializeKey([
      currentLifetimeKey,
      action,
      dedupeValue,
    ]);
    const previous = retriesRef.current.get(signature);
    const request =
      previous?.lifetimeKey === currentLifetimeKey &&
        previous.signature === signature
        ? previous
        : {
            action,
            commandId: createCommandId(),
            executionKey: currentExecutionKey,
            lifetimeKey: currentLifetimeKey,
            signature,
            confirmedByPolling: false,
          };

    retriesRef.current.set(signature, request);
    pendingRef.current = request;
    if (mountedRef.current) {
      setPendingKind(action);
      setRequestError(null);
    }

    let result: RoomActionResult | null = null;
    try {
      result = await onAction(action, body, {
        commandId: request.commandId,
        expectedRoom: { code: room.code, createdAt: room.createdAt },
      });
    } catch {
      result = null;
    }

    if (
      !mountedRef.current ||
      lifetimeRef.current !== request.lifetimeKey ||
      executionRef.current !== request.executionKey
    ) {
      return "stale";
    }

    const matchesExecution = responseMatchesExecution(
      result,
      request,
      gameId,
    );
    const responseState = matchesExecution && result?.room
      ? readState(result.room.gameState)
      : null;
    const responseConfirmsCommand =
      responseState?.recentCommandIds.includes(request.commandId) === true;
    const confirmed = request.confirmedByPolling || (
      matchesExecution && (result?.ok === true || responseConfirmsCommand)
    );
    const mismatchedResponse = result?.room !== null &&
      result?.room !== undefined &&
      !matchesExecution;

    if (confirmed || mismatchedResponse) {
      if (retriesRef.current.get(request.signature) === request) {
        retriesRef.current.delete(request.signature);
      }
    }
    if (pendingRef.current === request) {
      pendingRef.current = null;
      setPendingKind(null);
    }

    if (confirmed) return "confirmed";
    setRequestError(result?.ok === false ? result.error ?? null : null);
    return mismatchedResponse ? "stale" : "retryable";
  }, [
    createCommandId,
    currentExecutionKey,
    currentLifetimeKey,
    gameId,
    onAction,
    readState,
    room.code,
    room.createdAt,
  ]);

  return {
    send,
    pendingKind,
    acknowledgementVersion,
    requestError,
    clearRequestError,
  };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface GameRunSnapshot {
  id: string;
  gameId?: string;
  mode?: string;
  status?: string;
  version: number;
  targetCount: number;
  questionCount: number;
  aiTurnCount: number;
  awaitingAiTurn: boolean;
  preview: boolean;
}

export interface GameRunResult {
  awarded: number;
  dailyLimit: number;
  dailyRemaining: number;
  cappedByLimit: boolean;
  preview: boolean;
  alreadySettled?: boolean;
}

export interface SubmittedRelayQuestion {
  run: GameRunSnapshot;
  result: GameRunResult | null;
}

type PendingKind = "create" | "action" | "ai" | "complete" | null;

interface RetriableRequest {
  key: string;
  requestId: string;
}

interface RetriableActionRequest extends RetriableRequest {
  question: string;
}

interface IssuedRelayAiTurn {
  output: string;
  proof: string;
  runVersion: number;
  expiresAt: string;
}

interface RetriableAiRecordRequest extends RetriableRequest {
  generationRequestId: string;
  issued: IssuedRelayAiTurn;
}

export interface RecordedRelayAiTurn {
  run: GameRunSnapshot;
  output: string;
}

const RUN_CONFLICT_MESSAGE =
  "질문놀이 상태가 다른 화면에서 변경되었습니다. 새 실행으로 다시 시작해 주세요.";

class QuestionGameRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly aiProofRejected: boolean,
  ) {
    super(message);
    this.name = "QuestionGameRequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRun(value: unknown): GameRunSnapshot | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.version !== "number" ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1 ||
    typeof value.targetCount !== "number" ||
    !Number.isSafeInteger(value.targetCount) ||
    value.targetCount < 1 ||
    typeof value.questionCount !== "number" ||
    !Number.isSafeInteger(value.questionCount) ||
    value.questionCount < 0 ||
    value.questionCount > value.targetCount ||
    typeof value.aiTurnCount !== "number" ||
    !Number.isSafeInteger(value.aiTurnCount) ||
    value.aiTurnCount < 0 ||
    value.aiTurnCount >= value.targetCount ||
    typeof value.awaitingAiTurn !== "boolean" ||
    typeof value.preview !== "boolean"
  ) return null;
  return {
    id: value.id,
    ...(typeof value.gameId === "string" ? { gameId: value.gameId } : {}),
    ...(typeof value.mode === "string" ? { mode: value.mode } : {}),
    ...(typeof value.status === "string" ? { status: value.status } : {}),
    version: value.version,
    targetCount: value.targetCount,
    questionCount: value.questionCount,
    aiTurnCount: value.aiTurnCount,
    awaitingAiTurn: value.awaitingAiTurn,
    preview: value.preview,
  };
}

function readIssuedRelayAiTurn(value: unknown): IssuedRelayAiTurn | null {
  if (!isRecord(value)) return null;
  const expiresAtMs = typeof value.expiresAt === "string"
    ? Date.parse(value.expiresAt)
    : Number.NaN;
  if (
    typeof value.output !== "string" ||
    !value.output.trim() ||
    typeof value.proof !== "string" ||
    !value.proof ||
    typeof value.runVersion !== "number" ||
    !Number.isSafeInteger(value.runVersion) ||
    value.runVersion < 1 ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(expiresAtMs) ||
    new Date(expiresAtMs).toISOString() !== value.expiresAt
  ) return null;
  return {
    output: value.output.trim(),
    proof: value.proof,
    runVersion: value.runVersion,
    expiresAt: value.expiresAt,
  };
}

function readResult(value: unknown): GameRunResult | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.awarded !== "number" ||
    !Number.isSafeInteger(value.awarded) ||
    value.awarded < 0 ||
    typeof value.dailyLimit !== "number" ||
    !Number.isSafeInteger(value.dailyLimit) ||
    value.dailyLimit < 0 ||
    typeof value.dailyRemaining !== "number" ||
    !Number.isSafeInteger(value.dailyRemaining) ||
    value.dailyRemaining < 0 ||
    value.awarded > value.dailyLimit ||
    value.dailyRemaining > value.dailyLimit ||
    value.awarded + value.dailyRemaining > value.dailyLimit ||
    typeof value.cappedByLimit !== "boolean" ||
    typeof value.preview !== "boolean" ||
    (value.alreadySettled !== undefined && typeof value.alreadySettled !== "boolean")
  ) return null;
  return {
    awarded: value.awarded,
    dailyLimit: value.dailyLimit,
    dailyRemaining: value.dailyRemaining,
    cappedByLimit: value.cappedByLimit,
    preview: value.preview,
    ...(typeof value.alreadySettled === "boolean"
      ? { alreadySettled: value.alreadySettled }
      : {}),
  };
}

function readSettlementResult(
  value: unknown,
  run: GameRunSnapshot,
): GameRunResult | null {
  if (run.status === "SETTLED") {
    const result = readResult(value);
    if (!result) throw new Error("포인트 지급 결과를 확인할 수 없습니다.");
    return result;
  }
  if (value !== undefined && value !== null) {
    throw new Error("진행 중인 질문놀이의 지급 상태를 확인할 수 없습니다.");
  }
  return null;
}

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(16).slice(2).padEnd(12, "0").slice(0, 12);
  return `00000000-0000-4000-8000-${random}`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(value) && typeof value.error === "string"
      ? value.error
      : "질문놀이 요청을 처리하지 못했습니다.";
    throw new QuestionGameRequestError(
      message,
      response.status,
      isRecord(value) && value.aiProofRejected === true,
    );
  }
  if (!isRecord(value)) throw new Error("질문놀이 응답을 확인할 수 없습니다.");
  return value;
}

async function readRunResult(runId: string) {
  const value = await readJson(await fetch(
    `/api/question-games/runs/${runId}/result`,
    { method: "GET" },
  ));
  const run = readRun(value.run);
  if (!run) throw new Error("질문놀이 실행 상태를 확인할 수 없습니다.");
  const result = readSettlementResult(value.result, run);
  return { run, result };
}

function requestErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isRejectedAiProof(error: unknown) {
  return error instanceof QuestionGameRequestError &&
    error.status === 409 &&
    error.aiProofRejected;
}

function isSameRunProgress(first: GameRunSnapshot, second: GameRunSnapshot) {
  return (
    first.id === second.id &&
    first.version === second.version &&
    first.targetCount === second.targetCount &&
    first.questionCount === second.questionCount &&
    first.aiTurnCount === second.aiTurnCount &&
    first.awaitingAiTurn === second.awaitingAiTurn &&
    first.status === second.status
  );
}

function isExpectedQuestionAdvance(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
) {
  return (
    next.id === current.id &&
    next.version === current.version + 1 &&
    next.questionCount === current.questionCount + 1 &&
    next.aiTurnCount === current.aiTurnCount
  );
}

function isExpectedAiAdvance(
  current: GameRunSnapshot,
  next: GameRunSnapshot,
) {
  return (
    next.id === current.id &&
    next.version === current.version + 1 &&
    next.questionCount === current.questionCount &&
    next.aiTurnCount === current.aiTurnCount + 1 &&
    !next.awaitingAiTurn
  );
}

export function useGameRun() {
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const inFlightRef = useRef(false);
  const createRequestRef = useRef<RetriableRequest | null>(null);
  const actionRequestRef = useRef<RetriableActionRequest | null>(null);
  const aiIssueRequestRef = useRef<RetriableRequest | null>(null);
  const aiRecordRequestRef = useRef<RetriableAiRecordRequest | null>(null);
  const completeRequestRef = useRef<RetriableRequest | null>(null);
  const [run, setRun] = useState<GameRunSnapshot | null>(null);
  const [result, setResult] = useState<GameRunResult | null>(null);
  const [pending, setPending] = useState<PendingKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [unconfirmedQuestion, setUnconfirmedQuestion] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  const begin = useCallback((kind: Exclude<PendingKind, null>) => {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    setPending(kind);
    setError(null);
    return true;
  }, []);

  const finish = useCallback((generation: number) => {
    if (generationRef.current === generation) {
      inFlightRef.current = false;
    }
    if (mountedRef.current && generationRef.current === generation) {
      setPending(null);
    }
  }, []);

  const markConflict = useCallback((latestRun?: GameRunSnapshot) => {
    actionRequestRef.current = null;
    aiIssueRequestRef.current = null;
    aiRecordRequestRef.current = null;
    completeRequestRef.current = null;
    if (latestRun) {
      setRun((current) => {
        if (!current || current.id !== latestRun.id) return current;
        return latestRun.version >= current.version ? latestRun : current;
      });
    }
    setUnconfirmedQuestion(null);
    setError(null);
    setConflict(RUN_CONFLICT_MESSAGE);
  }, []);

  const start = useCallback(async (
    gameId: string,
    mode: "solo" | "ai",
    topic: string,
    locale: string,
  ) => {
    if (!begin("create")) return null;
    const generation = generationRef.current;
    const normalizedLocale = locale === "en" ? "en" : "ko";
    const normalizedTopic = topic.trim();
    const key = `${gameId}:${mode}:${normalizedLocale}:${normalizedTopic}`;
    const request = createRequestRef.current?.key === key
      ? createRequestRef.current
      : { key, requestId: newRequestId() };
    createRequestRef.current = request;
    try {
      const response = await fetch("/api/question-games/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          mode,
          requestId: request.requestId,
          topic: normalizedTopic,
          locale: normalizedLocale,
        }),
      });
      const value = await readJson(response);
      const nextRun = readRun(value.run);
      if (!nextRun) throw new Error("질문놀이 실행 정보를 확인할 수 없습니다.");
      if (nextRun.status !== "ACTIVE") {
        createRequestRef.current = null;
        throw new Error("이미 닫힌 질문놀이 실행입니다. 다시 시작해 주세요.");
      }
      if (!mountedRef.current || generationRef.current !== generation) return null;
      createRequestRef.current = null;
      actionRequestRef.current = null;
      aiIssueRequestRef.current = null;
      aiRecordRequestRef.current = null;
      completeRequestRef.current = null;
      setRun(nextRun);
      setResult(null);
      setConflict(null);
      setUnconfirmedQuestion(null);
      return nextRun;
    } catch (requestError) {
      if (mountedRef.current && generationRef.current === generation) {
        setError(requestError instanceof Error
          ? requestError.message
          : "질문놀이 실행을 시작하지 못했습니다.");
      }
      return null;
    } finally {
      finish(generation);
    }
  }, [begin, finish]);

  const submitRelayQuestion = useCallback(async (
    question: string,
    locale: string,
  ): Promise<SubmittedRelayQuestion | null> => {
    if (!run || conflict || !begin("action")) return null;
    const generation = generationRef.current;
    const normalizedLocale = locale === "en" ? "en" : "ko";
    const key = `${run.id}:${run.version}:${normalizedLocale}:${question}`;
    const request = actionRequestRef.current?.key === key
      ? actionRequestRef.current
      : { key, requestId: newRequestId(), question };
    actionRequestRef.current = request;
    try {
      const response = await fetch(`/api/question-games/runs/${run.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "relay-submit-question",
          requestId: request.requestId,
          expectedVersion: run.version,
          question,
          locale: normalizedLocale,
        }),
      });
      const value = await readJson(response);
      let nextRun = readRun(value.run);
      if (!nextRun || !isExpectedQuestionAdvance(run, nextRun)) {
        throw new Error("질문 저장 결과를 확인할 수 없습니다.");
      }
      let nextResult = readSettlementResult(value.result, nextRun);
      if (value.replayed === true) {
        const current = await readRunResult(run.id);
        if (!isSameRunProgress(current.run, nextRun)) {
          if (mountedRef.current && generationRef.current === generation) {
            markConflict(current.run);
          }
          return null;
        }
        nextRun = current.run;
        nextResult = current.result;
      }
      if (!mountedRef.current || generationRef.current !== generation) return null;
      actionRequestRef.current = null;
      setRun(nextRun);
      if (nextResult) setResult(nextResult);
      setUnconfirmedQuestion(null);
      return { run: nextRun, result: nextResult };
    } catch (requestError) {
      const message = requestErrorMessage(requestError, "질문을 저장하지 못했습니다.");
      const actionWasExplicitlyRejected = requestError instanceof QuestionGameRequestError;
      try {
        const recovered = await readRunResult(run.id);
        const actionWasApplied =
          isExpectedQuestionAdvance(run, recovered.run);
        if (actionWasApplied) {
          if (!mountedRef.current || generationRef.current !== generation) return null;
          actionRequestRef.current = null;
          setRun(recovered.run);
          if (recovered.result) setResult(recovered.result);
          setUnconfirmedQuestion(null);
          setError(null);
          return recovered;
        }
        const stateIsUnchanged = isSameRunProgress(recovered.run, run);
        if (mountedRef.current && generationRef.current === generation) {
          if (stateIsUnchanged) {
            if (actionWasExplicitlyRejected) {
              actionRequestRef.current = null;
              setUnconfirmedQuestion(null);
            } else {
              setUnconfirmedQuestion(request.question);
            }
            setError(message);
          } else {
            markConflict(recovered.run);
          }
        }
      } catch {
        if (mountedRef.current && generationRef.current === generation) {
          if (actionWasExplicitlyRejected) {
            actionRequestRef.current = null;
            setUnconfirmedQuestion(null);
          } else {
            setUnconfirmedQuestion(request.question);
          }
          setError(message);
        }
      }
      return null;
    } finally {
      finish(generation);
    }
  }, [begin, conflict, finish, markConflict, run]);

  const submitRelayAiTurn = useCallback(async (
    topic: string,
    previousQuestion: string,
    locale: string,
    runOverride?: GameRunSnapshot,
  ): Promise<RecordedRelayAiTurn | null> => {
    const activeRun = runOverride ?? run;
    if (!activeRun?.awaitingAiTurn || conflict || !begin("ai")) return null;
    const generation = generationRef.current;
    const normalizedLocale = locale === "en" ? "en" : "ko";
    const normalizedTopic = topic.trim();
    const normalizedQuestion = previousQuestion.trim();
    const key = [
      activeRun.id,
      activeRun.version,
      normalizedLocale,
      normalizedTopic,
      normalizedQuestion,
    ].join(":");
    const issueRequest = aiIssueRequestRef.current?.key === key
      ? aiIssueRequestRef.current
      : { key, requestId: newRequestId() };
    aiIssueRequestRef.current = issueRequest;

    let recordRequest = aiRecordRequestRef.current?.key === key
      ? aiRecordRequestRef.current
      : null;

    try {
      if (!recordRequest) {
        let issued: IssuedRelayAiTurn;
        try {
          const value = await readJson(await fetch(
            `/api/question-games/runs/${activeRun.id}/ai-turn`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                requestId: issueRequest.requestId,
                expectedVersion: activeRun.version,
                topic: normalizedTopic,
                previousQuestion: normalizedQuestion,
                locale: normalizedLocale,
              }),
            },
          ));
          const parsed = readIssuedRelayAiTurn(value);
          if (!parsed || parsed.runVersion !== activeRun.version) {
            throw new Error("인공지능 질문 발급 결과를 확인할 수 없습니다.");
          }
          issued = parsed;
        } catch (requestError) {
          if (mountedRef.current && generationRef.current === generation) {
            setError(requestErrorMessage(
              requestError,
              "인공지능 질문을 만들지 못했습니다.",
            ));
          }
          return null;
        }

        if (!mountedRef.current || generationRef.current !== generation) return null;
        recordRequest = {
          key,
          requestId: newRequestId(),
          generationRequestId: issueRequest.requestId,
          issued,
        };
        aiRecordRequestRef.current = recordRequest;
      }

      try {
        const value = await readJson(await fetch(
          `/api/question-games/runs/${activeRun.id}/actions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "relay-record-ai-turn",
              requestId: recordRequest.requestId,
              generationRequestId: recordRequest.generationRequestId,
              expectedVersion: activeRun.version,
              output: recordRequest.issued.output,
              proof: recordRequest.issued.proof,
            }),
          },
        ));
        let nextRun = readRun(value.run);
        if (!nextRun || !isExpectedAiAdvance(activeRun, nextRun)) {
          throw new Error("인공지능 질문 기록 결과를 확인할 수 없습니다.");
        }
        if (value.replayed === true) {
          const current = await readRunResult(activeRun.id);
          if (!isSameRunProgress(current.run, nextRun)) {
            if (mountedRef.current && generationRef.current === generation) {
              markConflict(current.run);
            }
            return null;
          }
          nextRun = current.run;
        }
        if (!mountedRef.current || generationRef.current !== generation) return null;
        aiIssueRequestRef.current = null;
        aiRecordRequestRef.current = null;
        setRun(nextRun);
        setError(null);
        return { run: nextRun, output: recordRequest.issued.output };
      } catch (requestError) {
        const proofWasRejected = isRejectedAiProof(requestError);
        if (proofWasRejected) {
          aiRecordRequestRef.current = null;
        }
        const message = requestErrorMessage(
          requestError,
          "인공지능 질문을 기록하지 못했습니다.",
        );
        try {
          const recovered = await readRunResult(activeRun.id);
          const actionWasApplied = isExpectedAiAdvance(activeRun, recovered.run);
          if (actionWasApplied) {
            if (!mountedRef.current || generationRef.current !== generation) return null;
            aiIssueRequestRef.current = null;
            aiRecordRequestRef.current = null;
            setRun(recovered.run);
            setError(null);
            return { run: recovered.run, output: recordRequest.issued.output };
          }
          if (!isSameRunProgress(recovered.run, activeRun)) {
            if (mountedRef.current && generationRef.current === generation) {
              markConflict(recovered.run);
            }
            return null;
          }
        } catch {
          // 일반 기록 실패는 같은 요청을 보관하고, 증명 거절은 위에서 폐기한다.
        }
        if (mountedRef.current && generationRef.current === generation) {
          setError(message);
        }
        return null;
      }
    } finally {
      finish(generation);
    }
  }, [begin, conflict, finish, markConflict, run]);

  const complete = useCallback(async (runOverride?: GameRunSnapshot) => {
    const activeRun = runOverride ?? run;
    if (!activeRun || conflict || !begin("complete")) return null;
    const generation = generationRef.current;
    const key = `${activeRun.id}:${activeRun.version}`;
    const request = completeRequestRef.current?.key === key
      ? completeRequestRef.current
      : { key, requestId: newRequestId() };
    completeRequestRef.current = request;
    try {
      const response = await fetch(`/api/question-games/runs/${activeRun.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: request.requestId,
          expectedVersion: activeRun.version,
        }),
      });
      const value = await readJson(response);
      const nextRun = readRun(value.run);
      const nextResult = readResult(value.result);
      if (!nextRun || !nextResult) {
        throw new Error("포인트 지급 결과를 확인할 수 없습니다.");
      }
      if (!mountedRef.current || generationRef.current !== generation) return null;
      completeRequestRef.current = null;
      setRun(nextRun);
      setResult(nextResult);
      return nextResult;
    } catch (requestError) {
      const message = requestErrorMessage(requestError, "포인트 지급을 완료하지 못했습니다.");
      try {
        const recovered = await readRunResult(activeRun.id);
        if (
          recovered.run.id === activeRun.id &&
          recovered.run.status === "SETTLED" &&
          recovered.result
        ) {
          if (!mountedRef.current || generationRef.current !== generation) return null;
          completeRequestRef.current = null;
          setRun(recovered.run);
          setResult(recovered.result);
          setError(null);
          return recovered.result;
        }
        if (!isSameRunProgress(recovered.run, activeRun)) {
          if (mountedRef.current && generationRef.current === generation) {
            markConflict(recovered.run);
          }
          return null;
        }
      } catch {
        // 같은 완료 요청을 다시 보낼 수 있도록 요청 식별값을 유지한다.
      }
      if (mountedRef.current && generationRef.current === generation) {
        setError(message);
      }
      return null;
    } finally {
      finish(generation);
    }
  }, [begin, conflict, finish, markConflict, run]);

  const reset = useCallback(() => {
    generationRef.current += 1;
    inFlightRef.current = false;
    createRequestRef.current = null;
    actionRequestRef.current = null;
    aiIssueRequestRef.current = null;
    aiRecordRequestRef.current = null;
    completeRequestRef.current = null;
    setRun(null);
    setResult(null);
    setPending(null);
    setError(null);
    setConflict(null);
    setUnconfirmedQuestion(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    run,
    result,
    pending,
    error,
    conflict,
    unconfirmedQuestion,
    start,
    submitRelayQuestion,
    submitRelayAiTurn,
    complete,
    reset,
    clearError,
  };
}

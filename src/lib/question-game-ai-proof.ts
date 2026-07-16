import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const PROOF_VERSION = 1;
const PROOF_LIFETIME_MS = 90 * 1_000;
const MAX_PROOF_CLOCK_SKEW_MS = 30 * 1_000;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface QuestionGameAiProofPayload {
  version: 1;
  proofId: string;
  runId: string;
  ownerId: string;
  runVersion: number;
  leaseId: string;
  generationRequestId: string;
  topicHash: string;
  previousQuestionHash: string;
  outputHash: string;
  issuedAt: number;
  expiresAt: number;
}

export class QuestionGameAiProofError extends Error {
  constructor() {
    super("Invalid question game AI proof");
    this.name = "QuestionGameAiProofError";
  }
}

function signature(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function isProofPayload(value: unknown): value is QuestionGameAiProofPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    payload.version === PROOF_VERSION &&
    typeof payload.proofId === "string" &&
    UUID_PATTERN.test(payload.proofId) &&
    typeof payload.runId === "string" &&
    payload.runId.length > 0 &&
    payload.runId.length <= 200 &&
    typeof payload.ownerId === "string" &&
    payload.ownerId.length > 0 &&
    payload.ownerId.length <= 200 &&
    typeof payload.runVersion === "number" &&
    Number.isSafeInteger(payload.runVersion) &&
    payload.runVersion >= 1 &&
    typeof payload.leaseId === "string" &&
    UUID_PATTERN.test(payload.leaseId) &&
    typeof payload.generationRequestId === "string" &&
    UUID_PATTERN.test(payload.generationRequestId) &&
    typeof payload.topicHash === "string" &&
    HASH_PATTERN.test(payload.topicHash) &&
    typeof payload.previousQuestionHash === "string" &&
    HASH_PATTERN.test(payload.previousQuestionHash) &&
    typeof payload.outputHash === "string" &&
    HASH_PATTERN.test(payload.outputHash) &&
    typeof payload.issuedAt === "number" &&
    Number.isSafeInteger(payload.issuedAt) &&
    typeof payload.expiresAt === "number" &&
    Number.isSafeInteger(payload.expiresAt) &&
    payload.expiresAt > payload.issuedAt &&
    payload.expiresAt - payload.issuedAt === PROOF_LIFETIME_MS
  );
}

export function issueQuestionGameAiProof(
  input: Omit<
    QuestionGameAiProofPayload,
    "version" | "proofId" | "issuedAt" | "expiresAt"
  >,
  secret: string,
  now = new Date(),
) {
  const issuedAt = now.getTime();
  const payload: QuestionGameAiProofPayload = {
    version: PROOF_VERSION,
    proofId: randomUUID(),
    ...input,
    issuedAt,
    expiresAt: issuedAt + PROOF_LIFETIME_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return {
    proof: `${body}.${signature(body, secret)}`,
    proofId: payload.proofId,
    expiresAt: new Date(payload.expiresAt),
  };
}

export function verifyQuestionGameAiProof(
  proof: string,
  secret: string,
  now = new Date(),
): QuestionGameAiProofPayload {
  if (!proof || proof.length > 4_096) throw new QuestionGameAiProofError();
  const parts = proof.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new QuestionGameAiProofError();
  const [body, suppliedSignature] = parts;
  const expectedSignature = signature(body, secret);
  const expectedBytes = Buffer.from(expectedSignature, "utf8");
  const suppliedBytes = Buffer.from(suppliedSignature, "utf8");
  if (
    expectedBytes.length !== suppliedBytes.length ||
    !timingSafeEqual(expectedBytes, suppliedBytes)
  ) {
    throw new QuestionGameAiProofError();
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new QuestionGameAiProofError();
  }
  if (
    !isProofPayload(decoded) ||
    decoded.expiresAt <= now.getTime() ||
    decoded.issuedAt > now.getTime() + MAX_PROOF_CLOCK_SKEW_MS
  ) {
    throw new QuestionGameAiProofError();
  }
  return decoded;
}

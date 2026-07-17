import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

const PROOF_VERSION = 1;
const PROOF_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const MAX_CLOCK_SKEW_MS = 30 * 1_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const TARGETS = new Set(["open", "conceptual", "controversial"]);

export type PracticeGenerationMode = "transform" | "create";

export interface PracticeGenerationProofPayload {
  version: 1;
  generationId: string;
  userId: string;
  mode: PracticeGenerationMode;
  target: "open" | "conceptual" | "controversial" | null;
  contentHash: string;
  issuedAt: number;
  expiresAt: number;
}

export class PracticeGenerationProofError extends Error {
  constructor() {
    super("Invalid practice generation proof");
    this.name = "PracticeGenerationProofError";
  }
}

export function practiceGenerationSecret(): string {
  const secret = process.env.GAME_ACTIVITY_HASH_SECRET?.trim();
  const production = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  if (secret && (!production || secret.length >= 32)) return secret;
  if (production) throw new PracticeGenerationProofError();
  return "practice-generation-local-development-secret";
}

export function hashPracticeGenerationContent(content: string): string {
  return createHash("sha256")
    .update(content.trim().normalize("NFKC"))
    .digest("hex");
}

function signature(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

function isPayload(value: unknown): value is PracticeGenerationProofPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  const validTarget = payload.target === null ||
    (typeof payload.target === "string" && TARGETS.has(payload.target));
  return (
    payload.version === PROOF_VERSION &&
    typeof payload.generationId === "string" &&
    UUID_PATTERN.test(payload.generationId) &&
    typeof payload.userId === "string" &&
    payload.userId.length > 0 &&
    payload.userId.length <= 200 &&
    (payload.mode === "transform" || payload.mode === "create") &&
    validTarget &&
    (payload.mode !== "transform" || payload.target !== null) &&
    (payload.mode !== "create" || payload.target === null) &&
    typeof payload.contentHash === "string" &&
    HASH_PATTERN.test(payload.contentHash) &&
    typeof payload.issuedAt === "number" &&
    Number.isSafeInteger(payload.issuedAt) &&
    typeof payload.expiresAt === "number" &&
    Number.isSafeInteger(payload.expiresAt) &&
    payload.expiresAt - payload.issuedAt === PROOF_LIFETIME_MS
  );
}

export function issuePracticeGenerationProof(
  input: {
    userId: string;
    mode: PracticeGenerationMode;
    target?: "open" | "conceptual" | "controversial" | null;
    content: string;
  },
  secret = practiceGenerationSecret(),
  now = new Date(),
) {
  const issuedAt = now.getTime();
  const payload: PracticeGenerationProofPayload = {
    version: PROOF_VERSION,
    generationId: randomUUID(),
    userId: input.userId,
    mode: input.mode,
    target: input.mode === "transform" ? input.target ?? null : null,
    contentHash: hashPracticeGenerationContent(input.content),
    issuedAt,
    expiresAt: issuedAt + PROOF_LIFETIME_MS,
  };
  if (!isPayload(payload)) throw new PracticeGenerationProofError();
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return {
    proof: `${body}.${signature(body, secret)}`,
    generationId: payload.generationId,
    expiresAt: new Date(payload.expiresAt),
  };
}

export function verifyPracticeGenerationProof(
  proof: string,
  secret = practiceGenerationSecret(),
  now = new Date(),
): PracticeGenerationProofPayload {
  if (!proof || proof.length > 4_096) throw new PracticeGenerationProofError();
  const parts = proof.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new PracticeGenerationProofError();
  }
  const [body, suppliedSignature] = parts;
  const expectedSignature = signature(body, secret);
  const expected = Buffer.from(expectedSignature, "utf8");
  const supplied = Buffer.from(suppliedSignature, "utf8");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new PracticeGenerationProofError();
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new PracticeGenerationProofError();
  }
  if (
    !isPayload(decoded) ||
    decoded.expiresAt <= now.getTime() ||
    decoded.issuedAt > now.getTime() + MAX_CLOCK_SKEW_MS
  ) {
    throw new PracticeGenerationProofError();
  }
  return decoded;
}

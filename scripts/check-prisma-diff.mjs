import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    if (!existsSync(fileName)) continue;
    const lines = readFileSync(fileName, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      const value = rawValue.trim().replace(/^(['"])(.*)\1$/, "$2");
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

export const PRISMA_DIFF_TIMEOUT_MS = Number(process.env.PRISMA_DIFF_TIMEOUT_MS ?? 30_000);

export function shouldSkipPrismaDiffCheck() {
  return process.env.VERCEL === "1" && process.env.FORCE_PRISMA_DIFF_CHECK !== "1";
}

export const DESTRUCTIVE_DIFF_PATTERNS = [
  /\bDROP\s+COLUMN\b/i,
  /^\s*DROP\s+TABLE\b/i,
  /^\s*DROP\s+TYPE\b/i,
  /^\s*DROP\s+INDEX\b/i,
  /\bALTER\s+COLUMN\b.*\bTYPE\b/i,
  /\bALTER\s+COLUMN\b.*\bSET\s+NOT\s+NULL\b/i,
];

export function findDestructivePrismaDiffLines(diffSql) {
  return String(diffSql)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && DESTRUCTIVE_DIFF_PATTERNS.some((pattern) => pattern.test(line)));
}

export function assertSafePrismaDiff(diffSql) {
  const destructiveLines = findDestructivePrismaDiffLines(diffSql);
  if (destructiveLines.length === 0) return;

  throw new Error(
    [
      "Prisma diff contains destructive operations.",
      "Review and apply a safe production migration before deploying.",
      ...destructiveLines.map((line) => `- ${line}`),
    ].join("\n"),
  );
}

export function runPrismaDiff() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for Prisma diff check.");
  }

  const prismaBin = process.platform === "win32"
    ? ".\\node_modules\\.bin\\prisma.cmd"
    : "./node_modules/.bin/prisma";
  const result = spawnSync(
    prismaBin,
    [
      "migrate",
      "diff",
      "--from-url",
      process.env.DATABASE_URL,
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--script",
    ],
    {
      encoding: "utf8",
      env: process.env,
      shell: process.platform === "win32",
      timeout: PRISMA_DIFF_TIMEOUT_MS,
    },
  );

  if (result.error && result.error.message.includes("ETIMEDOUT")) {
    throw new Error(`Prisma diff check timed out after ${PRISMA_DIFF_TIMEOUT_MS}ms.`);
  }

  if (result.status !== 0) {
    throw new Error(
      [
        "Prisma diff check failed to run.",
        result.stderr?.trim(),
        result.stdout?.trim(),
      ].filter(Boolean).join("\n"),
    );
  }

  return result.stdout ?? "";
}

async function main() {
  if (shouldSkipPrismaDiffCheck()) {
    console.log("Skipping Prisma diff guard on Vercel. Run npm run db:diff:check locally before schema-changing deploys.");
    return;
  }

  const diffSql = runPrismaDiff();
  assertSafePrismaDiff(diffSql);
  console.log("Prisma diff guard passed.");
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : "";

if (currentFile === invokedFile) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

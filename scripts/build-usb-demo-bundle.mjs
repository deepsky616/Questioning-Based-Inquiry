import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createDemoLauncherHtml } from "./demo-launcher-html.mjs";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_TARGET_ROOT = "/Users/youngmini/Documents/QuestionLab";

const SOURCE_DIRECTORIES = [
  "messages/",
  "prisma/",
  "public/",
  "scripts/",
  "src/",
];

const EXCLUDED_SOURCE_DIRECTORIES = [
  "src/__tests__/",
];

const SOURCE_ROOT_FILES = new Set([
  ".env.example",
  ".gitignore",
  "README.md",
  "eslint.config.mjs",
  "next-env.d.ts",
  "next.config.js",
  "package-lock.json",
  "package.json",
  "postcss.config.js",
  "sentry.edge.config.ts",
  "sentry.server.config.ts",
  "tailwind.config.ts",
  "tsconfig.json",
  "vercel.json",
]);

function sourceFileAllowed(relativePath) {
  if (
    relativePath.startsWith("/") ||
    relativePath.split("/").includes("..") ||
    (relativePath.startsWith(".env") && relativePath !== ".env.example") ||
    EXCLUDED_SOURCE_DIRECTORIES.some((directory) => relativePath.startsWith(directory))
  ) {
    return false;
  }
  return SOURCE_ROOT_FILES.has(relativePath) ||
    SOURCE_DIRECTORIES.some((directory) => relativePath.startsWith(directory));
}

function copySourceFiles(sourceRoot, destinationRoot) {
  const trackedFiles = execFileSync(
    "git",
    ["-C", sourceRoot, "ls-files", "-z"],
    { encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean)
    .filter(sourceFileAllowed);

  rmSync(destinationRoot, { recursive: true, force: true });
  mkdirSync(destinationRoot, { recursive: true });
  for (const relativePath of trackedFiles) {
    const destinationPath = join(destinationRoot, relativePath);
    mkdirSync(dirname(destinationPath), { recursive: true });
    copyFileSync(join(sourceRoot, relativePath), destinationPath);
  }
}

export function buildUsbDemoBundle({
  targetRoot = DEFAULT_TARGET_ROOT,
  sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  ticket = randomBytes(32).toString("base64url"),
} = {}) {
  const normalizedTicket = String(ticket).trim();
  if (!normalizedTicket) {
    throw new Error("시연 실행 표가 비어 있습니다.");
  }

  const imageDir = join(targetRoot, "media", "image");
  const soundDir = join(targetRoot, "media", "sound");
  const programDir = join(targetRoot, "program");
  const sourceDir = join(programDir, "source");
  mkdirSync(imageDir, { recursive: true });
  mkdirSync(soundDir, { recursive: true });
  mkdirSync(programDir, { recursive: true });
  rmSync(join(soundDir, "start.wav"), { force: true });

  copyFileSync(
    join(sourceRoot, "public", "login-inquiry-hero.png"),
    join(imageDir, "login-inquiry-hero.png"),
  );
  copyFileSync(
    join(sourceRoot, "public", "question-learning-cover.png"),
    join(imageDir, "question-learning-cover.png"),
  );
  copySourceFiles(sourceRoot, sourceDir);

  writeFileSync(
    join(programDir, "index.html"),
    createDemoLauncherHtml({ ticket: normalizedTicket }),
    "utf8",
  );

  return {
    targetRoot,
    ticketHash: createHash("sha256").update(normalizedTicket).digest("hex"),
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  const result = buildUsbDemoBundle();
  console.log(`제출 폴더: ${result.targetRoot}`);
  console.log(`DEMO_LAUNCH_TOKEN_HASH=${result.ticketHash}`);
}

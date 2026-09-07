import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_TARGET_ROOT = "/Users/youngmini/Documents/QuestionLab";
const DEMO_LAUNCH_URL =
  "https://questioning-based-inquiry.vercel.app/demo/launch";

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

function createLauncherHtml(targetUrl) {
  const safeTarget = targetUrl
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>질문연구소</title>
  <style>
    * { box-sizing: border-box; }
    html, body { min-height: 100%; margin: 0; }
    body {
      display: grid;
      place-items: center;
      padding: 24px;
      color: #172033;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        linear-gradient(rgba(255, 255, 255, 0.84), rgba(255, 255, 255, 0.94)),
        url("../media/image/login-inquiry-hero.png") center / cover no-repeat fixed;
    }
    main { width: min(100%, 520px); text-align: center; }
    h1 { margin: 0 0 12px; font-size: clamp(30px, 8vw, 48px); line-height: 1.15; }
    p { margin: 0 0 24px; color: #526077; font-size: 17px; line-height: 1.6; }
    a {
      display: inline-flex;
      min-height: 48px;
      align-items: center;
      justify-content: center;
      padding: 12px 22px;
      border-radius: 6px;
      color: #fff;
      background: #176b52;
      font-weight: 700;
      text-decoration: none;
    }
    a:focus-visible { outline: 3px solid #e8a317; outline-offset: 3px; }
  </style>
</head>
<body>
  <main>
    <h1>질문연구소</h1>
    <p>웹브라우저에서 김질문 학생 화면을 준비하고 있습니다.</p>
    <a href="${safeTarget}">질문연구소 열기</a>
  </main>
  <script>
    window.location.replace(${JSON.stringify(targetUrl)});
  </script>
</body>
</html>
`;
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

  const targetUrl = `${DEMO_LAUNCH_URL}#ticket=${encodeURIComponent(normalizedTicket)}`;
  writeFileSync(
    join(programDir, "index.html"),
    createLauncherHtml(targetUrl),
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

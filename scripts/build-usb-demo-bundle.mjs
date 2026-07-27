import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_TARGET_ROOT = "/Users/youngmini/Documents/QuestionLab";
const DEMO_LAUNCH_URL =
  "https://questioning-based-inquiry.vercel.app/demo/launch";

function createStartSound() {
  const sampleRate = 8_000;
  const durationSeconds = 0.25;
  const sampleCount = Math.floor(sampleRate * durationSeconds);
  const dataSize = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = Math.min(index / 160, (sampleCount - index) / 320, 1);
    const sample =
      Math.sin((2 * Math.PI * 660 * index) / sampleRate) *
      8_000 *
      Math.max(0, envelope);
    wav.writeInt16LE(Math.round(sample), 44 + index * 2);
  }

  return wav;
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
  mkdirSync(imageDir, { recursive: true });
  mkdirSync(soundDir, { recursive: true });
  mkdirSync(programDir, { recursive: true });

  copyFileSync(
    join(sourceRoot, "public", "login-inquiry-hero.png"),
    join(imageDir, "login-inquiry-hero.png"),
  );
  copyFileSync(
    join(sourceRoot, "public", "question-learning-cover.png"),
    join(imageDir, "question-learning-cover.png"),
  );
  writeFileSync(join(soundDir, "start.wav"), createStartSound());

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

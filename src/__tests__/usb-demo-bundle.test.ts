import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import { buildUsbDemoBundle } from "../../scripts/build-usb-demo-bundle.mjs";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("윈도우 USB 제출 묶음", () => {
  it("시작 파일, 이미지 두 개와 비밀값을 제외한 소스 파일을 만든다", () => {
    const targetRoot = mkdtempSync(join(tmpdir(), "questionlab-usb-"));
    tempRoots.push(targetRoot);
    const soundDir = join(targetRoot, "media", "sound");
    mkdirSync(soundDir, { recursive: true });
    writeFileSync(join(soundDir, "start.wav"), "사용하지 않는 이전 파일");

    const result = buildUsbDemoBundle({
      targetRoot,
      sourceRoot: process.cwd(),
      ticket: "test-usb-ticket",
    });

    const indexPath = join(targetRoot, "program", "index.html");
    const html = readFileSync(indexPath, "utf8");
    expect(html).toContain(
      "https://questioning-based-inquiry.vercel.app/demo/launch#ticket=test-usb-ticket",
    );
    expect(html).toContain("질문연구소 열기");
    expect(html).toContain("../media/image/login-inquiry-hero.png");
    expect(html).not.toContain("DEMO_AI_SOURCE_EMAIL");
    expect(html).not.toContain("climbing1126");

    expect(
      statSync(join(targetRoot, "media", "image", "login-inquiry-hero.png"))
        .size,
    ).toBeGreaterThan(0);
    expect(
      statSync(join(targetRoot, "media", "image", "question-learning-cover.png"))
        .size,
    ).toBeGreaterThan(0);

    expect(statSync(soundDir).isDirectory()).toBe(true);
    expect(existsSync(join(soundDir, "start.wav"))).toBe(false);

    const sourceDir = join(targetRoot, "program", "source");
    expect(
      readFileSync(join(sourceDir, "package.json"), "utf8"),
    ).toContain('"name": "question-lab"');
    expect(
      readFileSync(join(sourceDir, "src", "app", "layout.tsx"), "utf8"),
    ).toContain("RootLayout");
    expect(
      readFileSync(join(sourceDir, "prisma", "schema.prisma"), "utf8"),
    ).toContain("model User");
    expect(existsSync(join(sourceDir, ".env.example"))).toBe(true);
    expect(existsSync(join(sourceDir, ".env.local"))).toBe(false);
    expect(existsSync(join(sourceDir, ".git"))).toBe(false);
    expect(existsSync(join(sourceDir, ".github"))).toBe(false);
    expect(existsSync(join(sourceDir, "e2e"))).toBe(false);
    expect(existsSync(join(sourceDir, "src", "__tests__"))).toBe(false);
    expect(existsSync(join(sourceDir, "playwright.config.ts"))).toBe(false);
    expect(existsSync(join(sourceDir, "vitest.config.ts"))).toBe(false);
    expect(existsSync(join(sourceDir, "node_modules"))).toBe(false);
    expect(result.ticketHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("실행 표를 주지 않으면 32바이트 임의 실행 표를 만든다", () => {
    const targetRoot = mkdtempSync(join(tmpdir(), "questionlab-usb-"));
    tempRoots.push(targetRoot);

    const result = buildUsbDemoBundle({
      targetRoot,
      sourceRoot: process.cwd(),
    });

    expect(result.ticketHash).toMatch(/^[a-f0-9]{64}$/);
    const html = readFileSync(join(targetRoot, "program", "index.html"), "utf8");
    expect(html).toMatch(/#ticket=[A-Za-z0-9_-]{43}/);
  });

  it("패키지 명령으로 제출 묶음을 만들 수 있다", () => {
    expect(packageJson.scripts["demo:usb"]).toBe(
      "node scripts/build-usb-demo-bundle.mjs",
    );
  });
});

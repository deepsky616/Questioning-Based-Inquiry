import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
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
  it("시작 파일, 이미지 두 개와 시작음을 지정 폴더에 만든다", () => {
    const targetRoot = mkdtempSync(join(tmpdir(), "questionlab-usb-"));
    tempRoots.push(targetRoot);

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

    const wav = readFileSync(
      join(targetRoot, "media", "sound", "start.wav"),
    );
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
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

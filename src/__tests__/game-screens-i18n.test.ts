import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * 질문놀이 화면 국제화 가드.
 *
 * 게임 화면은 마지막까지 한국어 하드코딩이 남았던 영역이다 — 전면 국제화
 * 이후 새 게임·기능이 다시 하드코딩을 들여오지 못하도록, 게임 디렉토리의
 * 소스에서 주석이 아닌 줄의 한글을 금지한다. 사용자에게 보일 문자열은
 * messages 카탈로그(gamePlay 네임스페이스)를 통해야 한다.
 */

const GAME_DIRS = [
  "src/app/(student)/student-question-play",
  "src/app/(teacher)/teacher-question-play",
  "src/components/question-games",
];

const HANGUL = /[가-힣]/;
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|\{\/\*)/;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("game screens i18n guard", () => {
  it("게임 화면 소스에 주석이 아닌 한글 하드코딩이 없다", () => {
    const offending: string[] = [];
    for (const dir of GAME_DIRS) {
      for (const file of tsxFiles(dir)) {
        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (HANGUL.test(line) && !COMMENT_LINE.test(line)) {
            offending.push(`${file}:${i + 1} ${line.trim().slice(0, 60)}`);
          }
        });
      }
    }
    expect(offending, "게임 화면의 한글 하드코딩").toEqual([]);
  });
});

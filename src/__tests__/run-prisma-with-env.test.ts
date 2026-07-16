import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

function isolatedRunner() {
  const root = mkdtempSync(join(tmpdir(), "question-lab-prisma-runner-"));
  temporaryDirectories.push(root);
  const scripts = join(root, "scripts");
  mkdirSync(scripts);
  const runner = join(scripts, "run-prisma-with-env.mjs");
  writeFileSync(runner, readFileSync("scripts/run-prisma-with-env.mjs", "utf8"));
  return { root, runner };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Prisma 환경 실행 래퍼", () => {
  it("로컬 환경 파일이 없어도 기존 DATABASE_URL로 명령을 실행한다", () => {
    const { runner } = isolatedRunner();
    const result = spawnSync(process.execPath, [runner, "--version"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://user:pass@localhost:5432/database",
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("prisma");
  });

  it("기존 환경값이 없을 때만 .env.local의 DATABASE_URL을 사용한다", () => {
    const { root, runner } = isolatedRunner();
    writeFileSync(
      join(root, ".env.local"),
      "DATABASE_URL=postgresql://user:pass@localhost:5432/database\n",
    );
    const environment = { ...process.env };
    delete environment.DATABASE_URL;
    const result = spawnSync(process.execPath, [runner, "--version"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: environment,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("prisma");
  });

  it("환경값과 로컬 환경 파일이 모두 없으면 자료베이스 명령을 시작하지 않는다", () => {
    const environment = { ...process.env };
    delete environment.DATABASE_URL;
    const { runner } = isolatedRunner();
    const result = spawnSync(process.execPath, [runner, "--version"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: environment,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DATABASE_URL is required");
  });
});

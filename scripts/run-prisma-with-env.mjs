// prisma CLI는 .env만 읽고 .env.local을 읽지 않는다 — 이 래퍼가 .env.local의
// DATABASE_URL을 주입해 마이그레이션 명령을 실행한다.
// 사용: node scripts/run-prisma-with-env.mjs migrate status
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const match = envFile.match(/^DATABASE_URL="?([^"\n]+)"?$/m);
if (!match) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}

const result = spawnSync("npx", ["prisma", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: match[1] },
});
process.exit(result.status ?? 1);

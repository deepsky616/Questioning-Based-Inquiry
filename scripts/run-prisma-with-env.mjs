// 배포 환경의 DATABASE_URL을 우선 사용하고, 로컬에서만 .env.local로 보완한다.
// 사용: node scripts/run-prisma-with-env.mjs migrate status
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

let databaseUrl = process.env.DATABASE_URL?.trim();
const localEnvUrl = new URL("../.env.local", import.meta.url);
if (!databaseUrl && existsSync(localEnvUrl)) {
  const envFile = readFileSync(localEnvUrl, "utf8");
  const match = envFile.match(/^DATABASE_URL="?([^"\n]+)"?$/m);
  databaseUrl = match?.[1]?.trim();
}

if (!databaseUrl) {
  console.error("DATABASE_URL is required for Prisma migration commands.");
  process.exit(1);
}

const result = spawnSync("npx", ["prisma", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: databaseUrl },
});
process.exit(result.status ?? 1);

// 배포 환경의 DATABASE_URL/DIRECT_URL을 우선 사용하고, 로컬에서만 .env.local로 보완한다.
// 사용: node scripts/run-prisma-with-env.mjs migrate status
//
// DIRECT_URL은 migrate 계열 명령(schema engine)이 쓰는 직접 연결(세션 모드)이다.
// transaction 풀러(포트 6543)는 prepared statement를 지원하지 않아
// "prepared statement s0 does not exist" 오류로 실패한다.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const localEnvUrl = new URL("../.env.local", import.meta.url);
const localEnvFile = existsSync(localEnvUrl) ? readFileSync(localEnvUrl, "utf8") : "";

function resolveEnv(name) {
  const fromProcess = process.env[name]?.trim();
  if (fromProcess) return fromProcess;
  const match = localEnvFile.match(new RegExp(`^${name}="?([^"\\n]+)"?$`, "m"));
  return match?.[1]?.trim();
}

const databaseUrl = resolveEnv("DATABASE_URL");
let directUrl = resolveEnv("DIRECT_URL");

if (!databaseUrl) {
  console.error("DATABASE_URL is required for Prisma migration commands.");
  process.exit(1);
}

if (!directUrl) {
  directUrl = databaseUrl;
  if (/:6543\//.test(databaseUrl)) {
    console.warn(
      "[run-prisma-with-env] DIRECT_URL이 없어 DATABASE_URL로 대체합니다. " +
        "DATABASE_URL이 transaction 풀러(6543)라 migrate 명령이 실패할 수 있습니다 — " +
        "세션 모드(5432) 주소를 DIRECT_URL로 설정하세요.",
    );
  }
}

const result = spawnSync("npx", ["prisma", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: directUrl },
});
process.exit(result.status ?? 1);

import { z } from "zod";

/**
 * 서버 필수 환경변수 검증.
 *
 * 누락/오류 시 명확한 에러로 즉시 실패시켜, 런타임에서 엉뚱한 증상으로
 * 디버깅하는 일을 막는다. (예: DATABASE_URL이 잘못되면 DB 연결 실패가
 * 로그인 화면에서는 "이메일 또는 비밀번호가 올바르지 않습니다"처럼 보인다.)
 */
const GAME_ACTIVITY_HASH_SECRET_MIN_LENGTH = 32;

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL이 비어 있습니다"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET이 비어 있습니다"),
  GAME_ACTIVITY_HASH_SECRET: z.string().trim().optional(),
  NODE_ENV: z.string().optional(),
  VERCEL: z.string().optional(),
}).superRefine((env, ctx) => {
  const isProduction = env.NODE_ENV === "production" || env.VERCEL === "1";
  if (
    isProduction &&
    (!env.GAME_ACTIVITY_HASH_SECRET ||
      env.GAME_ACTIVITY_HASH_SECRET.length < GAME_ACTIVITY_HASH_SECRET_MIN_LENGTH)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GAME_ACTIVITY_HASH_SECRET"],
      message: `운영 환경에서는 ${GAME_ACTIVITY_HASH_SECRET_MIN_LENGTH}자 이상이어야 합니다`,
    });
  }
});

let validated = false;

export function validateServerEnv(): void {
  if (validated) return;

  const result = serverEnvSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    GAME_ACTIVITY_HASH_SECRET: process.env.GAME_ACTIVITY_HASH_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
  });

  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw new Error(
      `[환경변수 오류] 필수 서버 환경변수가 누락/오류입니다 → ${detail}`
    );
  }

  validated = true;
}

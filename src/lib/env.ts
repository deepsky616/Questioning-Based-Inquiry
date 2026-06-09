import { z } from "zod";

/**
 * 서버 필수 환경변수 검증.
 *
 * 누락/오류 시 명확한 에러로 즉시 실패시켜, 런타임에서 엉뚱한 증상으로
 * 디버깅하는 일을 막는다. (예: DATABASE_URL이 잘못되면 DB 연결 실패가
 * 로그인 화면에서는 "이메일 또는 비밀번호가 올바르지 않습니다"처럼 보인다.)
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL이 비어 있습니다"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET이 비어 있습니다"),
});

let validated = false;

export function validateServerEnv(): void {
  if (validated) return;

  const result = serverEnvSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
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

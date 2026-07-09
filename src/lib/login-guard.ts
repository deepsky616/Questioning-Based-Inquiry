import { rateLimit } from "./rate-limit";

/**
 * 로그인 무차별 대입(브루트포스) 1차 방어.
 *
 * 학생 로그인은 학교·학년·반·번호로 계정이 특정되므로, 계정 단위로
 * 시도 횟수를 제한해 비밀번호 무한 시도를 막는다. IP 기준이 아니라
 * 계정 기준이므로 분산 공격에도 같은 계정은 같은 한도를 공유한다.
 *
 * 인메모리 리미터의 한계(서버리스 인스턴스별 카운트)는 rate-limit.ts에
 * 문서화된 그대로이며, 회원가입·비밀번호 재설정과 같은 수준의 방어다.
 */
export const LOGIN_ATTEMPT_LIMIT = 10;
export const LOGIN_ATTEMPT_WINDOW_MS = 60_000;

/** 로그인 요청에서 계정 식별 키를 만든다. 식별 불가능한 요청은 null. */
export function buildLoginIdentity(credentials: {
  loginType?: unknown;
  email?: unknown;
  school?: unknown;
  grade?: unknown;
  className?: unknown;
  studentNumber?: unknown;
}): string | null {
  if (credentials.loginType === "student") {
    const parts = [credentials.school, credentials.grade, credentials.className, credentials.studentNumber];
    if (parts.some((p) => typeof p !== "string" || !p)) return null;
    return `student:${(parts as string[]).map((p) => p.trim()).join(":")}`;
  }
  const email = credentials.email;
  if (typeof email !== "string" || !email) return null;
  return `teacher:${email.trim().toLowerCase()}`;
}

/** 이 계정의 로그인 시도가 한도 안인지 확인한다(호출 자체가 1회 시도로 계수됨). */
export function isLoginAttemptAllowed(identity: string): boolean {
  return rateLimit(`login:${identity}`, {
    limit: LOGIN_ATTEMPT_LIMIT,
    windowMs: LOGIN_ATTEMPT_WINDOW_MS,
  }).success;
}

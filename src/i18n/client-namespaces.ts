import type { AbstractIntlMessages } from "next-intl";

/**
 * 레이아웃별 클라이언트 번역 페이로드 목록.
 *
 * 루트 레이아웃이 전체 카탈로그(~65KB)를 모든 페이지에 인라인하던 것을,
 * 영역(루트/인증/학생/교사)별로 실제 쓰는 namespace만 보내도록 나눈다.
 * 학생 태블릿 기준 페이지 페이로드가 약 40% 줄어든다.
 *
 * 목록이 실제 사용과 어긋나면 i18n-client-payload.test.ts 가드가
 * 소스 import 그래프를 다시 스캔해 배포 전에 실패시킨다 — 새 화면에서
 * 새 namespace를 쓰기 시작했다면 해당 영역 목록에 추가하면 된다.
 */

export const ROOT_CLIENT_NAMESPACES = [
  "appShell",
  "common",
] as const;

export const AUTH_CLIENT_NAMESPACES = [
  "auth",
  "common", // 회원가입의 담당 학급 검증 메시지·학년반 라벨
] as const;

export const STUDENT_CLIENT_NAMESPACES = [
  "account",
  "aiProgress",
  "appShell",
  "ask",
  "chart",
  "chrome",
  "classification",
  "comment",
  "common",
  "designRef",
  "explore",
  "gamePlay",
  "learningSound",
  "myQuestions",
  "nav",
  "notify",
  "pages",
  "playLanding",
  "pointLabel",
  "points",
  "practice",
  "qstats",
  "questionLearning",
  "ranking",
  "report",
  "reports",
  "sessions",
  "settings",
  "studentDash",
  "studentQ",
  "studentSettings",
  "translate",
  "unitDesign",
] as const;

export const TEACHER_CLIENT_NAMESPACES = [
  "account",
  "accountWithdrawal",
  "aiProgress",
  "appShell",
  "ask",
  "chart",
  "chrome",
  "classification",
  "comment",
  "common",
  "curriculum",
  "dashboard",
  "designRef",
  "gamePlay",
  "gamePreview",
  "learningSound",
  "nav",
  "notify",
  "pages",
  "pointLabel",
  "pointReview",
  "practice",
  "publishDialog",
  "qPlay",
  "qstats",
  "questionLearning",
  "ranking",
  "report",
  "reports",
  "seqEditor",
  "sequencePanel",
  "sessions",
  "settings",
  "students",
  "targetSelector",
  "teacherPoints",
  "teacherQ",
  "translate",
] as const;

/** 카탈로그에서 지정한 최상위 namespace만 골라낸다. */
export function pickMessages(
  messages: AbstractIntlMessages,
  namespaces: readonly string[],
): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {};
  for (const ns of namespaces) {
    if (ns in messages) picked[ns] = messages[ns];
  }
  return picked;
}

import { NextResponse } from "next/server";

/** 시연 중에도 실행 파일이 사용하는 계정과 공용 인공지능 설정을 유지한다. */
export function protectDemoAccountSettings(user: { isDemo?: boolean | null }) {
  return user.isDemo === true
    ? NextResponse.json({ error: "시연 계정의 계정 관리와 인공지능 설정은 변경할 수 없습니다." }, { status: 403 })
    : null;
}

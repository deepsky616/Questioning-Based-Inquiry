import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

interface SingleAwardBody {
  mode?: unknown;
  gameId?: unknown;
  instanceId?: unknown;
  completed?: unknown;
}

// 싱글 게임(혼자/AI) 종료 시 1회 호출
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  // 학생만 포인트 적립. 교사 미리보기/체험은 적립·기록 없이 통과시킨다.
  if ((session.user as { role?: string }).role !== "STUDENT") {
    return NextResponse.json({ awarded: 0, preview: true });
  }

  const body = (await req.json().catch(() => ({}))) as SingleAwardBody;
  const hasMode = body.mode === "solo" || body.mode === "ai";
  if (
    !hasMode ||
    typeof body.gameId !== "string" || !body.gameId ||
    typeof body.instanceId !== "string" || !body.instanceId
  ) {
    return NextResponse.json(
      { error: "mode, gameId, instanceId 필요" },
      { status: 400 },
    );
  }
  if (body.completed !== true) {
    return NextResponse.json({
      awarded: 0,
      notCompleted: true,
      message: "놀이를 끝까지 마무리해야 포인트가 지급돼요.",
    });
  }

  // 단독 놀이는 현재 서버에 시작/진행/완료 기록이 없어 요청값을 검증할 수 없다.
  // 검증 가능한 서버 기록이 도입되기 전까지 점수 쓰기를 기본 거부한다.
  return NextResponse.json(
    {
      awarded: 0,
      verificationRequired: true,
      message: "서버에서 놀이 완료를 확인할 수 없어 포인트를 지급하지 않았어요.",
    },
    { status: 409 },
  );
}

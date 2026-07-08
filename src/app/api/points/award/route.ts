import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/api-rate-limit";
import { awardGamePoints, PointAwardError } from "@/lib/point-award-service";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const limited = checkRateLimit(`points-award:${userId}`, 10);
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const result = await awardGamePoints(body, userId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PointAwardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "포인트 지급 실패" }, { status: 500 });
  }
}

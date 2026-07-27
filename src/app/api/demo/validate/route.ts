import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/api-rate-limit";
import { validateDemoLaunchTicket } from "@/lib/demo-config";

const requestSchema = z.object({
  ticket: z.string().min(1).max(512),
});

const statusByReason = {
  disabled: 503,
  missing: 400,
  invalid: 403,
  expired: 410,
  misconfigured: 503,
} as const;

export async function POST(req: Request) {
  const limited = checkRateLimit(
    `demo-validate:ip:${getClientIp(req)}`,
    20,
  );
  if (limited) return limited;

  try {
    const body = requestSchema.parse(await req.json());
    const validation = validateDemoLaunchTicket(body.ticket);
    if (!validation.ok) {
      return NextResponse.json(
        { ok: false, reason: validation.reason },
        { status: statusByReason[validation.reason] },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, reason: "missing" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, reason: "misconfigured" },
      { status: 503 },
    );
  }
}

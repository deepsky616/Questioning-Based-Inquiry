import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teacherId = (session.user as { id: string }).id;
  const { id } = params;

  const rows = await prisma.$queryRaw<{ teacher_id: string }[]>`
    SELECT teacher_id FROM unit_designs WHERE id = ${id} LIMIT 1
  `;
  if (!rows[0] || rows[0].teacher_id !== teacherId) {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  await prisma.$executeRawUnsafe(`DELETE FROM unit_designs WHERE id = $1`, id);
  return NextResponse.json({ ok: true });
}

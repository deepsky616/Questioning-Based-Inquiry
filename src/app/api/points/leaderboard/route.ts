import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as { id: string }).id;

  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { school: true, grade: true, className: true, role: true },
  });
  if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const scope = req.nextUrl.searchParams.get("scope") ?? "class"; // class | school
  const where: Record<string, unknown> = { role: "STUDENT" };

  if (me.school) where.school = me.school;
  if (scope === "class" && me.grade && me.className) {
    where.grade = me.grade;
    where.className = me.className;
  }

  const students = await prisma.user.findMany({
    where,
    select: { id: true, name: true, grade: true, className: true, totalPoints: true },
    orderBy: { totalPoints: "desc" },
    take: 50,
  });

  return NextResponse.json({
    scope, school: me.school, grade: me.grade, className: me.className,
    students,
  });
}

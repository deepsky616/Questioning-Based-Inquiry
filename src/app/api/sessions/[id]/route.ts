import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { lockAccountLifecycles } from "@/lib/account-lifecycle-lock";
import { requireTeacherSession } from "@/lib/session-helpers";
import {
  lockPointIntegritySessionRows,
  lockSessionDeletionTargets,
  rejectPendingActivityBonuses,
} from "@/lib/pending-activity-bonus-cleanup";
import {
  lockAndRequireCurrentTeacher,
  lockSessionWriteLifecycles,
  lockUnitDesignOwnership,
  normalizeSessionTarget,
  revalidateSessionTargetAfterLifecycleLocks,
  sessionTargetLifecycleUserIds,
} from "@/lib/session-write-access";
import { isValidSessionDateString } from "@/lib/sessions";
import { z } from "zod";

const sessionDateSchema = z.string().trim().refine(isValidSessionDateString);

const updateSchema = z.object({
  date: sessionDateSchema.optional(),
  subject: z.string().min(1).optional(),
  topic: z.string().optional(),
  targetType: z.enum(["ALL", "CLASS", "STUDENT", "CUSTOM"]).optional(),
  targetGrade: z.string().nullable().optional(),
  targetClassName: z.string().nullable().optional(),
  targetStudentId: z.string().nullable().optional(),
  targetStudentIds: z.array(z.string()).optional(),
  unitDesignId: z.string().nullable().optional(),
  sharedQuestions: z
    .array(z.object({ type: z.string(), content: z.string() }).passthrough())
    .optional(),
  defaultQuestionPublic: z.boolean().optional(),
  likesVisibleToPeers: z.boolean().optional(),
  commentsVisibleToPeers: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = requireTeacherSession(await auth());
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  }

  try {
    const { id } = await params;
    const existing = await prisma.questionSession.findUnique({ where: { id } });
    if (!existing || existing.teacherId !== authResult.user.id) {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }
    const body = await req.json();
    const data = updateSchema.parse(body);
    const observedTarget = normalizeSessionTarget(data, existing);
    const result = await prisma.$transaction(async (tx) => {
      const lifecycleStudentIds = await lockSessionWriteLifecycles(
        tx,
        authResult.user.id,
        observedTarget,
      );
      const lockedSessions = await lockPointIntegritySessionRows(tx, [id]);
      if (lockedSessions.length !== 1) return { kind: "changed" } as const;

      const current = await tx.questionSession.findUnique({ where: { id } });
      if (!current || current.teacherId !== authResult.user.id) {
        return { kind: "forbidden" } as const;
      }
      const target = normalizeSessionTarget(data, current);
      const lifecycleStudentIdSet = new Set(lifecycleStudentIds);
      if (
        sessionTargetLifecycleUserIds(target).some(
          (studentId) => !lifecycleStudentIdSet.has(studentId),
        )
      ) {
        return { kind: "changed" } as const;
      }
      if (!(await revalidateSessionTargetAfterLifecycleLocks(tx, authResult.user.id, target))) {
        return { kind: "target-forbidden" } as const;
      }
      if (
        data.unitDesignId !== undefined &&
        !(await lockUnitDesignOwnership(tx, authResult.user.id, data.unitDesignId))
      ) {
        return { kind: "design-forbidden" } as const;
      }

      const {
        sharedQuestions,
        targetType: _targetType,
        targetGrade: _targetGrade,
        targetClassName: _targetClassName,
        targetStudentId: _targetStudentId,
        targetStudentIds: _targetStudentIds,
        ...scalarData
      } = data;
      const updateData: Prisma.QuestionSessionUpdateInput = {
        ...scalarData,
        ...target,
        targetStudentIds: target.targetStudentIds as Prisma.InputJsonValue,
        ...(sharedQuestions !== undefined && {
          sharedQuestions: sharedQuestions as Prisma.InputJsonValue,
        }),
      };
      const nextSession = await tx.questionSession.update({
        where: { id },
        data: updateData,
      });
      if (data.isActive === false) {
        await tx.appNotification.updateMany({
          where: { sessionId: id, type: "SESSION_REMINDER" },
          data: { href: null },
        });
        await tx.appNotification.updateMany({
          where: { sessionId: id, type: "SESSION_REMINDER", readAt: null },
          data: { readAt: new Date() },
        });
      }
      return { kind: "updated", session: nextSession } as const;
    });
    if (result.kind === "target-forbidden") {
      return NextResponse.json({ error: "질문수업 대상을 지정할 권한이 없습니다" }, { status: 403 });
    }
    if (result.kind === "design-forbidden") {
      return NextResponse.json({ error: "탐구설계를 연결할 권한이 없습니다" }, { status: 403 });
    }
    if (result.kind === "forbidden") {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }
    if (result.kind === "changed") {
      return NextResponse.json(
        { error: "질문수업 대상이 바뀌었습니다. 다시 시도해 주세요" },
        { status: 409 },
      );
    }
    return NextResponse.json(result.session);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "입력 형식이 올바르지 않습니다" }, { status: 400 });
    }
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = requireTeacherSession(await auth());
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.message }, { status: authResult.status });
  }

  try {
    const { id } = await params;
    const deletion = await prisma.$transaction(async (tx) => {
      await lockAccountLifecycles(tx, [authResult.user.id]);
      if (!(await lockAndRequireCurrentTeacher(tx, authResult.user.id))) {
        return "FORBIDDEN" as const;
      }
      const targets = await lockSessionDeletionTargets(tx, [id]);
      const lockedSession = targets.sessions.find((session) => session.id === id);
      if (!lockedSession) return "MISSING" as const;
      if (lockedSession.teacherId !== authResult.user.id) return "FORBIDDEN" as const;
      if (!targets.stable) return "CHANGED" as const;

      await rejectPendingActivityBonuses(tx, { sessionIds: [id] });
      await tx.pointLog.updateMany({
        where: { sessionId: id },
        data: { sessionId: null },
      });
      await tx.appNotification.deleteMany({
        where: { sessionId: id, type: "SESSION_REMINDER" },
      });
      await tx.sessionAnalysis.deleteMany({ where: { sessionId: id } });
      await tx.questionSession.delete({ where: { id } });
      return "DELETED" as const;
    });
    if (deletion === "MISSING") {
      return NextResponse.json({ error: "질문수업을 찾을 수 없습니다" }, { status: 404 });
    }
    if (deletion === "FORBIDDEN") {
      return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
    }
    if (deletion === "CHANGED") {
      return NextResponse.json(
        { error: "질문수업 내용이 바뀌었습니다. 다시 시도해 주세요" },
        { status: 409 },
      );
    }
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

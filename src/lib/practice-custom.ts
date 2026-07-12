import { z } from "zod";
import { prisma } from "@/lib/db";
import type {
  PracticeQuizItem,
  PracticeTransformItem,
  PracticeCreateTopic,
} from "@/lib/question-practice-data";

/**
 * 교사 커스텀 연습 문항 — 검증 스키마와 조회 헬퍼.
 *
 * 내장 은행(question-practice-data.ts)은 검수본 그대로 두고, 교사가 추가한
 * 문항을 은행과 같은 모양으로 변환해 학생 연습에 병합한다. 학생↔교사 범위는
 * 연습 현황(practice-stats)과 동일 규칙: 같은 학교 + 담당 학년·반
 * (담당 학급이 없는 교사의 문항은 같은 학교 전체에 보인다).
 */

const closureSchema = z.enum(["closed", "open"]);
const cognitiveSchema = z.enum(["factual", "conceptual", "controversial"]);
const targetSchema = z.enum(["open", "conceptual", "controversial"]);

export const practiceCustomItemSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("quiz"),
    content: z.string().trim().min(5).max(200),
    closure: closureSchema,
    cognitive: cognitiveSchema,
    explanation: z.string().trim().min(5).max(300),
  }),
  z.object({
    mode: z.literal("transform"),
    source: z.string().trim().min(5).max(200),
    target: targetSchema,
    hint: z.string().trim().min(5).max(200),
    example: z.string().trim().min(5).max(200),
  }),
  z.object({
    mode: z.literal("create"),
    title: z.string().trim().min(1).max(40),
    passage: z.string().trim().min(30).max(400),
  }),
]);

export type PracticeCustomItemInput = z.infer<typeof practiceCustomItemSchema>;

/** DB 행(문자열 컬럼) — Prisma 타입 의존 없이 필요한 필드만 */
export interface PracticeCustomRow {
  id: string;
  mode: string;
  content: string | null;
  closure: string | null;
  cognitive: string | null;
  explanation: string | null;
  source: string | null;
  target: string | null;
  hint: string | null;
  example: string | null;
  title: string | null;
  passage: string | null;
}

export interface MergedCustomBank {
  quiz: PracticeQuizItem[];
  transform: PracticeTransformItem[];
  create: PracticeCreateTopic[];
}

/** DB 행을 내장 은행과 같은 모양으로 변환 — 필수 필드가 빠진 행은 버린다 */
export function rowsToBank(rows: PracticeCustomRow[]): MergedCustomBank {
  const bank: MergedCustomBank = { quiz: [], transform: [], create: [] };
  for (const row of rows) {
    if (row.mode === "quiz" && row.content && row.closure && row.cognitive && row.explanation) {
      bank.quiz.push({
        id: row.id,
        content: row.content,
        closure: row.closure as PracticeQuizItem["closure"],
        cognitive: row.cognitive as PracticeQuizItem["cognitive"],
        explanation: row.explanation,
      });
    } else if (row.mode === "transform" && row.source && row.target && row.hint && row.example) {
      bank.transform.push({
        id: row.id,
        source: row.source,
        target: row.target as PracticeTransformItem["target"],
        hint: row.hint,
        example: row.example,
      });
    } else if (row.mode === "create" && row.title && row.passage) {
      bank.create.push({ id: row.id, title: row.title, passage: row.passage });
    }
  }
  return bank;
}

/**
 * 이 사용자의 연습에 병합될 커스텀 문항 조회.
 * - 교사: 본인 문항 전부(비활성 포함 여부는 호출자가 결정)
 * - 학생: 같은 학교에서 자기 학년·반을 담당하는(또는 담당 학급이 없는) 교사들의 활성 문항
 */
export async function findCustomItemsForUser(user: {
  id: string;
  role?: string;
}): Promise<PracticeCustomRow[]> {
  if (user.role === "TEACHER" || user.role === "ADMIN") {
    return prisma.practiceCustomItem.findMany({
      where: { teacherId: user.id, isActive: true },
      orderBy: { createdAt: "asc" },
    });
  }

  const student = await prisma.user.findUnique({
    where: { id: user.id },
    select: { school: true, grade: true, className: true },
  });
  if (!student?.school) return [];

  const teachers = await prisma.user.findMany({
    where: {
      role: "TEACHER",
      school: student.school,
      OR: [
        { teacherClasses: { none: {} } },
        ...(student.grade && student.className
          ? [{ teacherClasses: { some: { grade: student.grade, className: student.className } } }]
          : []),
      ],
    },
    select: { id: true },
  });
  if (teachers.length === 0) return [];

  return prisma.practiceCustomItem.findMany({
    where: { teacherId: { in: teachers.map((t) => t.id) }, isActive: true },
    orderBy: { createdAt: "asc" },
  });
}

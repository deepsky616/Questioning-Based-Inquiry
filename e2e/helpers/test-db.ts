/**
 * e2e 전용 DB 헬퍼 — 합성 테스트 교사 계정 준비와 흔적 정리.
 * .env.local의 DATABASE_URL을 직접 읽어 Prisma를 초기화한다(플레이라이트 프로세스에는 env가 없음).
 */
import { readFileSync } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

export const TEST_TEACHER_EMAIL = "hermes.test.20260529@example.com";
export const E2E_TITLE_PREFIX = "E2E-마법사-";

function loadDatabaseUrl(): string {
  const envPath = path.resolve(__dirname, "../../.env.local");
  const content = readFileSync(envPath, "utf8");
  const line = content.split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found in .env.local");
  return line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
}

function client(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: loadDatabaseUrl() } } });
}

/** 테스트 교사 비밀번호를 이번 실행용 랜덤 값으로 설정하고 그 값을 반환한다. */
export async function prepareTestTeacher(): Promise<string> {
  const prisma = client();
  try {
    const password = `E2e!${randomBytes(9).toString("hex")}`;
    const teacher = await prisma.user.findFirst({ where: { email: TEST_TEACHER_EMAIL } });
    if (!teacher) throw new Error(`test teacher missing: ${TEST_TEACHER_EMAIL}`);
    await prisma.user.update({
      where: { id: teacher.id },
      data: { password: await bcrypt.hash(password, 12) },
    });
    return password;
  } finally {
    await prisma.$disconnect();
  }
}

/** e2e가 만든 탐구설계(제목 접두사 기준)를 삭제하고 비밀번호를 다시 랜덤화한다. */
export async function cleanupTestArtifacts(): Promise<void> {
  const prisma = client();
  try {
    const teacher = await prisma.user.findFirst({ where: { email: TEST_TEACHER_EMAIL } });
    if (!teacher) return;
    await prisma.unitDesign.deleteMany({
      where: { teacherId: teacher.id, title: { startsWith: E2E_TITLE_PREFIX } },
    });
    await prisma.user.update({
      where: { id: teacher.id },
      data: { password: await bcrypt.hash(randomBytes(24).toString("hex"), 12) },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** FK 유효성을 위해 실제 존재하는 커리큘럼 영역 id를 하나 가져온다(내용은 스텁이 대체). */
export async function getAnyCurriculumAreaId(): Promise<string> {
  const prisma = client();
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM curriculum_areas LIMIT 1`;
    if (!rows[0]) throw new Error("curriculum_areas is empty");
    return rows[0].id;
  } finally {
    await prisma.$disconnect();
  }
}

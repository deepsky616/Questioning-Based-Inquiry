import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  // 1. UserRole enum 타입 생성 (없으면)
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'TEACHER');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$
  `);
  console.log("✅ UserRole enum 타입 준비 완료");

  // 2. role 컬럼 타입을 text → UserRole enum으로 변경
  await prisma.$executeRawUnsafe(`
    ALTER TABLE users
    ALTER COLUMN role TYPE "UserRole"
    USING role::text::"UserRole"
  `);
  console.log("✅ role 컬럼 타입 변경 완료 (text → UserRole enum)");
} catch (e) {
  const msg = e.message ?? "";
  if (msg.includes("already exists") || msg.includes("cannot alter")) {
    console.log("ℹ️  이미 변경됐거나 불필요:", msg.slice(0, 100));
  } else {
    console.error("❌", msg);
    process.exit(1);
  }
} finally {
  await prisma.$disconnect();
}

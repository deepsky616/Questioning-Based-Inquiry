import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRaw`ALTER TABLE users ALTER COLUMN email DROP NOT NULL`;
  console.log("✅ email 컬럼 nullable 변경 완료");
} catch (e) {
  if (e.message?.includes("already") || e.code === "42601") {
    console.log("ℹ️  이미 nullable입니다");
  } else {
    console.error("❌", e.message);
    process.exit(1);
  }
} finally {
  await prisma.$disconnect();
}

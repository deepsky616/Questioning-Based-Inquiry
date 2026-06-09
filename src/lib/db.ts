import { PrismaClient } from "@prisma/client";
import { validateServerEnv } from "./env";

// 서버 코드가 처음 로드될 때 필수 환경변수를 검증한다 (누락 시 즉시 명확한 에러).
validateServerEnv();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
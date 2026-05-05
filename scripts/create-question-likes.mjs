import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS question_likes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(question_id, user_id)
    )
  `;

  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS idx_question_likes_question_id ON question_likes(question_id)
  `;

  console.log("question_likes 테이블 생성 완료");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

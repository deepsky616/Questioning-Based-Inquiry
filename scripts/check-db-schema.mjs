import { PrismaClient } from "@prisma/client";

const REQUIRED_TABLES = [
  "game_rooms",
  "question_game_customs",
  "question_game_visibilities",
  "question_game_orders",
];

const REQUIRED_ENUMS = [
  "UserRole",
  "PointStatus",
  "SessionTargetType",
  "AnalysisScope",
];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for database schema check.");
  process.exit(1);
}

const prisma = new PrismaClient();

async function tableExists(tableName) {
  const rows = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = ${tableName}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function enumExists(enumName) {
  const rows = await prisma.$queryRaw`
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = current_schema()
      AND t.typname = ${enumName}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function main() {
  const missingTables = [];
  for (const table of REQUIRED_TABLES) {
    if (!(await tableExists(table))) missingTables.push(table);
  }

  const missingEnums = [];
  for (const enumName of REQUIRED_ENUMS) {
    if (!(await enumExists(enumName))) missingEnums.push(enumName);
  }

  if (missingTables.length > 0 || missingEnums.length > 0) {
    console.error("Database schema is not ready.");
    if (missingTables.length > 0) console.error(`Missing tables: ${missingTables.join(", ")}`);
    if (missingEnums.length > 0) console.error(`Missing enums: ${missingEnums.join(", ")}`);
    console.error("Run npx prisma db push or your production migration process before deploying.");
    process.exit(1);
  }

  console.log("Database schema check passed.");
}

main()
  .catch((error) => {
    console.error("Database schema check failed.", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

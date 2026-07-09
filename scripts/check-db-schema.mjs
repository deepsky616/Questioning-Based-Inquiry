import { PrismaClient } from "@prisma/client";

const REQUIRED_TABLES = [
  "app_notifications",
  "game_rooms",
  "question_game_customs",
  "question_game_visibilities",
  "question_game_orders",
];

const REQUIRED_TEXT_COLUMNS = [
  ["users", "role"],
  ["point_logs", "status"],
  ["question_sessions", "target_type"],
  ["session_analyses", "scope"],
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

async function textColumnExists(tableName, columnName) {
  const rows = await prisma.$queryRaw`
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = ${tableName}
      AND column_name = ${columnName}
    LIMIT 1
  `;
  return rows[0]?.data_type === "text";
}

async function main() {
  const missingTables = [];
  for (const table of REQUIRED_TABLES) {
    if (!(await tableExists(table))) missingTables.push(table);
  }

  const invalidTextColumns = [];
  for (const [table, column] of REQUIRED_TEXT_COLUMNS) {
    if (!(await textColumnExists(table, column))) invalidTextColumns.push(`${table}.${column}`);
  }

  if (missingTables.length > 0 || invalidTextColumns.length > 0) {
    console.error("Database schema is not ready.");
    if (missingTables.length > 0) console.error(`Missing tables: ${missingTables.join(", ")}`);
    if (invalidTextColumns.length > 0) console.error(`Expected text columns: ${invalidTextColumns.join(", ")}`);
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

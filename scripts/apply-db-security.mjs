import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

import {
  DATA_API_ROLES,
  HARDENING_STATEMENTS,
  ROLLBACK_STATEMENTS,
  matchesRollbackBaseline,
  quoteIdentifier,
} from "./db-security-policy.mjs";
import { assertDatabaseSecurity, readDatabaseSecurityState } from "./check-db-security.mjs";

const ROLLBACK_CONFIRMATION = "restore-public-data-api-access";

function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    if (!existsSync(fileName)) continue;
    const lines = readFileSync(fileName, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      process.env[key] = rawValue.trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

async function getPreflightState(prisma) {
  const connectionRows = await prisma.$queryRawUnsafe(`
    SELECT current_user AS current_user_name,
           usesuper,
           usebypassrls
    FROM pg_user
    WHERE usename = current_user
  `);
  const roleRows = await prisma.$queryRawUnsafe(`
    SELECT rolname
    FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated')
    ORDER BY rolname
  `);
  const tableRows = await prisma.$queryRawUnsafe(`
    SELECT relations.relname AS table_name,
           pg_get_userbyid(relations.relowner) AS owner
    FROM pg_class relations
    JOIN pg_namespace namespaces ON namespaces.oid = relations.relnamespace
    WHERE namespaces.nspname = 'public'
      AND relations.relkind IN ('r', 'p')
    ORDER BY relations.relname
  `);
  const sequenceRows = await prisma.$queryRawUnsafe(`
    SELECT sequences.relname AS sequence_name
    FROM pg_class sequences
    JOIN pg_namespace namespaces ON namespaces.oid = sequences.relnamespace
    WHERE namespaces.nspname = 'public'
      AND sequences.relkind = 'S'
    ORDER BY sequences.relname
  `);
  const routineRows = await prisma.$queryRawUnsafe(`
    SELECT routines.oid::regprocedure::text AS routine_name
    FROM pg_proc routines
    JOIN pg_namespace namespaces ON namespaces.oid = routines.pronamespace
    WHERE namespaces.nspname = 'public'
    ORDER BY routines.oid::regprocedure::text
  `);

  const connection = connectionRows[0];
  if (connection?.current_user_name !== "postgres") {
    throw new Error("Database access hardening must run as the postgres role.");
  }

  const availableRoles = roleRows.map(({ rolname }) => rolname);
  const missingRoles = DATA_API_ROLES.filter((role) => !availableRoles.includes(role));
  if (missingRoles.length > 0) {
    throw new Error(`Required Supabase roles are missing: ${missingRoles.join(", ")}.`);
  }

  const foreignOwnedTables = tableRows.filter(({ owner }) => owner !== "postgres");
  if (foreignOwnedTables.length > 0) {
    throw new Error(
      `Public tables not owned by postgres require manual review: ${foreignOwnedTables
        .map(({ table_name: tableName }) => tableName)
        .join(", ")}.`,
    );
  }

  return {
    canBypassRls: Boolean(connection.usebypassrls || connection.usesuper),
    tableNames: tableRows.map(({ table_name: tableName }) => tableName),
    sequenceNames: sequenceRows.map(({ sequence_name: sequenceName }) => sequenceName),
    routineNames: routineRows.map(({ routine_name: routineName }) => routineName),
  };
}

async function main() {
  loadLocalEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for database access hardening.");
  }

  const rollback = process.argv.includes("--rollback");
  if (
    rollback
    && process.env.CONFIRM_DB_SECURITY_ROLLBACK !== ROLLBACK_CONFIRMATION
  ) {
    throw new Error(
      `Rollback restores public Data API access. Set CONFIRM_DB_SECURITY_ROLLBACK=${ROLLBACK_CONFIRMATION} to continue.`,
    );
  }

  const prisma = new PrismaClient();
  try {
    const preflight = await getPreflightState(prisma);
    if (rollback && !matchesRollbackBaseline(preflight)) {
      throw new Error(
        "Automatic rollback is only valid for the original public schema. Review changed objects manually.",
      );
    }
    if (!rollback && !preflight.canBypassRls) {
      throw new Error("The application database role cannot bypass row level security.");
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      await transaction.$executeRawUnsafe("SET LOCAL statement_timeout = '30s'");

      const statements = rollback ? ROLLBACK_STATEMENTS : HARDENING_STATEMENTS;
      for (const statement of statements) {
        await transaction.$executeRawUnsafe(statement);
      }

      if (!rollback) {
        for (const tableName of preflight.tableNames) {
          await transaction.$executeRawUnsafe(
            `ALTER TABLE public.${quoteIdentifier(tableName)} ENABLE ROW LEVEL SECURITY`,
          );
        }
        assertDatabaseSecurity(await readDatabaseSecurityState(transaction));
      }
    }, { maxWait: 10_000, timeout: 45_000 });

    if (!rollback) {
      console.log(`Database access hardening applied to ${preflight.tableNames.length} public tables.`);
      return;
    }

    console.log("Database access hardening rollback completed.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    if (!existsSync(fileName)) continue;
    const lines = readFileSync(fileName, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) continue;
      const value = rawValue.trim().replace(/^(['"])(.*)\1$/, "$2");
      process.env[key] = value;
    }
  }
}

const REQUIRED_TABLES = [
  "users",
  "teacher_classes",
  "password_reset_tokens",
  "question_sessions",
  "questions",
  "comments",
  "question_likes",
  "point_logs",
  "activity_award_claims",
  "game_room_settlements",
  "app_notifications",
  "game_rooms",
  "game_room_presences",
  "game_room_create_attempts",
  "game_runs",
  "game_activities",
  "question_game_customs",
  "question_game_visibilities",
  "question_game_orders",
  "curriculum_areas",
  "unit_designs",
  "translations",
  "session_analyses",
  "system_configs",
];

const REQUIRED_TEXT_COLUMNS = [
  ["users", "role"],
  ["point_logs", "status"],
  ["question_sessions", "target_type"],
  ["session_analyses", "scope"],
];

const REQUIRED_COLUMNS = [
  ["questions", "dedupe_key", "text"],
  ["comments", "dedupe_key", "text"],
  ["point_logs", "activity_dedupe_key", "text"],
  ["point_logs", "game_run_id", "text"],
  ["activity_award_claims", "student_id", "text"],
  ["activity_award_claims", "bonus_type", "text"],
  ["activity_award_claims", "activity_dedupe_key", "text"],
  ["activity_award_claims", "scope_id", "text"],
  ["activity_award_claims", "point_log_id", "text"],
  ["activity_award_claims", "created_at", "timestamp without time zone"],
  ["game_room_settlements", "game_id", "text"],
  ["game_room_settlements", "award_key", "text"],
  ["game_room_settlements", "room_code", "text"],
  ["game_room_settlements", "room_created_at", "bigint"],
  ["game_room_settlements", "play_id", "text"],
  ["game_room_settlements", "outcome", "text"],
  ["game_room_settlements", "created_at", "timestamp without time zone"],
  ["game_runs", "owner_id", "text"],
  ["game_runs", "state", "jsonb"],
  ["game_runs", "expires_at", "timestamp without time zone"],
  ["game_activities", "run_id", "text"],
  ["game_activities", "request_fingerprint", "text"],
  ["game_activities", "payload", "jsonb"],
];

export const REQUIRED_INDEXES = [
  {
    name: "uniq_student_question_content",
    tableName: "questions",
    isUnique: true,
    columns: ["session_id", "author_id", "dedupe_key"],
  },
  {
    name: "uniq_student_comment_content",
    tableName: "comments",
    isUnique: true,
    columns: ["question_id", "author_id", "dedupe_key"],
  },
  {
    name: "uniq_activity_content_award",
    tableName: "point_logs",
    isUnique: true,
    columns: ["student_id", "bonus_type", "activity_dedupe_key"],
  },
  {
    name: "activity_award_claims_pkey",
    tableName: "activity_award_claims",
    isUnique: true,
    columns: ["student_id", "bonus_type", "activity_dedupe_key"],
  },
  {
    name: "uniq_activity_award_claim_point_log",
    tableName: "activity_award_claims",
    isUnique: true,
    columns: ["point_log_id"],
  },
  {
    name: "uniq_game_run_creation_request",
    tableName: "game_runs",
    isUnique: true,
    columns: ["owner_id", "creation_request_id"],
  },
  {
    name: "game_room_settlements_pkey",
    tableName: "game_room_settlements",
    isUnique: true,
    columns: ["game_id", "award_key"],
  },
  {
    name: "uniq_game_activity_request",
    tableName: "game_activities",
    isUnique: true,
    columns: ["run_id", "request_id"],
  },
  {
    name: "uniq_game_activity_sequence",
    tableName: "game_activities",
    isUnique: true,
    columns: ["run_id", "sequence"],
  },
  {
    name: "uniq_point_per_game_run",
    tableName: "point_logs",
    isUnique: true,
    columns: ["student_id", "game_run_id", "bonus_type"],
  },
  {
    name: "game_runs_owner_id_status_expires_at_idx",
    tableName: "game_runs",
    isUnique: false,
    columns: ["owner_id", "status", "expires_at"],
  },
  {
    name: "game_runs_status_updated_at_id_idx",
    tableName: "game_runs",
    isUnique: false,
    columns: ["status", "updated_at", "id"],
  },
  {
    name: "point_logs_game_run_id_idx",
    tableName: "point_logs",
    isUnique: false,
    columns: ["game_run_id"],
  },
];

export const REQUIRED_FOREIGN_KEYS = [
  {
    name: "activity_award_claims_student_id_fkey",
    sourceTable: "activity_award_claims",
    sourceColumns: ["student_id"],
    targetTable: "users",
    targetColumns: ["id"],
    onDelete: "CASCADE",
  },
  {
    name: "game_runs_owner_id_fkey",
    sourceTable: "game_runs",
    sourceColumns: ["owner_id"],
    targetTable: "users",
    targetColumns: ["id"],
    onDelete: "SET NULL",
  },
  {
    name: "game_activities_run_id_fkey",
    sourceTable: "game_activities",
    sourceColumns: ["run_id"],
    targetTable: "game_runs",
    targetColumns: ["id"],
    onDelete: "CASCADE",
  },
  {
    name: "game_activities_actor_id_fkey",
    sourceTable: "game_activities",
    sourceColumns: ["actor_id"],
    targetTable: "users",
    targetColumns: ["id"],
    onDelete: "SET NULL",
  },
  {
    name: "point_logs_game_run_id_fkey",
    sourceTable: "point_logs",
    sourceColumns: ["game_run_id"],
    targetTable: "game_runs",
    targetColumns: ["id"],
    onDelete: "RESTRICT",
  },
];

export const REQUIRED_FUNCTIONS = [
  { name: "normalize_activity_content" },
  { name: "set_student_content_dedupe_key" },
  { name: "protect_point_question_content" },
  { name: "protect_point_comment_content" },
  { name: "enforce_question_write_contract" },
  { name: "enforce_comment_write_contract" },
];

export const REQUIRED_TRIGGERS = [
  {
    name: "set_question_dedupe_key_before_write",
    tableName: "questions",
    functionName: "set_student_content_dedupe_key",
  },
  {
    name: "set_comment_dedupe_key_before_write",
    tableName: "comments",
    functionName: "set_student_content_dedupe_key",
  },
  {
    name: "protect_point_question_content_before_update",
    tableName: "questions",
    functionName: "protect_point_question_content",
  },
  {
    name: "protect_point_comment_content_before_update",
    tableName: "comments",
    functionName: "protect_point_comment_content",
  },
  {
    name: "enforce_question_write_contract_before_write",
    tableName: "point_logs",
    functionName: "enforce_question_write_contract",
  },
  {
    name: "enforce_comment_write_contract_before_write",
    tableName: "point_logs",
    functionName: "enforce_comment_write_contract",
  },
];

export const REQUIRED_CHECK_CONSTRAINTS = [
  {
    name: "activity_award_claims_bonus_type_check",
    tableName: "activity_award_claims",
  },
  {
    name: "game_room_settlements_outcome_check",
    tableName: "game_room_settlements",
  },
];

const REQUIRED_RLS_TABLES = [
  "game_runs",
  "game_activities",
  "activity_award_claims",
  "game_room_settlements",
];

function sameColumns(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((column, index) => column === expected[index]);
}

export function indexDefinitionMatches(actual, expected) {
  return Boolean(actual)
    && actual.isValid === true
    && actual.isUnconditional === true
    && actual.usesOnlyColumns === true
    && actual.hasNoIncludedColumns === true
    && actual.tableName === expected.tableName
    && actual.isUnique === expected.isUnique
    && sameColumns(actual.columns, expected.columns);
}

export function foreignKeyDefinitionMatches(actual, expected) {
  return Boolean(actual)
    && actual.isValidated === true
    && actual.sameSchema === true
    && actual.sourceTable === expected.sourceTable
    && sameColumns(actual.sourceColumns, expected.sourceColumns)
    && actual.targetTable === expected.targetTable
    && sameColumns(actual.targetColumns, expected.targetColumns)
    && actual.onDelete === expected.onDelete;
}

export function triggerDefinitionMatches(actual, expected) {
  return Boolean(actual)
    && actual.isInternal === false
    && actual.isEnabled === true
    && actual.tableName === expected.tableName
    && actual.functionName === expected.functionName;
}

export function rlsTableAccessibleByCurrentRole(state) {
  if (!state || state.enabled !== true) return false;
  if (state.canBypassRls === true) return true;
  return state.isOwner === true && state.rlsForced !== true;
}

async function tableExists(prisma, tableName) {
  const rows = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = ${tableName}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function textColumnExists(prisma, tableName, columnName) {
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

async function columnHasType(prisma, tableName, columnName, dataType) {
  const rows = await prisma.$queryRaw`
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = ${tableName}
      AND column_name = ${columnName}
    LIMIT 1
  `;
  return rows[0]?.data_type === dataType;
}

async function readIndexDefinition(prisma, indexName) {
  const rows = await prisma.$queryRaw`
    SELECT table_relations.relname AS "tableName",
           index_metadata.indisunique AS "isUnique",
           index_metadata.indisvalid AS "isValid",
           index_metadata.indpred IS NULL AS "isUnconditional",
           index_metadata.indexprs IS NULL AS "usesOnlyColumns",
           index_metadata.indnatts = index_metadata.indnkeyatts AS "hasNoIncludedColumns",
           ARRAY(
             SELECT attributes.attname::text
             FROM unnest(index_metadata.indkey) WITH ORDINALITY
                  AS indexed_columns(attnum, ordinal_position)
             JOIN pg_attribute attributes
               ON attributes.attrelid = index_metadata.indrelid
              AND attributes.attnum = indexed_columns.attnum
             WHERE indexed_columns.ordinal_position <= index_metadata.indnkeyatts
             ORDER BY indexed_columns.ordinal_position
           ) AS columns
    FROM pg_index index_metadata
    JOIN pg_class index_relations ON index_relations.oid = index_metadata.indexrelid
    JOIN pg_class table_relations ON table_relations.oid = index_metadata.indrelid
    JOIN pg_namespace namespaces ON namespaces.oid = table_relations.relnamespace
    WHERE namespaces.nspname = current_schema()
      AND index_relations.relname = ${indexName}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function readForeignKeyDefinitions(prisma, constraintName) {
  return prisma.$queryRaw`
    SELECT source_relations.relname AS "sourceTable",
           constraints.convalidated AS "isValidated",
           target_namespaces.oid = namespaces.oid AS "sameSchema",
           ARRAY(
             SELECT attributes.attname::text
             FROM unnest(constraints.conkey) WITH ORDINALITY
                  AS source_columns(attnum, ordinal_position)
             JOIN pg_attribute attributes
               ON attributes.attrelid = constraints.conrelid
              AND attributes.attnum = source_columns.attnum
             ORDER BY source_columns.ordinal_position
           ) AS "sourceColumns",
           target_relations.relname AS "targetTable",
           ARRAY(
             SELECT attributes.attname::text
             FROM unnest(constraints.confkey) WITH ORDINALITY
                  AS target_columns(attnum, ordinal_position)
             JOIN pg_attribute attributes
               ON attributes.attrelid = constraints.confrelid
              AND attributes.attnum = target_columns.attnum
             ORDER BY target_columns.ordinal_position
           ) AS "targetColumns",
           CASE constraints.confdeltype
             WHEN 'a' THEN 'NO ACTION'
             WHEN 'r' THEN 'RESTRICT'
             WHEN 'c' THEN 'CASCADE'
             WHEN 'n' THEN 'SET NULL'
             WHEN 'd' THEN 'SET DEFAULT'
           END AS "onDelete"
    FROM pg_constraint constraints
    JOIN pg_class source_relations ON source_relations.oid = constraints.conrelid
    JOIN pg_class target_relations ON target_relations.oid = constraints.confrelid
    JOIN pg_namespace namespaces ON namespaces.oid = source_relations.relnamespace
    JOIN pg_namespace target_namespaces ON target_namespaces.oid = target_relations.relnamespace
    WHERE namespaces.nspname = current_schema()
      AND constraints.contype = 'f'
      AND constraints.conname = ${constraintName}
  `;
}

async function readRlsTableState(prisma, tableName) {
  const rows = await prisma.$queryRaw`
    SELECT relations.relrowsecurity AS enabled,
           relations.relforcerowsecurity AS "rlsForced",
           relations.relowner = roles.oid AS "isOwner",
           (roles.rolsuper OR roles.rolbypassrls) AS "canBypassRls"
    FROM pg_class relations
    JOIN pg_namespace namespaces ON namespaces.oid = relations.relnamespace
    JOIN pg_roles roles ON roles.rolname = current_user
    WHERE namespaces.nspname = current_schema()
      AND relations.relname = ${tableName}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function functionExists(prisma, functionName) {
  const rows = await prisma.$queryRaw`
    SELECT routines.oid
    FROM pg_proc routines
    JOIN pg_namespace namespaces ON namespaces.oid = routines.pronamespace
    WHERE namespaces.nspname = current_schema()
      AND routines.prokind = 'f'
      AND routines.proname = ${functionName}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function readTriggerDefinition(prisma, triggerName) {
  const rows = await prisma.$queryRaw`
    SELECT table_relations.relname AS "tableName",
           routines.proname AS "functionName",
           triggers.tgisinternal AS "isInternal",
           triggers.tgenabled <> 'D' AS "isEnabled"
    FROM pg_trigger triggers
    JOIN pg_class table_relations ON table_relations.oid = triggers.tgrelid
    JOIN pg_namespace namespaces ON namespaces.oid = table_relations.relnamespace
    JOIN pg_proc routines ON routines.oid = triggers.tgfoid
    WHERE namespaces.nspname = current_schema()
      AND triggers.tgname = ${triggerName}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function checkConstraintExists(prisma, constraintName, tableName) {
  const rows = await prisma.$queryRaw`
    SELECT constraints.oid
    FROM pg_constraint constraints
    JOIN pg_class table_relations ON table_relations.oid = constraints.conrelid
    JOIN pg_namespace namespaces ON namespaces.oid = table_relations.relnamespace
    WHERE namespaces.nspname = current_schema()
      AND constraints.contype = 'c'
      AND constraints.convalidated = true
      AND constraints.conname = ${constraintName}
      AND table_relations.relname = ${tableName}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function main() {
  loadLocalEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for database schema check.");
  }

  const prisma = new PrismaClient();
  try {
    const missingTables = [];
    for (const table of REQUIRED_TABLES) {
      if (!(await tableExists(prisma, table))) missingTables.push(table);
    }

    const invalidTextColumns = [];
    for (const [table, column] of REQUIRED_TEXT_COLUMNS) {
      if (!(await textColumnExists(prisma, table, column))) {
        invalidTextColumns.push(`${table}.${column}`);
      }
    }

    const invalidColumns = [];
    for (const [table, column, dataType] of REQUIRED_COLUMNS) {
      if (!(await columnHasType(prisma, table, column, dataType))) {
        invalidColumns.push(`${table}.${column}:${dataType}`);
      }
    }

    const invalidIndexes = [];
    for (const expected of REQUIRED_INDEXES) {
      const actual = await readIndexDefinition(prisma, expected.name);
      if (!indexDefinitionMatches(actual, expected)) invalidIndexes.push(expected.name);
    }

    const invalidForeignKeys = [];
    for (const expected of REQUIRED_FOREIGN_KEYS) {
      const actualDefinitions = await readForeignKeyDefinitions(prisma, expected.name);
      if (!actualDefinitions.some((actual) => foreignKeyDefinitionMatches(actual, expected))) {
        invalidForeignKeys.push(expected.name);
      }
    }

    const missingFunctions = [];
    for (const expected of REQUIRED_FUNCTIONS) {
      if (!(await functionExists(prisma, expected.name))) missingFunctions.push(expected.name);
    }

    const invalidTriggers = [];
    for (const expected of REQUIRED_TRIGGERS) {
      const actual = await readTriggerDefinition(prisma, expected.name);
      if (!triggerDefinitionMatches(actual, expected)) invalidTriggers.push(expected.name);
    }

    const invalidCheckConstraints = [];
    for (const expected of REQUIRED_CHECK_CONSTRAINTS) {
      if (!(await checkConstraintExists(prisma, expected.name, expected.tableName))) {
        invalidCheckConstraints.push(expected.name);
      }
    }

    const tablesWithoutRls = [];
    const inaccessibleRlsTables = [];
    for (const table of REQUIRED_RLS_TABLES) {
      const state = await readRlsTableState(prisma, table);
      if (state?.enabled !== true) tablesWithoutRls.push(table);
      if (!rlsTableAccessibleByCurrentRole(state)) inaccessibleRlsTables.push(table);
    }

    if (
      missingTables.length > 0
      || invalidTextColumns.length > 0
      || invalidColumns.length > 0
      || invalidIndexes.length > 0
      || invalidForeignKeys.length > 0
      || missingFunctions.length > 0
      || invalidTriggers.length > 0
      || invalidCheckConstraints.length > 0
      || tablesWithoutRls.length > 0
      || inaccessibleRlsTables.length > 0
    ) {
      console.error("Database schema is not ready.");
      if (missingTables.length > 0) console.error(`Missing tables: ${missingTables.join(", ")}`);
      if (invalidTextColumns.length > 0) {
        console.error(`Expected text columns: ${invalidTextColumns.join(", ")}`);
      }
      if (invalidColumns.length > 0) {
        console.error(`Missing or invalid columns: ${invalidColumns.join(", ")}`);
      }
      if (invalidIndexes.length > 0) {
        console.error(`Missing or invalid indexes: ${invalidIndexes.join(", ")}`);
      }
      if (invalidForeignKeys.length > 0) {
        console.error(`Missing or invalid foreign keys: ${invalidForeignKeys.join(", ")}`);
      }
      if (missingFunctions.length > 0) {
        console.error(`Missing functions: ${missingFunctions.join(", ")}`);
      }
      if (invalidTriggers.length > 0) {
        console.error(`Missing, disabled, or invalid triggers: ${invalidTriggers.join(", ")}`);
      }
      if (invalidCheckConstraints.length > 0) {
        console.error(`Missing or invalid check constraints: ${invalidCheckConstraints.join(", ")}`);
      }
      if (tablesWithoutRls.length > 0) {
        console.error(`Tables without row level security: ${tablesWithoutRls.join(", ")}`);
      }
      if (inaccessibleRlsTables.length > 0) {
        console.error(
          `Row security tables inaccessible to the database role: ${inaccessibleRlsTables.join(", ")}`,
        );
      }
      console.error("Apply and verify production migrations before deploying.");
      process.exitCode = 1;
      return;
    }

    console.log("Database schema check passed.");
  } finally {
    await prisma.$disconnect();
  }
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : "";

if (currentFile === invokedFile) {
  main().catch((error) => {
    console.error("Database schema check failed.", error);
    process.exitCode = 1;
  });
}

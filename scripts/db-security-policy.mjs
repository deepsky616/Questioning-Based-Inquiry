export const DATA_API_ROLES = ["anon", "authenticated"];

export const INITIAL_PUBLIC_TABLES = [
  "app_notifications",
  "comments",
  "curriculum_areas",
  "game_rooms",
  "password_reset_tokens",
  "point_logs",
  "question_game_customs",
  "question_game_orders",
  "question_game_visibilities",
  "question_likes",
  "question_sessions",
  "questions",
  "session_analyses",
  "system_configs",
  "teacher_classes",
  "translations",
  "unit_designs",
  "users",
];

export const INITIAL_RLS_DISABLED_TABLES = INITIAL_PUBLIC_TABLES.filter(
  (tableName) => !["comments", "questions", "users"].includes(tableName),
);

export const HARDENING_STATEMENTS = [
  "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated",
  "REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated",
  "REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon, authenticated",
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated",
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated",
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM PUBLIC, anon, authenticated",
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON ROUTINES FROM PUBLIC",
];

export function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function publicTablesSql(tableNames) {
  return tableNames.map((tableName) => `public.${quoteIdentifier(tableName)}`).join(", ");
}

export const ROLLBACK_STATEMENTS = [
  `GRANT ALL PRIVILEGES ON TABLE ${publicTablesSql(INITIAL_PUBLIC_TABLES)} TO anon, authenticated`,
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO anon, authenticated",
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO anon, authenticated",
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON ROUTINES TO anon, authenticated",
  "ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON ROUTINES TO PUBLIC",
  ...INITIAL_RLS_DISABLED_TABLES.map(
    (tableName) => `ALTER TABLE public.${quoteIdentifier(tableName)} DISABLE ROW LEVEL SECURITY`,
  ),
];

/**
 * @param {{ tableNames?: string[], sequenceNames?: string[], routineNames?: string[] }} state
 */
export function matchesRollbackBaseline({
  tableNames = [],
  sequenceNames = [],
  routineNames = [],
}) {
  const sortedTables = [...new Set(tableNames)].sort();
  const baselineTables = [...INITIAL_PUBLIC_TABLES].sort();

  return sortedTables.length === baselineTables.length
    && sortedTables.every((tableName, index) => tableName === baselineTables[index])
    && sequenceNames.length === 0
    && routineNames.length === 0;
}

/**
 * @param {{
 *   effectivePrivileges?: Array<{
 *     role: string,
 *     objectType: string,
 *     objectName: string,
 *     privilege: string,
 *   }>,
 *   unsafeDefaultPrivileges?: Array<{
 *     role: string,
 *     objectType: string,
 *     privilege: string,
 *     scope?: string,
 *   }>,
 *   tablesWithoutRls?: string[],
 * }} state
 */
export function findSecurityViolations({
  effectivePrivileges = [],
  unsafeDefaultPrivileges = [],
  tablesWithoutRls = [],
}) {
  return [
    ...effectivePrivileges.map(
      ({ role, objectType, objectName, privilege }) =>
        `Effective ${role} ${privilege} privilege remains on ${objectType} ${objectName}.`,
    ),
    ...unsafeDefaultPrivileges.map(
      ({ role, objectType, privilege, scope = "public" }) =>
        `Default ${role} ${privilege} privilege remains for ${scope} ${objectType} objects.`,
    ),
    ...tablesWithoutRls.map((tableName) => `Row level security is disabled on public.${tableName}.`),
  ];
}

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

import { DATA_API_ROLES, findSecurityViolations } from "./db-security-policy.mjs";

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

function mapDefaultObjectType(objectType) {
  return { r: "table", S: "sequence", f: "routine" }[objectType] ?? objectType;
}

export async function readDatabaseSecurityState(prisma) {
  const availableRoles = await prisma.$queryRawUnsafe(`
    SELECT rolname
    FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated')
    ORDER BY rolname
  `);
  const roleNames = availableRoles.map(({ rolname }) => rolname);
  const missingRoles = DATA_API_ROLES.filter((role) => !roleNames.includes(role));

  if (missingRoles.length > 0) {
    return {
      applicable: false,
      missingRoles,
      effectivePrivileges: [],
      unsafeDefaultPrivileges: [],
      tablesWithoutRls: [],
    };
  }

  const [{ version_num: versionNumber }] = await prisma.$queryRawUnsafe(
    "SELECT current_setting('server_version_num') AS version_num",
  );
  const relationPrivileges = [
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRUNCATE",
    "REFERENCES",
    "TRIGGER",
  ];
  if (Number(versionNumber) >= 170000) relationPrivileges.push("MAINTAIN");
  const relationPrivilegeValues = relationPrivileges.map((privilege) => `('${privilege}')`).join(", ");

  // Production uses a one-connection pool, so metadata queries must be serialized.
  const relations = await prisma.$queryRawUnsafe(`
        WITH api_roles AS (
          SELECT rolname AS role
          FROM pg_roles
          WHERE rolname IN ('anon', 'authenticated')
        ), relation_privileges(privilege) AS (
          VALUES ${relationPrivilegeValues}
        )
        SELECT api_roles.role,
               'table' AS "objectType",
               relations.relname AS "objectName",
               relation_privileges.privilege
        FROM api_roles
        CROSS JOIN pg_class relations
        JOIN pg_namespace namespaces ON namespaces.oid = relations.relnamespace
        CROSS JOIN relation_privileges
        WHERE namespaces.nspname = 'public'
          AND relations.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND has_table_privilege(
            api_roles.role,
            relations.oid,
            relation_privileges.privilege
          )
        ORDER BY api_roles.role, relations.relname, relation_privileges.privilege
  `);
  const sequences = await prisma.$queryRawUnsafe(`
        WITH api_roles AS (
          SELECT rolname AS role
          FROM pg_roles
          WHERE rolname IN ('anon', 'authenticated')
        ), sequence_privileges(privilege) AS (
          VALUES ('USAGE'), ('SELECT'), ('UPDATE')
        )
        SELECT api_roles.role,
               'sequence' AS "objectType",
               sequences.relname AS "objectName",
               sequence_privileges.privilege
        FROM api_roles
        CROSS JOIN pg_class sequences
        JOIN pg_namespace namespaces ON namespaces.oid = sequences.relnamespace
        CROSS JOIN sequence_privileges
        WHERE namespaces.nspname = 'public'
          AND sequences.relkind = 'S'
          AND has_sequence_privilege(
            api_roles.role,
            sequences.oid,
            sequence_privileges.privilege
          )
        ORDER BY api_roles.role, sequences.relname, sequence_privileges.privilege
  `);
  const routines = await prisma.$queryRawUnsafe(`
        WITH api_roles AS (
          SELECT rolname AS role
          FROM pg_roles
          WHERE rolname IN ('anon', 'authenticated')
        )
        SELECT api_roles.role,
               'routine' AS "objectType",
               routines.oid::regprocedure::text AS "objectName",
               'EXECUTE' AS privilege
        FROM api_roles
        CROSS JOIN pg_proc routines
        JOIN pg_namespace namespaces ON namespaces.oid = routines.pronamespace
        WHERE namespaces.nspname = 'public'
          AND has_function_privilege(api_roles.role, routines.oid, 'EXECUTE')
        ORDER BY api_roles.role, routines.oid::regprocedure::text
  `);
  const listedDefaults = await prisma.$queryRawUnsafe(`
        WITH owner_role AS (
          SELECT oid
          FROM pg_roles
          WHERE rolname = 'postgres'
        ), listed_defaults AS (
          SELECT defaults.defaclobjtype AS object_type,
                 defaults.defaclnamespace AS namespace_oid,
                 acl.grantee,
                 acl.privilege_type
          FROM pg_default_acl defaults
          JOIN owner_role ON owner_role.oid = defaults.defaclrole
          CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
          WHERE defaults.defaclnamespace IN (
            0,
            (SELECT oid FROM pg_namespace WHERE nspname = 'public')
          )
        )
        SELECT CASE WHEN listed_defaults.grantee = 0
                    THEN 'PUBLIC'
                    ELSE pg_get_userbyid(listed_defaults.grantee)
               END AS role,
               listed_defaults.object_type AS "objectTypeCode",
               listed_defaults.privilege_type AS privilege,
               CASE WHEN listed_defaults.namespace_oid = 0 THEN 'global' ELSE 'public' END AS scope
        FROM listed_defaults
        WHERE pg_get_userbyid(listed_defaults.grantee) IN ('anon', 'authenticated')
           OR listed_defaults.grantee = 0
        ORDER BY role, "objectTypeCode", privilege, scope
  `);
  const globalRoutineDefaults = await prisma.$queryRawUnsafe(`
        WITH owner_role AS (
          SELECT oid
          FROM pg_roles
          WHERE rolname = 'postgres'
        ), global_routine_acl AS (
          SELECT COALESCE(
            (
              SELECT defaults.defaclacl
              FROM pg_default_acl defaults
              CROSS JOIN owner_role
              WHERE defaults.defaclrole = owner_role.oid
                AND defaults.defaclnamespace = 0
                AND defaults.defaclobjtype = 'f'
            ),
            acldefault('f', (SELECT oid FROM owner_role))
          ) AS acl
        )
        SELECT 'PUBLIC' AS role,
               'f' AS "objectTypeCode",
               acl.privilege_type AS privilege,
               'global' AS scope
        FROM global_routine_acl
        CROSS JOIN LATERAL aclexplode(global_routine_acl.acl) acl
        WHERE acl.grantee = 0
          AND acl.privilege_type = 'EXECUTE'
  `);
  const rlsRows = await prisma.$queryRawUnsafe(`
        SELECT relations.relname AS table_name
        FROM pg_class relations
        JOIN pg_namespace namespaces ON namespaces.oid = relations.relnamespace
        WHERE namespaces.nspname = 'public'
          AND relations.relkind IN ('r', 'p')
          AND NOT relations.relrowsecurity
        ORDER BY relations.relname
  `);

  const defaultRows = [...listedDefaults, ...globalRoutineDefaults];
  const uniqueDefaults = [...new Map(
    defaultRows.map((row) => [
      [row.role, row.objectTypeCode, row.privilege, row.scope].join(":"),
      {
        role: row.role,
        objectType: mapDefaultObjectType(row.objectTypeCode),
        privilege: row.privilege,
        scope: row.scope,
      },
    ]),
  ).values()];

  return {
    applicable: true,
    missingRoles: [],
    effectivePrivileges: [...relations, ...sequences, ...routines],
    unsafeDefaultPrivileges: uniqueDefaults,
    tablesWithoutRls: rlsRows.map(({ table_name: tableName }) => tableName),
  };
}

export function assertDatabaseSecurity(state) {
  const violations = findSecurityViolations(state);
  if (violations.length === 0) return;

  throw new Error([
    "Database access security check failed.",
    ...violations.map((violation) => `- ${violation}`),
  ].join("\n"));
}

async function main() {
  loadLocalEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for database access security check.");
  }

  const prisma = new PrismaClient();
  try {
    const state = await readDatabaseSecurityState(prisma);
    if (!state.applicable) {
      console.log(`Database access security check is not applicable; missing roles: ${state.missingRoles.join(", ")}.`);
      return;
    }
    assertDatabaseSecurity(state);
    console.log("Database access security check passed.");
  } finally {
    await prisma.$disconnect();
  }
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : "";

if (currentFile === invokedFile) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

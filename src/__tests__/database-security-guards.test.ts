import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  HARDENING_STATEMENTS,
  INITIAL_PUBLIC_TABLES,
  ROLLBACK_STATEMENTS,
  findSecurityViolations,
  matchesRollbackBaseline,
} from "../../scripts/db-security-policy.mjs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts?: Record<string, string>;
};

describe("database access security guards", () => {
  it("reports effective object access, unsafe defaults, and tables without RLS", () => {
    const violations = findSecurityViolations({
      effectivePrivileges: [
        { role: "anon", objectType: "table", objectName: "users", privilege: "SELECT" },
        {
          role: "authenticated",
          objectType: "routine",
          objectName: "publish_question",
          privilege: "EXECUTE",
        },
      ],
      unsafeDefaultPrivileges: [
        { role: "anon", objectType: "table", privilege: "INSERT" },
        { role: "PUBLIC", objectType: "routine", privilege: "EXECUTE" },
      ],
      tablesWithoutRls: ["point_logs"],
    });

    expect(violations).toHaveLength(5);
    expect(violations.join("\n")).toContain("anon");
    expect(violations.join("\n")).toContain("users");
    expect(violations.join("\n")).toContain("point_logs");
  });

  it("accepts a database with no public data access and RLS on every table", () => {
    expect(findSecurityViolations({
      effectivePrivileges: [],
      unsafeDefaultPrivileges: [],
      tablesWithoutRls: [],
    })).toEqual([]);
  });

  it("revokes current and future Data API access without changing rows", () => {
    const sql = HARDENING_STATEMENTS.join("\n");
    const tableRevoke = HARDENING_STATEMENTS.find((statement) =>
      statement.startsWith("REVOKE ALL PRIVILEGES ON ALL TABLES"));
    const sequenceRevoke = HARDENING_STATEMENTS.find((statement) =>
      statement.startsWith("REVOKE ALL PRIVILEGES ON ALL SEQUENCES"));

    expect(sql).toContain("REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public");
    expect(sql).toContain("REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public");
    expect(sql).toContain("REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public");
    expect(sql).toContain("ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
    expect(tableRevoke).toContain("FROM PUBLIC, anon, authenticated");
    expect(sequenceRevoke).toContain("FROM PUBLIC, anon, authenticated");
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP)\s+(?:INTO|TABLE|FROM)?\b/i);
  });

  it("keeps an explicit rollback that requires a separate command", () => {
    const rollbackSql = ROLLBACK_STATEMENTS.join("\n");

    expect(ROLLBACK_STATEMENTS.length).toBeGreaterThan(0);
    expect(rollbackSql).toContain("GRANT ALL PRIVILEGES");
    expect(rollbackSql).toContain(
      "IN SCHEMA public GRANT EXECUTE ON ROUTINES TO anon, authenticated",
    );
    expect(rollbackSql).not.toContain(
      "IN SCHEMA public GRANT EXECUTE ON ROUTINES TO PUBLIC",
    );
    expect(packageJson.scripts?.["db:security:rollback"]).toBe(
      "node scripts/apply-db-security.mjs --rollback",
    );
  });

  it("wires apply, check, and guarded rollback scripts", () => {
    expect(existsSync("scripts/apply-db-security.mjs")).toBe(true);
    expect(existsSync("scripts/check-db-security.mjs")).toBe(true);
    expect(packageJson.scripts?.["db:security:apply"]).toBe("node scripts/apply-db-security.mjs");
    expect(packageJson.scripts?.["db:security:check"]).toBe("node scripts/check-db-security.mjs");

    const build = packageJson.scripts?.build ?? "";
    expect(build).toContain("npm run db:security:check");
    expect(build).not.toContain("db:security:apply");
    expect(build).not.toContain("db:security:rollback");
  });

  it("serializes metadata queries for the production one-connection pool", () => {
    const applyScript = readFileSync("scripts/apply-db-security.mjs", "utf8");
    const checkScript = readFileSync("scripts/check-db-security.mjs", "utf8");

    expect(applyScript).not.toContain("Promise.all");
    expect(checkScript).not.toContain("Promise.all");
  });

  it("verifies the hardening inside the transaction before commit", () => {
    const applyScript = readFileSync("scripts/apply-db-security.mjs", "utf8");

    expect(applyScript).toContain(
      "assertDatabaseSecurity(await readDatabaseSecurityState(transaction))",
    );
    expect(applyScript).not.toContain("readDatabaseSecurityState(prisma)");
  });

  it("refuses automatic rollback after the public schema changes", () => {
    const applyScript = readFileSync("scripts/apply-db-security.mjs", "utf8");
    const readme = readFileSync("README.md", "utf8");

    expect(matchesRollbackBaseline({
      tableNames: INITIAL_PUBLIC_TABLES,
      sequenceNames: [],
      routineNames: [],
    })).toBe(true);
    expect(matchesRollbackBaseline({
      tableNames: [...INITIAL_PUBLIC_TABLES, "new_table"],
      sequenceNames: [],
      routineNames: [],
    })).toBe(false);
    expect(matchesRollbackBaseline({
      tableNames: INITIAL_PUBLIC_TABLES,
      sequenceNames: ["new_sequence"],
      routineNames: [],
    })).toBe(false);
    expect(applyScript).toContain("rollback && !matchesRollbackBaseline(preflight)");
    expect(readme).toContain("refuses automatic rollback after the public schema changes");
  });

  it("checks PUBLIC default privileges inherited by Data API roles", () => {
    const checkScript = readFileSync("scripts/check-db-security.mjs", "utf8");

    expect(checkScript).toContain("OR listed_defaults.grantee = 0");
  });
});

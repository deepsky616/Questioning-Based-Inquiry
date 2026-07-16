import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("scripts/check-db-schema.mjs", "utf8");

describe("질문놀이 실행 자료베이스 배포 검사", () => {
  it("열, 고유 색인, 외래 연결, 행 단위 보안을 모두 확인한다", () => {
    expect(source).toContain("REQUIRED_COLUMNS");
    expect(source).toContain('["point_logs", "game_run_id", "text"]');
    expect(source).toContain("uniq_game_run_creation_request");
    expect(source).toContain("uniq_game_activity_request");
    expect(source).toContain("uniq_game_activity_sequence");
    expect(source).toContain("uniq_point_per_game_run");
    expect(source).toContain("game_runs_owner_id_status_expires_at_idx");
    expect(source).toContain("game_runs_status_updated_at_id_idx");
    expect(source).toContain("point_logs_game_run_id_idx");
    expect(source).toContain("isUnique");
    expect(source).toContain("columns");
    expect(source).toContain("point_logs_game_run_id_fkey");
    expect(source).toContain("game_activities_run_id_fkey");
    expect(source).toContain("sourceColumns");
    expect(source).toContain("targetColumns");
    expect(source).toContain("onDelete");
    expect(source).toContain("REQUIRED_RLS_TABLES");
    expect(source).toContain("canBypassRls");
    expect(source).toContain("isOwner");
    expect(source).toContain('"game_runs"');
    expect(source).toContain('"game_activities"');
  });

  it("색인의 표와 고유 여부 및 열 순서가 모두 맞아야 통과한다", async () => {
    const { indexDefinitionMatches, REQUIRED_INDEXES } = await import(
      "../../scripts/check-db-schema.mjs"
    );
    expect(REQUIRED_INDEXES).toContainEqual({
      name: "game_runs_status_updated_at_id_idx",
      tableName: "game_runs",
      isUnique: false,
      columns: ["status", "updated_at", "id"],
    });
    const expected = {
      tableName: "game_runs",
      isUnique: false,
      columns: ["owner_id", "status", "expires_at"],
    };
    const validIndex = {
      ...expected,
      isValid: true,
      isUnconditional: true,
      usesOnlyColumns: true,
      hasNoIncludedColumns: true,
    };

    expect(indexDefinitionMatches(validIndex, expected)).toBe(true);
    expect(indexDefinitionMatches({ ...validIndex, isValid: false }, expected)).toBe(false);
    expect(indexDefinitionMatches({ ...validIndex, isUnique: true }, expected)).toBe(false);
    expect(indexDefinitionMatches({
      ...validIndex,
      columns: ["owner_id", "expires_at", "status"],
    }, expected)).toBe(false);
    expect(indexDefinitionMatches({ ...validIndex, isUnconditional: false }, expected)).toBe(false);
    expect(indexDefinitionMatches({ ...validIndex, usesOnlyColumns: false }, expected)).toBe(false);
    expect(indexDefinitionMatches({ ...validIndex, hasNoIncludedColumns: false }, expected)).toBe(false);
  });

  it("외래 키의 양쪽 표와 열 및 삭제 동작이 모두 맞아야 통과한다", async () => {
    const { foreignKeyDefinitionMatches } = await import("../../scripts/check-db-schema.mjs");
    const expected = {
      sourceTable: "point_logs",
      sourceColumns: ["game_run_id"],
      targetTable: "game_runs",
      targetColumns: ["id"],
      onDelete: "RESTRICT",
    };
    const validForeignKey = { ...expected, isValidated: true, sameSchema: true };

    expect(foreignKeyDefinitionMatches(validForeignKey, expected)).toBe(true);
    expect(foreignKeyDefinitionMatches({ ...validForeignKey, isValidated: false }, expected)).toBe(false);
    expect(foreignKeyDefinitionMatches({
      ...validForeignKey,
      targetColumns: ["owner_id"],
    }, expected))
      .toBe(false);
    expect(foreignKeyDefinitionMatches({
      ...validForeignKey,
      onDelete: "CASCADE",
    }, expected))
      .toBe(false);
    expect(foreignKeyDefinitionMatches({ ...validForeignKey, sameSchema: false }, expected)).toBe(false);
  });

  it("행 보안 표는 현재 역할이 소유자이거나 우회 권한이 있어야 통과한다", async () => {
    const { rlsTableAccessibleByCurrentRole } = await import("../../scripts/check-db-schema.mjs");

    expect(rlsTableAccessibleByCurrentRole({
      enabled: true,
      rlsForced: false,
      isOwner: true,
      canBypassRls: false,
    })).toBe(true);
    expect(rlsTableAccessibleByCurrentRole({
      enabled: true,
      rlsForced: true,
      isOwner: true,
      canBypassRls: false,
    })).toBe(false);
    expect(rlsTableAccessibleByCurrentRole({
      enabled: true,
      rlsForced: true,
      isOwner: false,
      canBypassRls: true,
    })).toBe(true);
  });
});

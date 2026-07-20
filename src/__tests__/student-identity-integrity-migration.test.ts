import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "prisma/migrations/20260720093000_add_student_identity_integrity/migration.sql";
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const schema = readFileSync("prisma/schema.prisma", "utf8");
const schemaCheck = readFileSync("scripts/check-db-schema.mjs", "utf8");

describe("학생 계정 식별값 무결성", () => {
  it("학교·학년·반·번호 조합을 데이터베이스 고유 인덱스로 보호한다", () => {
    expect(schema).toContain(
      '@@unique([school, grade, className, studentNumber], name: "studentIdentity", map: "uniq_student_identity")',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX CONCURRENTLY "uniq_student_identity"',
    );
    expect(migration).toContain(
      'ON "users"("school", "grade", "class_name", "student_number")',
    );
  });

  it("배포 전 데이터베이스 검사에서 고유 인덱스를 필수로 확인한다", () => {
    expect(schemaCheck).toContain('name: "uniq_student_identity"');
    expect(schemaCheck).toContain(
      'columns: ["school", "grade", "class_name", "student_number"]',
    );
  });

  it("자료가 이미 정규화된 상태이므로 마이그레이션에서 학생 자료를 변경하지 않는다", () => {
    expect(migration).not.toContain('UPDATE "users"');
    expect(migration).not.toContain('DELETE FROM "users"');
  });
});

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "prisma/migrations/20260716180000_repair_comment_point_integrity/migration.sql";
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("답변 점수와 기존 장부 보정 마이그레이션", () => {
  it("기존 답변 로그는 댓글 식별값만 쓰도록 질문 식별값을 비운다", () => {
    expect(sql).toContain('UPDATE "point_logs"');
    expect(sql).toContain('SET "related_question_id" = NULL');
    expect(sql).toContain('"bonus_type" = \'COMMENT_WRITE\'');
  });

  it("이전 서버가 잠시 남아 있어도 자료베이스가 답변 지급 규칙을 강제한다", () => {
    expect(sql).toContain('CREATE FUNCTION "enforce_comment_write_contract"');
    expect(sql).toContain('CREATE TRIGGER "enforce_comment_write_contract_before_insert"');
    expect(sql).toContain('BEFORE INSERT ON "point_logs"');
    expect(sql).toContain("NEW.related_question_id := NULL");
    expect(sql).toContain("comment_author_id = question_author_id");
  });

  it("학생이 다른 작성자의 질문에 쓴 누락 답변만 소급 지급한다", () => {
    expect(sql).toContain("c.author_id <> q.author_id");
    expect(sql).toContain("ca.role = 'STUDENT'");
    expect(sql).toContain("qa.role IN ('STUDENT', 'TEACHER')");
    expect(sql).toContain('ON CONFLICT ("related_comment_id", "bonus_type") DO NOTHING');
    expect(sql).toContain('"related_question_id"');
  });

  it("실제로 삽입된 답변 로그만큼만 학생 총점을 올린다", () => {
    expect(sql).toMatch(/inserted_comment_points[\s\S]+RETURNING "student_id", "points"/);
    expect(sql).toMatch(/comment_deltas[\s\S]+SUM\("points"\)/);
    expect(sql).toMatch(/UPDATE "users" AS u[\s\S]+comment_deltas/);
  });

  it("기존 양수 차이는 별도 감사 로그로 채우고 음수 차이나 잔여 차이는 중단한다", () => {
    expect(sql).toContain("BALANCE_RECONCILIATION");
    expect(sql).toContain("RAISE EXCEPTION");
    expect(sql).toContain("ledger exceeds total_points");
    expect(sql).toContain("point ledger reconciliation did not converge");
  });

  it("전체 보정은 하나의 트랜잭션으로 실행한다", () => {
    expect(sql.trimStart()).toMatch(/^BEGIN;/);
    expect(sql.trimEnd()).toMatch(/COMMIT;$/);
  });
});

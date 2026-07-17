import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "prisma/migrations/20260716211000_close_point_integrity_races/migration.sql";
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const schema = readFileSync("prisma/schema.prisma", "utf8");
const schemaCheck = readFileSync("scripts/check-db-schema.mjs", "utf8");
const readme = readFileSync("README.md", "utf8");

describe("점수 지급 경쟁 조건 차단", () => {
  it("질문과 답변에 학생 내용 중복 키와 고유 조건을 둔다", () => {
    expect(schema).toMatch(/activityDedupeKey\s+String\?\s+@map\("activity_dedupe_key"\)/);
    expect(schema).toContain('@@unique([studentId, bonusType, activityDedupeKey], name: "uniq_activity_content_award", map: "uniq_activity_content_award")');
    expect(schema).toMatch(/dedupeKey\s+String\?\s+@map\("dedupe_key"\)/);
    expect(schema).toContain('@@unique([sessionId, authorId, dedupeKey], name: "uniq_student_question_content", map: "uniq_student_question_content")');
    expect(schema).toContain('@@unique([questionId, authorId, dedupeKey], name: "uniq_student_comment_content", map: "uniq_student_comment_content")');
    expect(schema).not.toContain("@@index([sessionId, authorId, normalizedContent])");
    expect(schema).not.toContain("@@index([questionId, authorId, normalizedContent])");
    expect(schema).not.toContain("@@index([normalizedContent])");
    expect(sql).toContain('ADD COLUMN "dedupe_key" TEXT');
    expect(sql).toContain('ADD COLUMN "activity_dedupe_key" TEXT');
    expect(sql).toContain('CREATE UNIQUE INDEX "uniq_activity_content_award"');
    expect(sql).toContain('CREATE UNIQUE INDEX "uniq_student_question_content"');
    expect(sql).toContain('CREATE UNIQUE INDEX "uniq_student_comment_content"');
    expect(sql).toContain('DROP INDEX "questions_session_id_author_id_normalized_content_idx"');
    expect(sql).toContain('DROP INDEX "questions_normalized_content_idx"');
    expect(sql).toContain('DROP INDEX "comments_question_id_author_id_normalized_content_idx"');
    expect(sql).toContain('DROP INDEX "comments_normalized_content_idx"');
  });

  it("기존 학생 자료를 보완하고 이전 서버 삽입도 중복 키로 정규화한다", () => {
    expect(sql).toContain('CREATE FUNCTION "normalize_activity_content"');
    expect(sql).toContain('public."normalize_activity_content"(NEW.content)');
    expect(sql).toContain('CREATE FUNCTION "set_student_content_dedupe_key"');
    expect(sql).toContain("NEW.dedupe_key := md5(canonical_content)");
    expect(sql).toContain('CREATE TRIGGER "set_question_dedupe_key_before_write"');
    expect(sql).toContain('CREATE TRIGGER "set_comment_dedupe_key_before_write"');
    expect(sql).toMatch(/UPDATE "questions"[\s\S]+SET "dedupe_key" = md5/);
    expect(sql).toMatch(/UPDATE "comments"[\s\S]+SET "dedupe_key" = md5/);
    expect(sql).toMatch(/regexp_replace\(\s*lower\(/);
    expect(sql).toContain("normalize(COALESCE(input_content, ''), NFKC)");
    expect(sql).toContain("'[^[:alnum:]]'");
    expect(sql).toContain(
      'UPDATE OF "author_id", "content", "normalized_content", "dedupe_key"',
    );
    expect(sql).toContain("student content requires non-empty normalized_content");
  });

  it("답변 지급 트리거가 질문을 먼저 잠그고 답변 연결을 다시 확인한다", () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION "enforce_comment_write_contract"');
    const commentContract = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION "enforce_comment_write_contract"'),
      sql.indexOf('DROP TRIGGER "enforce_comment_write_contract_before_insert"'),
    );
    const questionLock = commentContract.indexOf("FOR SHARE OF q");
    const commentLock = commentContract.indexOf("FOR SHARE OF c");
    expect(questionLock).toBeGreaterThan(-1);
    expect(commentLock).toBeGreaterThan(questionLock);
    expect(commentContract).toContain('FROM public."questions" AS q');
    expect(commentContract).toContain('FROM public."comments" AS c');
    expect(commentContract).toContain(
      "comment_question_id IS DISTINCT FROM expected_question_id",
    );
    expect(commentContract).not.toContain("FOR SHARE OF c, q");
    expect(sql).toContain("TG_OP = 'UPDATE'");
    expect(sql).toContain('BEFORE INSERT OR UPDATE ON "point_logs"');
    expect(sql).toContain(
      "NEW.activity_dedupe_key := md5(comment_question_id || E'\\x1F' || comment_normalized_content)",
    );
  });

  it("질문 지급도 원본 행 잠금과 지급 계약으로 보호한다", () => {
    expect(sql).toContain('CREATE FUNCTION "enforce_question_write_contract"');
    expect(sql).toContain("QUESTION_WRITE requires related_question_id");
    expect(sql).toContain("FOR SHARE OF q");
    expect(sql).toContain("question_session_id");
    expect(sql).toContain(
      "NEW.activity_dedupe_key := md5(question_session_id || E'\\x1F' || question_normalized_content)",
    );
    expect(sql).toContain('BEFORE INSERT OR UPDATE ON "point_logs"');
  });

  it("지급 대상 사용자 행을 번호순 갱신 잠금해 합계 갱신 교착을 막는다", () => {
    expect(sql).toMatch(
      /WHERE id IN \(comment_author_id, question_author_id\)[\s\S]+ORDER BY id[\s\S]+FOR UPDATE/,
    );
    expect(sql).toMatch(
      /WHERE id = question_author_id[\s\S]+ORDER BY id[\s\S]+FOR UPDATE/,
    );
  });

  it("수업을 닫는 순간과 경쟁해도 닫힌 뒤 질문과 답변 점수를 확정하지 않는다", () => {
    expect(sql).toContain("question_session_active");
    expect(sql).toContain('FROM public."question_sessions"');
    expect(sql).toContain("FOR SHARE");
    expect(sql).toContain("question session is inactive");
    expect(sql).toContain("answer session is inactive");
  });

  it("수업 소유 교사의 현재 역할과 학생 배정 범위를 자료베이스에서도 다시 확인한다", () => {
    const commentContract = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION "enforce_comment_write_contract"'),
      sql.indexOf('DROP TRIGGER "enforce_comment_write_contract_before_insert"'),
    );
    const questionContract = sql.slice(
      sql.indexOf('CREATE FUNCTION "enforce_question_write_contract"'),
      sql.indexOf('CREATE TRIGGER "enforce_question_write_contract_before_write"'),
    );

    for (const contract of [commentContract, questionContract]) {
      expect(contract).toContain("question_session_teacher_id");
      expect(contract).toContain("session_teacher_role <> 'TEACHER'");
      expect(contract).toContain('FROM public."teacher_classes"');
      expect(contract).toContain("question_session_target_type");
      expect(contract).toContain("question_session_target_student_ids");
      expect(contract).toContain("session teacher no longer manages the student");
    }
    expect(commentContract).toContain("comment_author_school");
    expect(commentContract).toContain("comment_author_id");
    expect(questionContract).toContain("question_author_school");
    expect(questionContract).toContain("question_author_id");
  });

  it("원본이 삭제돼도 같은 질문과 답변 내용의 재지급 지문은 장부에 남는다", () => {
    expect(sql).toMatch(/UPDATE "point_logs" AS pl[\s\S]+activity_dedupe_key[\s\S]+COMMENT_WRITE/);
    expect(sql).toMatch(/UPDATE "point_logs" AS pl[\s\S]+activity_dedupe_key[\s\S]+QUESTION_WRITE/);
    expect(sql).toContain("pl.related_comment_id = c.id");
    expect(sql).toContain("pl.related_question_id = q.id");
    expect(sql).toContain("activity award fingerprint already exists");
    expect(sql).toContain("NEW.activity_dedupe_key IS DISTINCT FROM OLD.activity_dedupe_key");
  });

  it("이전 실행본이 포인트 장부를 지워도 독립 지급 청구는 남는다", () => {
    expect(schema).toContain("model ActivityAwardClaim");
    expect(schema).toContain('@@map("activity_award_claims")');
    expect(schema).toContain(
      '@@id([studentId, bonusType, activityDedupeKey], map: "activity_award_claims_pkey")',
    );
    expect(schema).toContain(
      '@@unique([pointLogId], map: "uniq_activity_award_claim_point_log")',
    );
    expect(schema).toMatch(/scopeId\s+String\s+@map\("scope_id"\)/);
    expect(sql).toContain('CREATE TABLE "activity_award_claims"');
    expect(sql).toContain('INSERT INTO "activity_award_claims"');
    expect(sql.match(/INSERT INTO public\."activity_award_claims"/g)).toHaveLength(2);
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).not.toMatch(
      /FOREIGN KEY \("point_log_id"\)[\s\S]+REFERENCES "point_logs"/,
    );
  });

  it("질문놀이 실행별 정산 결과를 점수 장부와 별도 영수증으로 남긴다", () => {
    expect(schema).toContain("model GameRoomSettlement");
    expect(schema).toContain('@@map("game_room_settlements")');
    expect(schema).toContain(
      '@@id([gameId, awardKey], map: "game_room_settlements_pkey")',
    );
    expect(sql).toContain('CREATE TABLE "game_room_settlements"');
    expect(sql).toContain('CONSTRAINT "game_room_settlements_outcome_check"');
    expect(sql).toContain("'NO_ELIGIBLE_STUDENTS'");
    expect(sql).toMatch(
      /INSERT INTO "game_room_settlements"[\s\S]+FROM "point_logs"[\s\S]+status = 'APPROVED'/,
    );
    expect(sql).toContain('REVOKE ALL PRIVILEGES ON TABLE "game_room_settlements" FROM PUBLIC');
    expect(sql).toContain('ALTER TABLE "game_room_settlements" ENABLE ROW LEVEL SECURITY');
  });

  it("일부 승인 로그만 남은 완료 방을 지급 완료로 소급 확정하지 않는다", () => {
    expect(sql).toContain('CREATE TEMP TABLE "_incomplete_game_room_awards"');
    const incompleteAudit = sql.slice(
      sql.indexOf('CREATE TEMP TABLE "_incomplete_game_room_awards"'),
      sql.indexOf('INSERT INTO "game_room_settlements"'),
    );
    expect(incompleteAudit).toContain('FROM "game_rooms" AS gr');
    expect(incompleteAudit).toContain("jsonb_array_elements");
    expect(incompleteAudit).toContain("pointParticipants");
    expect(incompleteAudit).toContain("awardResult");
    expect(incompleteAudit).toMatch(
      /COALESCE\(\([\s\S]+\), FALSE\) AS identity_is_strict/,
    );
    expect(incompleteAudit).toContain('LEFT JOIN "users" AS participant_user');
    expect(incompleteAudit).toContain("participant_user.id IS NULL");
    expect(incompleteAudit).toContain('DELETE FROM "game_rooms" AS gr');
    const roomDelete = incompleteAudit.slice(
      incompleteAudit.indexOf('DELETE FROM "game_rooms" AS gr'),
    );
    expect(roomDelete).toMatch(
      /jsonb_array_elements\(\s*CASE[\s\S]+ELSE '\[\]'::jsonb[\s\S]+END\s*\)/,
    );

    const settlementBackfill = sql.slice(
      sql.indexOf('INSERT INTO "game_room_settlements"'),
      sql.indexOf('INSERT INTO "activity_award_claims"'),
    );
    expect(settlementBackfill).toContain(
      'NOT EXISTS (\n    SELECT 1\n    FROM "_incomplete_game_room_awards"',
    );
  });

  it("독립 지급 청구 표와 함수는 자료 경로에서 숨긴다", () => {
    expect(sql).toContain('REVOKE ALL PRIVILEGES ON TABLE "activity_award_claims" FROM PUBLIC');
    expect(sql).toContain('ALTER TABLE "activity_award_claims" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain(
      'REVOKE EXECUTE ON FUNCTION "normalize_activity_content"(text) FROM PUBLIC',
    );
    expect(sql).toContain("rolname = 'anon'");
    expect(sql).toContain("rolname = 'authenticated'");
  });

  it("이전 서버의 지급 대상 질문과 답변도 내용 변경으로 재지급할 수 없다", () => {
    expect(sql).toContain('CREATE FUNCTION "protect_point_question_content"');
    expect(sql).toContain('CREATE FUNCTION "protect_point_comment_content"');
    expect(sql).toContain("point-eligible question content is immutable");
    expect(sql).toContain("point-eligible comment content is immutable");
  });

  it("대기 또는 승인된 인공지능 보너스 근거도 결정 전후에 바꿀 수 없다", () => {
    expect(sql).toMatch(
      /related_question_id = OLD\.id[\s\S]+status IN \('PENDING', 'APPROVED'\)/,
    );
    expect(sql).toMatch(
      /related_comment_id = OLD\.id[\s\S]+status IN \('PENDING', 'APPROVED'\)/,
    );
  });

  it("근거 원문을 증명할 수 없는 기존 대기 후보를 모두 일회 거부한다", () => {
    const pendingCleanup = sql.match(
      /UPDATE "point_logs" AS pl\nSET\n  "status" = 'REJECTED'[\s\S]+?;\n\nDO \$\$/,
    )?.[0] ?? "";
    expect(pendingCleanup).toContain("pl.status = 'PENDING'");
    expect(pendingCleanup).toMatch(/SET\s+[\s\S]*"status" = 'REJECTED'/);
    expect(pendingCleanup).toContain(
      '"bonus_type" = \'MIGRATED_REJECTED_\' || pl.bonus_type',
    );
    expect(pendingCleanup).toContain("'AI_TOPIC_FIT_QUESTION'");
    expect(pendingCleanup).toContain("'AI_INSIGHTFUL_ANSWER'");
    expect(pendingCleanup).toContain("'TEACHER_ADJUSTED'");
    expect(pendingCleanup).not.toContain("pl.related_question_id");
    expect(pendingCleanup).not.toContain("pl.related_comment_id");
    expect(pendingCleanup).not.toContain("NOT EXISTS");
  });

  it("거부된 옛 후보만 보관형 종류로 옮겨 승인 장부를 보존하고 재분석 자리를 비운다", () => {
    const pendingCleanup = sql.match(
      /UPDATE "point_logs" AS pl\nSET\n  "status" = 'REJECTED'[\s\S]+?;\n\nDO \$\$/,
    )?.[0] ?? "";
    expect(pendingCleanup).toMatch(
      /"bonus_type" = 'MIGRATED_REJECTED_' \|\| pl\.bonus_type/,
    );
    expect(pendingCleanup).toMatch(
      /WHERE pl\.status = 'PENDING'\s+AND pl\.bonus_type IN/,
    );
    expect(pendingCleanup).not.toContain("pl.status = 'APPROVED'");
    expect(pendingCleanup).not.toContain("related_question_id = NULL");
    expect(pendingCleanup).not.toContain("related_comment_id = NULL");
  });

  it("이행과 장부 트리거가 질문, 답변, 수업, 교사와 학급, 학생 순서를 지킨다", () => {
    const questionTableLock = sql.indexOf('LOCK TABLE "questions"');
    const commentTableLock = sql.indexOf('LOCK TABLE "comments"');
    const gameRoomTableLock = sql.indexOf('LOCK TABLE "game_rooms"');
    const userTableLock = sql.indexOf('LOCK TABLE "users"');
    const pointTableLock = sql.indexOf('LOCK TABLE "point_logs"');
    expect(questionTableLock).toBeGreaterThan(-1);
    expect(commentTableLock).toBeGreaterThan(questionTableLock);
    expect(gameRoomTableLock).toBeGreaterThan(commentTableLock);
    expect(userTableLock).toBeGreaterThan(gameRoomTableLock);
    expect(pointTableLock).toBeGreaterThan(userTableLock);

    const commentContract = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION "enforce_comment_write_contract"'),
      sql.indexOf('DROP TRIGGER "enforce_comment_write_contract_before_insert"'),
    );
    expect(commentContract.indexOf('FROM public."question_sessions"'))
      .toBeLessThan(commentContract.indexOf('FROM public."users"'));
    expect(commentContract.indexOf('FROM public."teacher_classes"'))
      .toBeGreaterThan(commentContract.indexOf('FROM public."users"'));

    const questionContract = sql.slice(
      sql.indexOf('CREATE FUNCTION "enforce_question_write_contract"'),
      sql.indexOf('CREATE TRIGGER "enforce_question_write_contract_before_write"'),
    );
    expect(questionContract.indexOf('FROM public."question_sessions"'))
      .toBeLessThan(questionContract.indexOf('FROM public."users"'));
  });

  it("이미 지급된 원본의 작성자와 지급 범위를 바꿔 새 활동처럼 재지급할 수 없다", () => {
    expect(sql).toContain(
      'BEFORE UPDATE OF "author_id", "session_id", "source", "content", "normalized_content" ON "questions"',
    );
    expect(sql).toContain(
      'BEFORE UPDATE OF "author_id", "question_id", "content", "normalized_content" ON "comments"',
    );
    expect(sql).toMatch(
      /FROM public\."point_logs"[\s\S]+related_question_id[\s\S]+QUESTION_WRITE/,
    );
    expect(sql).toContain("pl.session_id_ref IS NOT NULL");
    expect(sql).toMatch(
      /FROM public\."point_logs"[\s\S]+related_comment_id[\s\S]+COMMENT_WRITE/,
    );
    expect(sql).toContain("awarded question identity is immutable");
    expect(sql).toContain("awarded comment identity is immutable");
  });

  it("후속 변경도 하나의 트랜잭션으로 실행한다", () => {
    expect(sql.trimStart()).toMatch(/^BEGIN;/);
    expect(sql.trimEnd()).toMatch(/COMMIT;$/);
  });

  it("배포 자료 구조 검사가 점수 무결성 객체의 드리프트를 막는다", () => {
    expect(schemaCheck).toContain('"activity_award_claims"');
    expect(schemaCheck).toContain('["questions", "dedupe_key", "text"]');
    expect(schemaCheck).toContain('["comments", "dedupe_key", "text"]');
    expect(schemaCheck).toContain('["point_logs", "activity_dedupe_key", "text"]');
    expect(schemaCheck).toContain('name: "uniq_student_question_content"');
    expect(schemaCheck).toContain('name: "uniq_student_comment_content"');
    expect(schemaCheck).toContain('name: "uniq_activity_content_award"');
    expect(schemaCheck).toContain('name: "activity_award_claims_student_id_fkey"');
    expect(schemaCheck).toContain('name: "normalize_activity_content"');
    expect(schemaCheck).toContain('name: "enforce_question_write_contract_before_write"');
    expect(schemaCheck).toContain('name: "enforce_comment_write_contract_before_write"');
    expect(schemaCheck).toContain('"game_room_settlements"');
    expect(schemaCheck).toContain('["game_room_settlements", "outcome", "text"]');
    expect(schemaCheck).toContain('name: "game_room_settlements_pkey"');
    expect(schemaCheck).toContain('name: "game_room_settlements_outcome_check"');
  });

  it("이전 실패 뒤 부분 반영이 없음을 확인하고 실패 기록을 안전하게 닫는 절차를 안내한다", () => {
    expect(readme).toContain(
      "node scripts/run-prisma-with-env.mjs migrate resolve --rolled-back 20260716211000_close_point_integrity_races",
    );
    expect(readme).toContain("Do not run the migration SQL directly");
  });
});

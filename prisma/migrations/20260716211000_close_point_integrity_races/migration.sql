BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE "questions" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "comments" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "game_rooms" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "users" IN SHARE MODE;
LOCK TABLE "point_logs" IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE "questions" ADD COLUMN "dedupe_key" TEXT;
ALTER TABLE "comments" ADD COLUMN "dedupe_key" TEXT;
ALTER TABLE "point_logs" ADD COLUMN "activity_dedupe_key" TEXT;

CREATE FUNCTION "normalize_activity_content"(input_content text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $function$
  SELECT regexp_replace(
    lower(normalize(COALESCE(input_content, ''), NFKC)),
    '[^[:alnum:]]',
    '',
    'g'
  )
$function$;

DROP INDEX "questions_session_id_author_id_normalized_content_idx";
DROP INDEX "questions_normalized_content_idx";
DROP INDEX "comments_question_id_author_id_normalized_content_idx";
DROP INDEX "comments_normalized_content_idx";

UPDATE "questions"
SET "normalized_content" = public."normalize_activity_content"("content");

UPDATE "comments"
SET "normalized_content" = public."normalize_activity_content"("content");

UPDATE "questions" AS q
SET "dedupe_key" = md5(q.normalized_content)
FROM "users" AS u
WHERE u.id = q.author_id
  AND u.role = 'STUDENT'
  AND NULLIF(q.normalized_content, '') IS NOT NULL;

UPDATE "comments" AS c
SET "dedupe_key" = md5(c.normalized_content)
FROM "users" AS u
WHERE u.id = c.author_id
  AND u.role = 'STUDENT'
  AND NULLIF(c.normalized_content, '') IS NOT NULL;

UPDATE "point_logs" AS pl
SET "activity_dedupe_key" = md5(q.session_id || E'\x1F' || q.normalized_content)
FROM "questions" AS q
WHERE pl.bonus_type = 'QUESTION_WRITE'
  AND pl.related_question_id = q.id
  AND q.session_id IS NOT NULL
  AND NULLIF(q.normalized_content, '') IS NOT NULL;

UPDATE "point_logs" AS pl
SET "activity_dedupe_key" = md5(c.question_id || E'\x1F' || c.normalized_content)
FROM "comments" AS c
WHERE pl.bonus_type = 'COMMENT_WRITE'
  AND pl.related_comment_id = c.id
  AND NULLIF(c.normalized_content, '') IS NOT NULL;

-- 이전 실행본의 대기 후보에는 분석 당시 원문 지문이 없어 현재 원문과의 일치를
-- 증명할 수 없다. 모두 닫고 새 실행본에서 다시 분석한다.
-- 승인된 과거 장부와 합계는 그대로 보존한다.
UPDATE "point_logs" AS pl
SET
  "status" = 'REJECTED',
  "bonus_type" = 'MIGRATED_REJECTED_' || pl.bonus_type,
  "decided_at" = COALESCE(pl.decided_at, CURRENT_TIMESTAMP)
WHERE pl.status = 'PENDING'
  AND pl.bonus_type IN (
    'AI_TOPIC_FIT_QUESTION',
    'AI_DEEP_QUESTION',
    'AI_APT_ANSWER',
    'AI_INSIGHTFUL_ANSWER',
    'AI_DUPLICATE_FLAGGED',
    'AI_LOW_EFFORT_FLAGGED',
    'TEACHER_ADJUSTED'
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "questions"
    WHERE dedupe_key IS NOT NULL
    GROUP BY session_id, author_id, dedupe_key
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate student question content exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "comments"
    WHERE dedupe_key IS NOT NULL
    GROUP BY question_id, author_id, dedupe_key
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate student comment content exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "point_logs"
    WHERE activity_dedupe_key IS NOT NULL
    GROUP BY student_id, bonus_type, activity_dedupe_key
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'activity award fingerprint already exists';
  END IF;
END
$$;

CREATE UNIQUE INDEX "uniq_student_question_content"
ON "questions"("session_id", "author_id", "dedupe_key");

CREATE UNIQUE INDEX "uniq_student_comment_content"
ON "comments"("question_id", "author_id", "dedupe_key");

CREATE UNIQUE INDEX "uniq_activity_content_award"
ON "point_logs"("student_id", "bonus_type", "activity_dedupe_key");

CREATE TABLE "activity_award_claims" (
  "student_id" TEXT NOT NULL,
  "bonus_type" TEXT NOT NULL,
  "activity_dedupe_key" TEXT NOT NULL,
  "scope_id" TEXT NOT NULL,
  "point_log_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_award_claims_pkey"
    PRIMARY KEY ("student_id", "bonus_type", "activity_dedupe_key"),
  CONSTRAINT "activity_award_claims_bonus_type_check"
    CHECK ("bonus_type" IN ('QUESTION_WRITE', 'COMMENT_WRITE')),
  CONSTRAINT "activity_award_claims_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uniq_activity_award_claim_point_log"
ON "activity_award_claims"("point_log_id");

CREATE TABLE "game_room_settlements" (
  "game_id" TEXT NOT NULL,
  "award_key" TEXT NOT NULL,
  "room_code" TEXT,
  "room_created_at" BIGINT,
  "play_id" TEXT,
  "outcome" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "game_room_settlements_pkey"
    PRIMARY KEY ("game_id", "award_key"),
  CONSTRAINT "game_room_settlements_outcome_check"
    CHECK ("outcome" IN ('AWARDED', 'NO_ELIGIBLE_STUDENTS'))
);

-- 이전 계정 삭제 구현은 학생 장부만 지우고 완료 방을 남길 수 있었다.
-- 그런 방의 일부 승인 로그를 지급 완료 영수증으로 소급 확정하지 않는다.
-- 완료 방에 저장된 결과와 현재 참가자 계정, 승인 장부가 모두 맞을 때만
-- 아래 영수증 보완 대상에 남긴다. 불완전 실행 식별값은 이 거래 안에서만
-- 보존하는 임시 감사 목록에 넣어 이후 보완에서 제외한다.
CREATE TEMP TABLE "_incomplete_game_room_awards" (
  "game_id" TEXT NOT NULL,
  "award_key" TEXT NOT NULL,
  "room_code" TEXT NOT NULL,
  "has_missing_account" BOOLEAN NOT NULL,
  CONSTRAINT "_incomplete_game_room_awards_pkey"
    PRIMARY KEY ("game_id", "award_key")
) ON COMMIT DROP;

WITH "completed_v2_candidates" AS (
  SELECT
    gr.code AS room_code,
    gr.data,
    NULLIF(gr.data ->> 'gameId', '') AS game_id,
    CASE
      WHEN NULLIF(gr.data ->> 'createdAt', '') IS NULL THEN NULL
      WHEN NULLIF(gr.data ->> 'playId', '') IS NULL THEN
        'room:' || gr.code || ':' || (gr.data ->> 'createdAt')
      ELSE
        'room:' || gr.code || ':' || (gr.data ->> 'createdAt') || ':' ||
          (gr.data ->> 'playId')
    END AS expected_award_key,
    CASE
      WHEN jsonb_typeof(gr.data -> 'pointParticipants') = 'array'
        THEN gr.data -> 'pointParticipants'
      ELSE '[]'::jsonb
    END AS participants,
    CASE
      WHEN jsonb_typeof(gr.data -> 'awardResult' -> 'awards') = 'array'
        THEN gr.data -> 'awardResult' -> 'awards'
      ELSE '[]'::jsonb
    END AS saved_awards,
    COALESCE((
      gr.data ->> 'code' = gr.code
      AND gr.data ->> 'gameId' IN (
        'memory',
        'story-dice',
        'dice',
        'ladder',
        'relay',
        'mystery-box',
        'kaba'
      )
      AND gr.data ->> 'pointAwardKeyVersion' = '2'
      AND gr.data ->> 'pointEvidenceVersion' = '2'
      AND gr.data -> 'gameState' ->> 'stateVersion' = '2'
      AND jsonb_typeof(gr.data -> 'createdAt') = 'number'
      AND COALESCE((gr.data ->> 'createdAt') ~ '^[0-9]+$', FALSE)
      AND COALESCE(
        (gr.data ->> 'playId') ~
          '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$',
        FALSE
      )
    ), FALSE) AS identity_is_strict
  FROM "game_rooms" AS gr
  WHERE gr.data ->> 'status' = 'ended'
    AND gr.data -> 'gameState' ->> 'phase' = 'done'
    AND gr.data -> 'gameState' ->> 'endReason' = 'completed'
    AND '2' IN (
      gr.data -> 'gameState' ->> 'stateVersion',
      gr.data ->> 'pointAwardKeyVersion',
      gr.data ->> 'pointEvidenceVersion'
    )
),
"candidate_logs" AS (
  SELECT DISTINCT
    candidate.*,
    pl.game_id AS matched_game_id,
    pl.room_code AS award_key
  FROM "completed_v2_candidates" AS candidate
  JOIN "point_logs" AS pl
    ON pl.status = 'APPROVED'
    AND pl.room_code LIKE 'room:' || candidate.room_code || ':%'
    AND (
      (
        candidate.identity_is_strict
        AND pl.game_id = candidate.game_id
        AND pl.room_code = candidate.expected_award_key
      )
      OR NOT candidate.identity_is_strict
    )
)
INSERT INTO "_incomplete_game_room_awards" (
  "game_id",
  "award_key",
  "room_code",
  "has_missing_account"
)
SELECT
  candidate.matched_game_id,
  candidate.award_key,
  candidate.room_code,
  EXISTS (
    SELECT 1
    FROM jsonb_array_elements(candidate.participants) AS participant
    LEFT JOIN "users" AS participant_user
      ON participant_user.id = participant ->> 'id'
    WHERE NULLIF(participant ->> 'id', '') IS NOT NULL
      AND participant_user.id IS NULL
  ) AS has_missing_account
FROM "candidate_logs" AS candidate
WHERE
  NOT candidate.identity_is_strict
  OR jsonb_typeof(candidate.data -> 'pointParticipants') IS DISTINCT FROM 'array'
  OR jsonb_array_length(candidate.participants) = 0
  OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(candidate.participants) AS participant
    WHERE jsonb_typeof(participant) IS DISTINCT FROM 'object'
      OR NULLIF(participant ->> 'id', '') IS NULL
      OR jsonb_typeof(participant -> 'name') IS DISTINCT FROM 'string'
      OR jsonb_typeof(participant -> 'isHost') IS DISTINCT FROM 'boolean'
      OR CASE
        WHEN jsonb_typeof(participant -> 'joinedAt') = 'number'
          THEN (participant ->> 'joinedAt')::numeric < 0
        ELSE TRUE
      END
  )
  OR (
    SELECT COUNT(*)
    FROM jsonb_array_elements(candidate.participants) AS participant
  ) <> (
    SELECT COUNT(DISTINCT participant ->> 'id')
    FROM jsonb_array_elements(candidate.participants) AS participant
  )
  OR NULLIF(candidate.data ->> 'hostId', '') IS NULL
  OR (
    SELECT COUNT(*)
    FROM jsonb_array_elements(candidate.participants) AS participant
    WHERE participant ->> 'isHost' = 'true'
      AND participant ->> 'id' = candidate.data ->> 'hostId'
  ) <> 1
  OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(candidate.participants) AS participant
    LEFT JOIN "users" AS participant_user
      ON participant_user.id = participant ->> 'id'
    WHERE participant_user.id IS NULL
      OR participant_user.role NOT IN ('STUDENT', 'TEACHER')
  )
  OR jsonb_typeof(candidate.data -> 'awardResult') IS DISTINCT FROM 'object'
  OR jsonb_typeof(candidate.data -> 'awardResult' -> 'awards') IS DISTINCT FROM 'array'
  OR jsonb_array_length(candidate.saved_awards) = 0
  OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(candidate.saved_awards) AS saved_award
    WHERE jsonb_typeof(saved_award) IS DISTINCT FROM 'object'
      OR NULLIF(saved_award ->> 'studentId', '') IS NULL
      OR NULLIF(saved_award ->> 'bonusType', '') IS NULL
      OR jsonb_typeof(saved_award -> 'points') IS DISTINCT FROM 'number'
      OR NOT COALESCE((saved_award ->> 'points') ~ '^-?[0-9]+$', FALSE)
      OR NULLIF(saved_award ->> 'reason', '') IS NULL
  )
  OR (
    SELECT COUNT(*)
    FROM jsonb_array_elements(candidate.saved_awards) AS saved_award
  ) <> (
    SELECT COUNT(DISTINCT (
      saved_award ->> 'studentId',
      saved_award ->> 'bonusType'
    ))
    FROM jsonb_array_elements(candidate.saved_awards) AS saved_award
  )
  OR (
    SELECT COUNT(*)
    FROM "point_logs" AS pl
    WHERE pl.status = 'APPROVED'
      AND pl.game_id = candidate.matched_game_id
      AND pl.room_code = candidate.award_key
  ) <> jsonb_array_length(candidate.saved_awards)
  OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(candidate.saved_awards) AS saved_award
    WHERE NOT EXISTS (
      SELECT 1
      FROM "point_logs" AS pl
      WHERE pl.status = 'APPROVED'
        AND pl.game_id = candidate.matched_game_id
        AND pl.room_code = candidate.award_key
        AND pl.student_id = saved_award ->> 'studentId'
        AND pl.bonus_type = saved_award ->> 'bonusType'
        AND pl.points::text = saved_award ->> 'points'
        AND pl.reason IS NOT DISTINCT FROM saved_award ->> 'reason'
    )
  )
  OR EXISTS (
    SELECT 1
    FROM "point_logs" AS pl
    WHERE pl.status = 'APPROVED'
      AND pl.game_id = candidate.matched_game_id
      AND pl.room_code = candidate.award_key
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(candidate.saved_awards) AS saved_award
        WHERE pl.student_id = saved_award ->> 'studentId'
          AND pl.bonus_type = saved_award ->> 'bonusType'
          AND pl.points::text = saved_award ->> 'points'
          AND pl.reason IS NOT DISTINCT FROM saved_award ->> 'reason'
      )
  )
  OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(candidate.participants) AS participant
    JOIN "users" AS participant_user
      ON participant_user.id = participant ->> 'id'
      AND participant_user.role = 'STUDENT'
    WHERE NOT EXISTS (
      SELECT 1
      FROM "point_logs" AS pl
      WHERE pl.status = 'APPROVED'
        AND pl.game_id = candidate.matched_game_id
        AND pl.room_code = candidate.award_key
        AND pl.student_id = participant_user.id
    )
  )
  OR EXISTS (
    SELECT 1
    FROM "point_logs" AS pl
    WHERE pl.status = 'APPROVED'
      AND pl.game_id = candidate.matched_game_id
      AND pl.room_code = candidate.award_key
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(candidate.participants) AS participant
        JOIN "users" AS participant_user
          ON participant_user.id = participant ->> 'id'
          AND participant_user.role = 'STUDENT'
        WHERE participant_user.id = pl.student_id
      )
  )
ON CONFLICT ("game_id", "award_key") DO UPDATE
SET
  "room_code" = EXCLUDED."room_code",
  "has_missing_account" =
    "_incomplete_game_room_awards"."has_missing_account"
    OR EXCLUDED."has_missing_account";

-- 이미 삭제된 계정 식별값이 참가자 스냅샷에 남은 완료 방은 다시 정산할 수
-- 없고 개인정보도 보존하면 안 된다. 감사 장부는 그대로 두고 임시 방만 지운다.
DELETE FROM "game_rooms" AS gr
WHERE gr.data ->> 'status' = 'ended'
  AND gr.data -> 'gameState' ->> 'phase' = 'done'
  AND gr.data -> 'gameState' ->> 'endReason' = 'completed'
  AND '2' IN (
    gr.data -> 'gameState' ->> 'stateVersion',
    gr.data ->> 'pointAwardKeyVersion',
    gr.data ->> 'pointEvidenceVersion'
  )
  AND jsonb_typeof(gr.data -> 'pointParticipants') = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(gr.data -> 'pointParticipants') = 'array'
          THEN gr.data -> 'pointParticipants'
        ELSE '[]'::jsonb
      END
    ) AS participant
    LEFT JOIN "users" AS participant_user
      ON participant_user.id = participant ->> 'id'
    WHERE NULLIF(participant ->> 'id', '') IS NOT NULL
      AND participant_user.id IS NULL
  );

INSERT INTO "game_room_settlements" (
  "game_id",
  "award_key",
  "outcome",
  "created_at"
)
SELECT
  pl.game_id,
  pl.room_code,
  'AWARDED',
  MIN(pl.created_at)
FROM "point_logs" AS pl
WHERE pl.status = 'APPROVED'
  AND pl.room_code LIKE 'room:%'
  AND NOT EXISTS (
    SELECT 1
    FROM "_incomplete_game_room_awards" AS incomplete
    WHERE incomplete.game_id = pl.game_id
      AND incomplete.award_key = pl.room_code
  )
GROUP BY pl.game_id, pl.room_code
ON CONFLICT ("game_id", "award_key") DO NOTHING;

INSERT INTO "activity_award_claims" (
  "student_id",
  "bonus_type",
  "activity_dedupe_key",
  "scope_id",
  "point_log_id",
  "created_at"
)
SELECT
  pl.student_id,
  pl.bonus_type,
  pl.activity_dedupe_key,
  CASE
    WHEN pl.bonus_type = 'QUESTION_WRITE' THEN q.session_id
    ELSE c.question_id
  END,
  pl.id,
  pl.created_at
FROM "point_logs" AS pl
LEFT JOIN "questions" AS q
  ON pl.bonus_type = 'QUESTION_WRITE'
  AND q.id = pl.related_question_id
LEFT JOIN "comments" AS c
  ON pl.bonus_type = 'COMMENT_WRITE'
  AND c.id = pl.related_comment_id
WHERE pl.bonus_type IN ('QUESTION_WRITE', 'COMMENT_WRITE')
  AND pl.activity_dedupe_key IS NOT NULL
  AND CASE
    WHEN pl.bonus_type = 'QUESTION_WRITE' THEN q.session_id
    ELSE c.question_id
  END IS NOT NULL;

CREATE FUNCTION "set_student_content_dedupe_key"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  author_role text;
  canonical_content text;
BEGIN
  canonical_content := public."normalize_activity_content"(NEW.content);
  NEW.normalized_content := canonical_content;

  SELECT role INTO author_role
  FROM public."users"
  WHERE id = NEW.author_id;

  IF author_role = 'STUDENT' THEN
    IF NULLIF(canonical_content, '') IS NULL THEN
      RAISE EXCEPTION 'student content requires non-empty normalized_content'
        USING ERRCODE = '23514';
    END IF;
    NEW.dedupe_key := md5(canonical_content);
  ELSE
    NEW.dedupe_key := NULL;
  END IF;

  RETURN NEW;
END
$function$;

CREATE TRIGGER "set_question_dedupe_key_before_write"
BEFORE INSERT OR UPDATE OF "author_id", "content", "normalized_content", "dedupe_key" ON "questions"
FOR EACH ROW
EXECUTE FUNCTION "set_student_content_dedupe_key"();

CREATE FUNCTION "protect_point_question_content"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  author_role text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."point_logs" AS pl
    WHERE pl.related_question_id = OLD.id
      AND pl.status IN ('PENDING', 'APPROVED')
  ) THEN
    IF NEW.author_id IS DISTINCT FROM OLD.author_id
      OR NEW.source IS DISTINCT FROM OLD.source
      OR NEW.content IS DISTINCT FROM OLD.content
      OR NEW.normalized_content IS DISTINCT FROM OLD.normalized_content
      OR (
        NEW.session_id IS DISTINCT FROM OLD.session_id
        AND (
          NEW.session_id IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM public."point_logs" AS pl
            WHERE pl.related_question_id = OLD.id
              AND pl.status IN ('PENDING', 'APPROVED')
              AND pl.session_id_ref IS NOT NULL
          )
        )
      )
    THEN
      RAISE EXCEPTION 'awarded question identity is immutable'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.content IS NOT DISTINCT FROM OLD.content
    AND NEW.normalized_content IS NOT DISTINCT FROM OLD.normalized_content
  THEN
    RETURN NEW;
  END IF;

  SELECT role INTO author_role
  FROM public."users"
  WHERE id = OLD.author_id;

  IF author_role = 'STUDENT'
    AND OLD.session_id IS NOT NULL
    AND OLD.source <> 'TEACHER_SHARED'
  THEN
    RAISE EXCEPTION 'point-eligible question content is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$;

CREATE TRIGGER "protect_point_question_content_before_update"
BEFORE UPDATE OF "author_id", "session_id", "source", "content", "normalized_content" ON "questions"
FOR EACH ROW
EXECUTE FUNCTION "protect_point_question_content"();

CREATE FUNCTION "protect_point_comment_content"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  comment_author_role text;
  question_author_id text;
  question_author_role text;
BEGIN
  IF NEW.author_id IS DISTINCT FROM OLD.author_id
    OR NEW.question_id IS DISTINCT FROM OLD.question_id
    OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.normalized_content IS DISTINCT FROM OLD.normalized_content
  THEN
    IF EXISTS (
      SELECT 1
      FROM public."point_logs" AS pl
      WHERE pl.related_comment_id = OLD.id
        AND pl.status IN ('PENDING', 'APPROVED')
    ) THEN
      RAISE EXCEPTION 'awarded comment identity is immutable'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.content IS NOT DISTINCT FROM OLD.content
    AND NEW.normalized_content IS NOT DISTINCT FROM OLD.normalized_content
  THEN
    RETURN NEW;
  END IF;

  SELECT ca.role, q.author_id, qa.role
  INTO comment_author_role, question_author_id, question_author_role
  FROM public."users" AS ca
  JOIN public."questions" AS q ON q.id = OLD.question_id
  JOIN public."users" AS qa ON qa.id = q.author_id
  WHERE ca.id = OLD.author_id;

  IF comment_author_role = 'STUDENT'
    AND OLD.author_id <> question_author_id
    AND question_author_role IN ('STUDENT', 'TEACHER')
  THEN
    RAISE EXCEPTION 'point-eligible comment content is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$;

CREATE TRIGGER "protect_point_comment_content_before_update"
BEFORE UPDATE OF "author_id", "question_id", "content", "normalized_content" ON "comments"
FOR EACH ROW
EXECUTE FUNCTION "protect_point_comment_content"();

CREATE TRIGGER "set_comment_dedupe_key_before_write"
BEFORE INSERT OR UPDATE OF "author_id", "content", "normalized_content", "dedupe_key" ON "comments"
FOR EACH ROW
EXECUTE FUNCTION "set_student_content_dedupe_key"();

CREATE OR REPLACE FUNCTION "enforce_comment_write_contract"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  comment_author_id text;
  comment_question_id text;
  expected_question_id text;
  comment_normalized_content text;
  question_author_id text;
  question_session_id text;
  question_session_active boolean;
  question_session_teacher_id text;
  question_session_target_type text;
  question_session_target_grade text;
  question_session_target_class_name text;
  question_session_target_student_id text;
  question_session_target_student_ids jsonb;
  comment_author_role text;
  comment_author_school text;
  comment_author_grade text;
  comment_author_class_name text;
  question_author_role text;
  session_teacher_role text;
  session_teacher_school text;
  session_teacher_manages_student boolean;
  session_targets_student boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.bonus_type = 'COMMENT_WRITE'
    OR NEW.bonus_type = 'COMMENT_WRITE'
  ) THEN
    IF NEW.student_id IS DISTINCT FROM OLD.student_id
      OR NEW.game_id IS DISTINCT FROM OLD.game_id
      OR NEW.bonus_type IS DISTINCT FROM OLD.bonus_type
      OR NEW.points IS DISTINCT FROM OLD.points
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.related_comment_id IS DISTINCT FROM OLD.related_comment_id
      OR NEW.related_question_id IS DISTINCT FROM OLD.related_question_id
      OR NEW.activity_dedupe_key IS DISTINCT FROM OLD.activity_dedupe_key
    THEN
      RAISE EXCEPTION 'COMMENT_WRITE contract fields are immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.bonus_type <> 'COMMENT_WRITE' THEN
    RETURN NEW;
  END IF;

  IF NEW.related_comment_id IS NULL THEN
    RAISE EXCEPTION 'COMMENT_WRITE requires related_comment_id'
      USING ERRCODE = '23514';
  END IF;

  SELECT c.question_id
  INTO expected_question_id
  FROM public."comments" AS c
  WHERE c.id = NEW.related_comment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMENT_WRITE references an unknown comment'
      USING ERRCODE = '23514';
  END IF;

  SELECT q.author_id, q.session_id
  INTO question_author_id, question_session_id
  FROM public."questions" AS q
  WHERE q.id = expected_question_id
  FOR SHARE OF q;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMENT_WRITE references an unknown question'
      USING ERRCODE = '23514';
  END IF;

  SELECT c.author_id, c.question_id, c.normalized_content
  INTO comment_author_id, comment_question_id, comment_normalized_content
  FROM public."comments" AS c
  WHERE c.id = NEW.related_comment_id
  FOR SHARE OF c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMENT_WRITE references an unknown comment'
      USING ERRCODE = '23514';
  END IF;

  IF comment_question_id IS DISTINCT FROM expected_question_id THEN
    RAISE EXCEPTION 'COMMENT_WRITE parent changed during point award'
      USING ERRCODE = '40001';
  END IF;

  IF question_session_id IS NOT NULL THEN
    SELECT
      qs.is_active,
      qs.teacher_id,
      qs.target_type,
      qs.target_grade,
      qs.target_class_name,
      qs.target_student_id,
      qs.target_student_ids
    INTO
      question_session_active,
      question_session_teacher_id,
      question_session_target_type,
      question_session_target_grade,
      question_session_target_class_name,
      question_session_target_student_id,
      question_session_target_student_ids
    FROM public."question_sessions" AS qs
    WHERE qs.id = question_session_id
    FOR SHARE;

    IF NOT FOUND OR question_session_active IS NOT TRUE THEN
      RAISE EXCEPTION 'answer session is inactive'
        USING ERRCODE = '23514';
    END IF;

    PERFORM 1
    FROM public."users"
    WHERE id = question_session_teacher_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'answer session teacher is unavailable'
        USING ERRCODE = '23514';
    END IF;

    PERFORM 1
    FROM public."teacher_classes"
    WHERE teacher_id = question_session_teacher_id
    ORDER BY id
    FOR SHARE;

    PERFORM 1
    FROM public."users"
    WHERE id IN (comment_author_id, question_author_id)
      AND id <> question_session_teacher_id
    ORDER BY id
    FOR UPDATE;
  ELSE
    SELECT role
    INTO question_author_role
    FROM public."users"
    WHERE id = question_author_id;

    IF question_author_role = 'TEACHER' THEN
      PERFORM 1
      FROM public."users"
      WHERE id = question_author_id
      FOR UPDATE;

      PERFORM 1
      FROM public."teacher_classes"
      WHERE teacher_id = question_author_id
      ORDER BY id
      FOR SHARE;

      PERFORM 1
      FROM public."users"
      WHERE id = comment_author_id
      FOR UPDATE;
    ELSE
      PERFORM 1
      FROM public."users"
      WHERE id IN (comment_author_id, question_author_id)
      ORDER BY id
      FOR UPDATE;
    END IF;
  END IF;

  SELECT
    ca.role,
    ca.school,
    ca.grade,
    ca.class_name,
    qa.role
  INTO
    comment_author_role,
    comment_author_school,
    comment_author_grade,
    comment_author_class_name,
    question_author_role
  FROM public."users" AS ca
  CROSS JOIN public."users" AS qa
  WHERE ca.id = comment_author_id
    AND qa.id = question_author_id;

  IF question_session_id IS NOT NULL THEN
    SELECT role, school
    INTO session_teacher_role, session_teacher_school
    FROM public."users"
    WHERE id = question_session_teacher_id;

    SELECT
      NOT EXISTS (
        SELECT 1
        FROM public."teacher_classes"
        WHERE teacher_id = question_session_teacher_id
      )
      OR EXISTS (
        SELECT 1
        FROM public."teacher_classes"
        WHERE teacher_id = question_session_teacher_id
          AND grade = comment_author_grade
          AND class_name = comment_author_class_name
      )
    INTO session_teacher_manages_student;

    SELECT CASE question_session_target_type
      WHEN 'ALL' THEN TRUE
      WHEN 'CLASS' THEN (
        (
          question_session_target_grade = comment_author_grade
          AND question_session_target_class_name = comment_author_class_name
        )
        OR COALESCE(question_session_target_student_ids, '[]'::jsonb) ? comment_author_id
      )
      WHEN 'STUDENT' THEN (
        question_session_target_student_id = comment_author_id
        OR COALESCE(question_session_target_student_ids, '[]'::jsonb) ? comment_author_id
      )
      WHEN 'CUSTOM' THEN
        COALESCE(question_session_target_student_ids, '[]'::jsonb) ? comment_author_id
      ELSE FALSE
    END
    INTO session_targets_student;

    IF session_teacher_role <> 'TEACHER'
      OR session_teacher_school IS NULL
      OR comment_author_school IS NULL
      OR session_teacher_school <> comment_author_school
      OR comment_author_grade IS NULL
      OR comment_author_class_name IS NULL
      OR session_teacher_manages_student IS NOT TRUE
      OR session_targets_student IS NOT TRUE
    THEN
      RAISE EXCEPTION 'session teacher no longer manages the student'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.student_id <> comment_author_id
    OR NEW.game_id <> 'ACTIVITY'
    OR NEW.session_id_ref IS DISTINCT FROM question_session_id
    OR comment_author_role <> 'STUDENT'
    OR question_author_role NOT IN ('STUDENT', 'TEACHER')
    OR comment_author_id = question_author_id
    OR NULLIF(comment_normalized_content, '') IS NULL
    OR NEW.points <> 1
    OR NEW.status <> 'APPROVED'
  THEN
    RAISE EXCEPTION 'COMMENT_WRITE violates the answer point policy'
      USING ERRCODE = '23514';
  END IF;

  NEW.related_question_id := NULL;
  NEW.activity_dedupe_key := md5(comment_question_id || E'\x1F' || comment_normalized_content);
  INSERT INTO public."activity_award_claims" (
    "student_id", "bonus_type", "activity_dedupe_key", "scope_id", "point_log_id"
  ) VALUES (
    NEW.student_id, NEW.bonus_type, NEW.activity_dedupe_key, comment_question_id, NEW.id
  );
  RETURN NEW;
END
$function$;

DROP TRIGGER "enforce_comment_write_contract_before_insert" ON "point_logs";

CREATE TRIGGER "enforce_comment_write_contract_before_write"
BEFORE INSERT OR UPDATE ON "point_logs"
FOR EACH ROW
EXECUTE FUNCTION "enforce_comment_write_contract"();

CREATE FUNCTION "enforce_question_write_contract"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  question_author_id text;
  question_author_role text;
  question_session_id text;
  question_session_active boolean;
  question_session_teacher_id text;
  question_session_target_type text;
  question_session_target_grade text;
  question_session_target_class_name text;
  question_session_target_student_id text;
  question_session_target_student_ids jsonb;
  question_source text;
  question_normalized_content text;
  question_author_school text;
  question_author_grade text;
  question_author_class_name text;
  session_teacher_role text;
  session_teacher_school text;
  session_teacher_manages_student boolean;
  session_targets_student boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.bonus_type = 'QUESTION_WRITE'
    OR NEW.bonus_type = 'QUESTION_WRITE'
  ) THEN
    IF NEW.student_id IS DISTINCT FROM OLD.student_id
      OR NEW.game_id IS DISTINCT FROM OLD.game_id
      OR NEW.bonus_type IS DISTINCT FROM OLD.bonus_type
      OR NEW.points IS DISTINCT FROM OLD.points
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.related_question_id IS DISTINCT FROM OLD.related_question_id
      OR NEW.related_comment_id IS DISTINCT FROM OLD.related_comment_id
      OR NEW.activity_dedupe_key IS DISTINCT FROM OLD.activity_dedupe_key
    THEN
      RAISE EXCEPTION 'QUESTION_WRITE contract fields are immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.bonus_type <> 'QUESTION_WRITE' THEN
    RETURN NEW;
  END IF;

  IF NEW.related_question_id IS NULL THEN
    RAISE EXCEPTION 'QUESTION_WRITE requires related_question_id'
      USING ERRCODE = '23514';
  END IF;

  SELECT q.author_id, q.session_id, q.source, q.normalized_content
  INTO question_author_id, question_session_id,
    question_source, question_normalized_content
  FROM public."questions" AS q
  WHERE q.id = NEW.related_question_id
  FOR SHARE OF q;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QUESTION_WRITE references an unknown question'
      USING ERRCODE = '23514';
  END IF;

  IF question_session_id IS NOT NULL THEN
    SELECT
      qs.is_active,
      qs.teacher_id,
      qs.target_type,
      qs.target_grade,
      qs.target_class_name,
      qs.target_student_id,
      qs.target_student_ids
    INTO
      question_session_active,
      question_session_teacher_id,
      question_session_target_type,
      question_session_target_grade,
      question_session_target_class_name,
      question_session_target_student_id,
      question_session_target_student_ids
    FROM public."question_sessions" AS qs
    WHERE qs.id = question_session_id
    FOR SHARE;

    IF NOT FOUND OR question_session_active IS NOT TRUE THEN
      RAISE EXCEPTION 'question session is inactive'
        USING ERRCODE = '23514';
    END IF;

    PERFORM 1
    FROM public."users"
    WHERE id = question_session_teacher_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'question session teacher is unavailable'
        USING ERRCODE = '23514';
    END IF;

    PERFORM 1
    FROM public."teacher_classes"
    WHERE teacher_id = question_session_teacher_id
    ORDER BY id
    FOR SHARE;
  END IF;

  PERFORM 1
  FROM public."users"
  WHERE id = question_author_id
    AND id IS DISTINCT FROM question_session_teacher_id
  ORDER BY id
  FOR UPDATE;

  SELECT role, school, grade, class_name
  INTO
    question_author_role,
    question_author_school,
    question_author_grade,
    question_author_class_name
  FROM public."users"
  WHERE id = question_author_id;

  IF question_session_id IS NOT NULL THEN
    SELECT role, school
    INTO session_teacher_role, session_teacher_school
    FROM public."users"
    WHERE id = question_session_teacher_id;

    SELECT
      NOT EXISTS (
        SELECT 1
        FROM public."teacher_classes"
        WHERE teacher_id = question_session_teacher_id
      )
      OR EXISTS (
        SELECT 1
        FROM public."teacher_classes"
        WHERE teacher_id = question_session_teacher_id
          AND grade = question_author_grade
          AND class_name = question_author_class_name
      )
    INTO session_teacher_manages_student;

    SELECT CASE question_session_target_type
      WHEN 'ALL' THEN TRUE
      WHEN 'CLASS' THEN (
        (
          question_session_target_grade = question_author_grade
          AND question_session_target_class_name = question_author_class_name
        )
        OR COALESCE(question_session_target_student_ids, '[]'::jsonb) ? question_author_id
      )
      WHEN 'STUDENT' THEN (
        question_session_target_student_id = question_author_id
        OR COALESCE(question_session_target_student_ids, '[]'::jsonb) ? question_author_id
      )
      WHEN 'CUSTOM' THEN
        COALESCE(question_session_target_student_ids, '[]'::jsonb) ? question_author_id
      ELSE FALSE
    END
    INTO session_targets_student;

    IF session_teacher_role <> 'TEACHER'
      OR session_teacher_school IS NULL
      OR question_author_school IS NULL
      OR session_teacher_school <> question_author_school
      OR question_author_grade IS NULL
      OR question_author_class_name IS NULL
      OR session_teacher_manages_student IS NOT TRUE
      OR session_targets_student IS NOT TRUE
    THEN
      RAISE EXCEPTION 'session teacher no longer manages the student'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.student_id <> question_author_id
    OR NEW.game_id <> 'ACTIVITY'
    OR question_author_role <> 'STUDENT'
    OR question_session_id IS NULL
    OR question_source = 'TEACHER_SHARED'
    OR NULLIF(question_normalized_content, '') IS NULL
    OR NEW.session_id_ref IS DISTINCT FROM question_session_id
    OR NEW.related_comment_id IS NOT NULL
    OR NEW.points <> 2
    OR NEW.status <> 'APPROVED'
  THEN
    RAISE EXCEPTION 'QUESTION_WRITE violates the question point policy'
      USING ERRCODE = '23514';
  END IF;

  NEW.activity_dedupe_key := md5(question_session_id || E'\x1F' || question_normalized_content);
  INSERT INTO public."activity_award_claims" (
    "student_id", "bonus_type", "activity_dedupe_key", "scope_id", "point_log_id"
  ) VALUES (
    NEW.student_id, NEW.bonus_type, NEW.activity_dedupe_key, question_session_id, NEW.id
  );
  RETURN NEW;
END
$function$;

CREATE TRIGGER "enforce_question_write_contract_before_write"
BEFORE INSERT OR UPDATE ON "point_logs"
FOR EACH ROW
EXECUTE FUNCTION "enforce_question_write_contract"();

REVOKE ALL PRIVILEGES ON TABLE "activity_award_claims" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "game_room_settlements" FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "normalize_activity_content"(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "set_student_content_dedupe_key"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "protect_point_question_content"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "protect_point_comment_content"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "enforce_comment_write_contract"() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "enforce_question_write_contract"() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "activity_award_claims" FROM anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "game_room_settlements" FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION "normalize_activity_content"(text) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION "set_student_content_dedupe_key"() FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION "protect_point_question_content"() FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION "protect_point_comment_content"() FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION "enforce_comment_write_contract"() FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION "enforce_question_write_contract"() FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "activity_award_claims" FROM authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "game_room_settlements" FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION "normalize_activity_content"(text) FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION "set_student_content_dedupe_key"() FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION "protect_point_question_content"() FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION "protect_point_comment_content"() FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION "enforce_comment_write_contract"() FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION "enforce_question_write_contract"() FROM authenticated';
  END IF;
END
$$;

ALTER TABLE "activity_award_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "game_room_settlements" ENABLE ROW LEVEL SECURITY;

COMMIT;

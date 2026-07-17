BEGIN;

-- Keep the repair snapshot stable while the point ledger and balances are aligned.
LOCK TABLE "comments" IN SHARE MODE;
LOCK TABLE "questions" IN SHARE MODE;
LOCK TABLE "users" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "point_logs" IN SHARE ROW EXCLUSIVE MODE;

-- Keep the contract safe during a rolling deployment while an older app process
-- may still send related_question_id for COMMENT_WRITE rows.
CREATE FUNCTION "enforce_comment_write_contract"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  comment_author_id text;
  question_author_id text;
  comment_author_role text;
  question_author_role text;
BEGIN
  IF NEW.bonus_type <> 'COMMENT_WRITE' THEN
    RETURN NEW;
  END IF;

  IF NEW.related_comment_id IS NULL THEN
    RAISE EXCEPTION 'COMMENT_WRITE requires related_comment_id'
      USING ERRCODE = '23514';
  END IF;

  SELECT c.author_id, q.author_id, ca.role, qa.role
  INTO comment_author_id, question_author_id, comment_author_role, question_author_role
  FROM public."comments" AS c
  JOIN public."users" AS ca ON ca.id = c.author_id
  JOIN public."questions" AS q ON q.id = c.question_id
  JOIN public."users" AS qa ON qa.id = q.author_id
  WHERE c.id = NEW.related_comment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMMENT_WRITE references an unknown comment'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.student_id <> comment_author_id
    OR comment_author_role <> 'STUDENT'
    OR question_author_role NOT IN ('STUDENT', 'TEACHER')
    OR comment_author_id = question_author_id
    OR NEW.points <> 1
    OR NEW.status <> 'APPROVED'
  THEN
    RAISE EXCEPTION 'COMMENT_WRITE violates the answer point policy'
      USING ERRCODE = '23514';
  END IF;

  NEW.related_question_id := NULL;
  RETURN NEW;
END
$function$;

CREATE TRIGGER "enforce_comment_write_contract_before_insert"
BEFORE INSERT ON "point_logs"
FOR EACH ROW
EXECUTE FUNCTION "enforce_comment_write_contract"();

-- Refuse to normalize rows whose ownership or approved value is inconsistent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "point_logs" AS pl
    JOIN "comments" AS c ON c.id = pl.related_comment_id
    WHERE pl.bonus_type = 'COMMENT_WRITE'
      AND (
        pl.student_id <> c.author_id
        OR pl.points <> 1
        OR pl.status <> 'APPROVED'
        OR (
          pl.related_question_id IS NOT NULL
          AND pl.related_question_id <> c.question_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'invalid existing COMMENT_WRITE point log';
  END IF;
END
$$;

-- COMMENT_WRITE is idempotent per comment, not per question.
UPDATE "point_logs"
SET "related_question_id" = NULL
WHERE "bonus_type" = 'COMMENT_WRITE'
  AND "related_comment_id" IS NOT NULL;

-- Backfill one point for every current student answer to another author.
-- Only rows returned by the insert are added to users.total_points.
WITH eligible_comment_points AS (
  SELECT
    c.id AS comment_id,
    c.author_id AS student_id,
    q.session_id,
    c.created_at
  FROM "comments" AS c
  JOIN "users" AS ca ON ca.id = c.author_id
  JOIN "questions" AS q ON q.id = c.question_id
  JOIN "users" AS qa ON qa.id = q.author_id
  WHERE ca.role = 'STUDENT'
    AND qa.role IN ('STUDENT', 'TEACHER')
    AND c.author_id <> q.author_id
    AND NOT EXISTS (
      SELECT 1
      FROM "point_logs" AS existing
      WHERE existing.related_comment_id = c.id
        AND existing.bonus_type = 'COMMENT_WRITE'
    )
), inserted_comment_points AS (
  INSERT INTO "point_logs" (
    "id",
    "student_id",
    "game_id",
    "bonus_type",
    "points",
    "reason",
    "status",
    "session_id_ref",
    "related_question_id",
    "related_comment_id",
    "created_at"
  )
  SELECT
    'backfill-comment-write-' || md5(comment_id),
    student_id,
    'ACTIVITY',
    'COMMENT_WRITE',
    1,
    '친구 질문에 답변 작성',
    'APPROVED',
    session_id,
    NULL,
    comment_id,
    created_at
  FROM eligible_comment_points
  ON CONFLICT ("related_comment_id", "bonus_type") DO NOTHING
  RETURNING "student_id", "points"
), comment_deltas AS (
  SELECT "student_id", SUM("points")::integer AS points
  FROM inserted_comment_points
  GROUP BY "student_id"
)
UPDATE "users" AS u
SET
  "total_points" = u.total_points + comment_deltas.points,
  "updated_at" = CURRENT_TIMESTAMP
FROM comment_deltas
WHERE u.id = comment_deltas.student_id;

-- A negative gap cannot be repaired without reducing a student's visible total.
-- Stop instead of guessing which approved row is wrong.
DO $$
BEGIN
  IF EXISTS (
    WITH approved_totals AS (
      SELECT
        u.id,
        u.total_points,
        COALESCE(SUM(pl.points) FILTER (WHERE pl.status = 'APPROVED'), 0)::integer AS ledger_points
      FROM "users" AS u
      LEFT JOIN "point_logs" AS pl ON pl.student_id = u.id
      WHERE u.role = 'STUDENT'
      GROUP BY u.id, u.total_points
    )
    SELECT 1
    FROM approved_totals
    WHERE ledger_points > total_points
  ) THEN
    RAISE EXCEPTION 'ledger exceeds total_points';
  END IF;
END
$$;

-- Historical deletions removed some logs without changing users.total_points.
-- Preserve the visible totals and restore auditability with one explicit row per student.
WITH ledger_balances AS (
  SELECT
    u.id AS student_id,
    u.total_points,
    COALESCE(SUM(pl.points) FILTER (WHERE pl.status = 'APPROVED'), 0)::integer AS ledger_points
  FROM "users" AS u
  LEFT JOIN "point_logs" AS pl ON pl.student_id = u.id
  WHERE u.role = 'STUDENT'
  GROUP BY u.id, u.total_points
)
INSERT INTO "point_logs" (
  "id",
  "student_id",
  "game_id",
  "room_code",
  "bonus_type",
  "points",
  "reason",
  "status",
  "created_at"
)
SELECT
  'reconcile-ledger-' || md5(student_id || ':20260716'),
  student_id,
  'MIGRATION',
  '20260716-point-ledger',
  'BALANCE_RECONCILIATION',
  total_points - ledger_points,
  '기존 점수 장부 보정',
  'APPROVED',
  CURRENT_TIMESTAMP
FROM ledger_balances
WHERE total_points > ledger_points
ON CONFLICT ("student_id", "game_id", "room_code", "bonus_type") DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    WITH approved_totals AS (
      SELECT
        u.id,
        u.total_points,
        COALESCE(SUM(pl.points) FILTER (WHERE pl.status = 'APPROVED'), 0)::integer AS ledger_points
      FROM "users" AS u
      LEFT JOIN "point_logs" AS pl ON pl.student_id = u.id
      WHERE u.role = 'STUDENT'
      GROUP BY u.id, u.total_points
    )
    SELECT 1
    FROM approved_totals
    WHERE ledger_points <> total_points
  ) THEN
    RAISE EXCEPTION 'point ledger reconciliation did not converge';
  END IF;
END
$$;

COMMIT;

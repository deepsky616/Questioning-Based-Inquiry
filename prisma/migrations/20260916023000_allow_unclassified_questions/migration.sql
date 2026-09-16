-- 의미 없는 과거 입력을 검토용으로 보존하되 정상 질문 유형으로 세지 않는다.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE "questions"
  DROP CONSTRAINT IF EXISTS "questions_closure_check",
  DROP CONSTRAINT IF EXISTS "questions_cognitive_check",
  ADD CONSTRAINT "questions_closure_check"
    CHECK ("closure" IN ('closed', 'open', 'unclassified')) NOT VALID,
  ADD CONSTRAINT "questions_cognitive_check"
    CHECK ("cognitive" IN ('factual', 'conceptual', 'controversial', 'unclassified')) NOT VALID,
  ADD CONSTRAINT "questions_unclassified_pair_check"
    CHECK (
      ("closure" <> 'unclassified' AND "cognitive" <> 'unclassified') OR
      ("closure" = 'unclassified' AND "cognitive" = 'unclassified'
        AND "closure_score" IS NULL AND "cognitive_score" IS NULL AND "inquiry_type" IS NULL)
    ) NOT VALID;

ALTER TABLE "questions" VALIDATE CONSTRAINT "questions_closure_check";
ALTER TABLE "questions" VALIDATE CONSTRAINT "questions_cognitive_check";
ALTER TABLE "questions" VALIDATE CONSTRAINT "questions_unclassified_pair_check";
COMMIT;

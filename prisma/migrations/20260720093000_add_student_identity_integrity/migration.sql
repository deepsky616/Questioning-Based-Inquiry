-- Student login identity must remain unique even when registrations race.
-- Existing production data was checked for missing, untrimmed, and duplicate
-- identity values before this migration was created.
CREATE UNIQUE INDEX CONCURRENTLY "uniq_student_identity"
ON "users"("school", "grade", "class_name", "student_number");

-- Drop existing tables
DROP TABLE IF EXISTS "comments" CASCADE;
DROP TABLE IF EXISTS "questions" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

-- Create users table
CREATE TABLE users (
    id TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('STUDENT', 'TEACHER')),
    grade TEXT,
    class_name TEXT,
    student_number TEXT,
    school TEXT,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL,
    PRIMARY KEY (id)
);

-- Create questions table
CREATE TABLE questions (
    id TEXT NOT NULL,
    content TEXT NOT NULL,
    closure TEXT NOT NULL CHECK (closure IN ('closed', 'open')),
    cognitive TEXT NOT NULL CHECK (cognitive IN ('factual', 'conceptual', 'controversial')),
    closure_score DOUBLE PRECISION CHECK (closure_score IS NULL OR (closure_score >= 0 AND closure_score <= 1)),
    cognitive_score DOUBLE PRECISION CHECK (cognitive_score IS NULL OR (cognitive_score >= 0 AND cognitive_score <= 1)),
    context TEXT,
    author_id TEXT NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL,
    PRIMARY KEY (id)
);

-- Create comments table
CREATE TABLE comments (
    id TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

-- Create indexes
CREATE INDEX users_email_key ON users(email);
CREATE INDEX questions_author_id_key ON questions(author_id);
CREATE INDEX comments_question_id_key ON comments(question_id);

-- Create foreign keys
ALTER TABLE questions ADD CONSTRAINT questions_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE comments ADD CONSTRAINT comments_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE comments ADD CONSTRAINT comments_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────
-- 학생 포인트 시스템 (멀티 질문놀이 활동 보상)
-- ─────────────────────────────────────────────────────────

-- User에 누적 포인트 컬럼
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS total_points INTEGER NOT NULL DEFAULT 0;

-- 포인트 획득 이력
CREATE TABLE IF NOT EXISTS point_logs (
    id              TEXT NOT NULL,
    student_id      TEXT NOT NULL,
    game_id         TEXT NOT NULL,
    room_code       TEXT,
    bonus_type      TEXT NOT NULL,
    points          INTEGER NOT NULL,
    reason          TEXT NOT NULL DEFAULT '',
    awarded_by_id   TEXT,
    created_at      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

-- 중복 지급 방지 (같은 방·게임·상 조합은 학생당 1회)
CREATE UNIQUE INDEX IF NOT EXISTS point_logs_uniq_award
    ON point_logs(student_id, game_id, room_code, bonus_type);

CREATE INDEX IF NOT EXISTS point_logs_student_created_idx
    ON point_logs(student_id, created_at);

CREATE INDEX IF NOT EXISTS point_logs_game_created_idx
    ON point_logs(game_id, created_at);

ALTER TABLE point_logs ADD CONSTRAINT point_logs_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE point_logs ADD CONSTRAINT point_logs_awarded_by_id_fkey
    FOREIGN KEY (awarded_by_id) REFERENCES users(id) ON DELETE SET NULL;

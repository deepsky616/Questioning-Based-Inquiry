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
    closure TEXT NOT NULL,
    cognitive TEXT NOT NULL,
    closure_score DOUBLE PRECISION,
    cognitive_score DOUBLE PRECISION,
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
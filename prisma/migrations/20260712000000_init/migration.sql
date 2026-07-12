-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "grade" TEXT,
    "class_name" TEXT,
    "student_number" TEXT,
    "school" TEXT,
    "ai_api_key" TEXT,
    "ai_model" TEXT,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_logs" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "room_code" TEXT,
    "bonus_type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "session_id_ref" TEXT,
    "related_question_id" TEXT,
    "related_comment_id" TEXT,
    "ai_analysis" TEXT,
    "awarded_by_id" TEXT,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_notifications" (
    "id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "sender_id" TEXT,
    "session_id" TEXT,
    "type" TEXT NOT NULL DEFAULT 'SESSION_REMINDER',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "href" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_classes" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "class_name" TEXT NOT NULL,

    CONSTRAINT "teacher_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_sessions" (
    "id" TEXT NOT NULL,
    "session_date" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "target_type" TEXT NOT NULL DEFAULT 'ALL',
    "target_grade" TEXT,
    "target_class_name" TEXT,
    "target_student_id" TEXT,
    "target_student_ids" JSONB NOT NULL DEFAULT '[]',
    "teacher_id" TEXT NOT NULL,
    "unit_design_id" TEXT,
    "shared_questions" JSONB NOT NULL DEFAULT '[]',
    "default_question_public" BOOLEAN NOT NULL DEFAULT true,
    "likes_visible_to_peers" BOOLEAN NOT NULL DEFAULT true,
    "comments_visible_to_peers" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "normalized_content" TEXT NOT NULL DEFAULT '',
    "closure" TEXT NOT NULL,
    "cognitive" TEXT NOT NULL,
    "closure_score" DOUBLE PRECISION,
    "cognitive_score" DOUBLE PRECISION,
    "context" TEXT,
    "source" TEXT NOT NULL DEFAULT 'STUDENT',
    "inquiry_type" TEXT,
    "session_id" TEXT,
    "author_id" TEXT NOT NULL,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flag_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "normalized_content" TEXT NOT NULL DEFAULT '',
    "author_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flag_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL,
    "config_key" TEXT NOT NULL,
    "config_value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_rooms" (
    "code" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_rooms_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "question_game_customs" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "gradient_css" TEXT NOT NULL,
    "accent_color" TEXT NOT NULL DEFAULT '#6366f1',
    "player_count" TEXT NOT NULL DEFAULT '제한없음',
    "duration" TEXT NOT NULL DEFAULT '20분',
    "instructions" JSONB NOT NULL DEFAULT '[]',
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_game_customs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_game_visibilities" (
    "teacher_id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "visibility" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_game_visibilities_pkey" PRIMARY KEY ("teacher_id","game_id")
);

-- CreateTable
CREATE TABLE "question_game_orders" (
    "teacher_id" TEXT NOT NULL,
    "game_ids" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_game_orders_pkey" PRIMARY KEY ("teacher_id")
);

-- CreateTable
CREATE TABLE "curriculum_areas" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "grade_range" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "core_idea" TEXT NOT NULL,
    "knowledge_items" JSONB NOT NULL,
    "process_items" JSONB NOT NULL,
    "value_items" JSONB NOT NULL,
    "middle_knowledge_items" JSONB,
    "middle_process_items" JSONB,
    "middle_value_items" JSONB,
    "achievements" JSONB NOT NULL,
    "units" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "curriculum_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_designs" (
    "id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "curriculum_area_id" TEXT,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "grade_range" TEXT NOT NULL,
    "grade" TEXT,
    "session_date" TEXT,
    "area" TEXT NOT NULL,
    "core_idea" TEXT NOT NULL,
    "selected_keywords" JSONB NOT NULL,
    "core_sentences" JSONB NOT NULL,
    "essential_questions" JSONB NOT NULL,
    "inquiry_questions" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "default_question_public" BOOLEAN NOT NULL DEFAULT true,
    "likes_visible_to_peers" BOOLEAN NOT NULL DEFAULT true,
    "comments_visible_to_peers" BOOLEAN NOT NULL DEFAULT true,
    "target_class_value" TEXT NOT NULL DEFAULT 'all',
    "target_student_ids" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_designs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_likes" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "translations" (
    "id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "target_locale" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_analyses" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "student_id" TEXT NOT NULL DEFAULT '',
    "result" JSONB NOT NULL,
    "locale" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_grade_class_name_idx" ON "users"("role", "grade", "class_name");

-- CreateIndex
CREATE INDEX "users_role_school_grade_class_name_idx" ON "users"("role", "school", "grade", "class_name");

-- CreateIndex
CREATE INDEX "users_role_total_points_idx" ON "users"("role", "total_points");

-- CreateIndex
CREATE INDEX "users_role_school_total_points_idx" ON "users"("role", "school", "total_points");

-- CreateIndex
CREATE INDEX "point_logs_student_id_created_at_idx" ON "point_logs"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "point_logs_game_id_created_at_idx" ON "point_logs"("game_id", "created_at");

-- CreateIndex
CREATE INDEX "point_logs_status_idx" ON "point_logs"("status");

-- CreateIndex
CREATE INDEX "point_logs_session_id_ref_idx" ON "point_logs"("session_id_ref");

-- CreateIndex
CREATE UNIQUE INDEX "point_logs_student_id_game_id_room_code_bonus_type_key" ON "point_logs"("student_id", "game_id", "room_code", "bonus_type");

-- CreateIndex
CREATE UNIQUE INDEX "point_logs_related_question_id_bonus_type_key" ON "point_logs"("related_question_id", "bonus_type");

-- CreateIndex
CREATE UNIQUE INDEX "point_logs_related_comment_id_bonus_type_key" ON "point_logs"("related_comment_id", "bonus_type");

-- CreateIndex
CREATE INDEX "app_notifications_recipient_id_read_at_created_at_idx" ON "app_notifications"("recipient_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "app_notifications_sender_id_idx" ON "app_notifications"("sender_id");

-- CreateIndex
CREATE INDEX "app_notifications_session_id_idx" ON "app_notifications"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_notifications_recipient_id_sender_id_session_id_type_key" ON "app_notifications"("recipient_id", "sender_id", "session_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_classes_teacher_id_grade_class_name_key" ON "teacher_classes"("teacher_id", "grade", "class_name");

-- CreateIndex
CREATE INDEX "question_sessions_teacher_id_created_at_idx" ON "question_sessions"("teacher_id", "created_at");

-- CreateIndex
CREATE INDEX "question_sessions_target_type_target_grade_target_class_nam_idx" ON "question_sessions"("target_type", "target_grade", "target_class_name");

-- CreateIndex
CREATE INDEX "questions_session_id_author_id_normalized_content_idx" ON "questions"("session_id", "author_id", "normalized_content");

-- CreateIndex
CREATE INDEX "questions_author_id_created_at_idx" ON "questions"("author_id", "created_at");

-- CreateIndex
CREATE INDEX "questions_session_id_source_idx" ON "questions"("session_id", "source");

-- CreateIndex
CREATE INDEX "questions_session_id_created_at_idx" ON "questions"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "questions_normalized_content_idx" ON "questions"("normalized_content");

-- CreateIndex
CREATE INDEX "comments_question_id_author_id_normalized_content_idx" ON "comments"("question_id", "author_id", "normalized_content");

-- CreateIndex
CREATE INDEX "comments_author_id_created_at_idx" ON "comments"("author_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_normalized_content_idx" ON "comments"("normalized_content");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_config_key_key" ON "system_configs"("config_key");

-- CreateIndex
CREATE INDEX "game_rooms_updated_at_idx" ON "game_rooms"("updated_at");

-- CreateIndex
CREATE INDEX "question_game_customs_teacher_id_sort_order_idx" ON "question_game_customs"("teacher_id", "sort_order");

-- CreateIndex
CREATE INDEX "question_game_visibilities_teacher_id_idx" ON "question_game_visibilities"("teacher_id");

-- CreateIndex
CREATE INDEX "curriculum_areas_subject_grade_range_idx" ON "curriculum_areas"("subject", "grade_range");

-- CreateIndex
CREATE INDEX "question_likes_question_id_idx" ON "question_likes"("question_id");

-- CreateIndex
CREATE INDEX "question_likes_user_id_created_at_idx" ON "question_likes"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "question_likes_question_id_user_id_key" ON "question_likes"("question_id", "user_id");

-- CreateIndex
CREATE INDEX "translations_source_type_source_id_idx" ON "translations"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "translations_source_type_source_id_target_locale_key" ON "translations"("source_type", "source_id", "target_locale");

-- CreateIndex
CREATE INDEX "session_analyses_session_id_idx" ON "session_analyses"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_analyses_session_id_scope_student_id_key" ON "session_analyses"("session_id", "scope", "student_id");

-- AddForeignKey
ALTER TABLE "point_logs" ADD CONSTRAINT "point_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_logs" ADD CONSTRAINT "point_logs_awarded_by_id_fkey" FOREIGN KEY ("awarded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_classes" ADD CONSTRAINT "teacher_classes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_sessions" ADD CONSTRAINT "question_sessions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "question_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_designs" ADD CONSTRAINT "unit_designs_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_designs" ADD CONSTRAINT "unit_designs_curriculum_area_id_fkey" FOREIGN KEY ("curriculum_area_id") REFERENCES "curriculum_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_likes" ADD CONSTRAINT "question_likes_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_likes" ADD CONSTRAINT "question_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


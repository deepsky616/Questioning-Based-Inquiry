/**
 * 2022 개정 교육과정 내용요소를 학년군별로 분리하여 DB 업데이트
 *
 * 처리 순서:
 *  1. 도덕 1-2학년 행 삭제 (도덕은 3-4학년부터 시작)
 *  2. 파서 결과(curriculum_graded.json)를 읽어
 *     각 (subject, area, gradeRange) 조합의 내용요소로 기존 행 UPDATE
 *  3. DB에 없는 행은 INSERT (사회 등 미시드 교과)
 *  4. 각 행에 중학교 내용요소를 middle_* 컬럼에 저장
 *
 * 사용법: node scripts/update-curriculum-graded.mjs
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const prisma = new PrismaClient();

// parse_curriculum_graded.py 결과 파일
const DATA_PATH = "/tmp/curriculum_graded.json";

const GRADE_KEYS = ["1-2", "3-4", "5-6"];

async function main() {
  const raw = readFileSync(DATA_PATH, "utf-8");
  const parsed = JSON.parse(raw);

  // ── 1. 도덕 1-2학년 행 삭제 ──────────────────────────────────────────────
  const deleted = await prisma.$executeRaw`
    DELETE FROM curriculum_areas
    WHERE subject = '도덕' AND grade_range = '1-2'
  `;
  console.log(`도덕 1-2학년 행 삭제: ${deleted}개`);

  // ── 2 & 3. 교과별/영역별/학년군별 업데이트 또는 삽입 ──────────────────────
  let updated = 0;
  let inserted = 0;
  let skipped = 0;

  for (const [subject, areas] of Object.entries(parsed)) {
    for (const [area, gradeData] of Object.entries(areas)) {
      // 중학교 데이터 — 모든 학년군 행에 공통으로 저장
      const middle = gradeData["middle"] ?? {};
      const middleKnowledge = middle.knowledge ?? [];
      const middleProcess   = middle.process   ?? [];
      const middleValue     = middle.value     ?? [];

      for (const gradeRange of GRADE_KEYS) {
        const gd = gradeData[gradeRange];
        if (!gd) continue;

        const knowledge = gd.knowledge ?? [];
        const process   = gd.process   ?? [];
        const value     = gd.value     ?? [];

        // 이 학년군에 내용이 하나도 없으면 건너뜀
        if (knowledge.length === 0 && process.length === 0 && value.length === 0) {
          skipped++;
          continue;
        }

        // 기존 행 조회
        const existing = await prisma.$queryRaw`
          SELECT id FROM curriculum_areas
          WHERE subject = ${subject}
            AND area    = ${area}
            AND grade_range = ${gradeRange}
          LIMIT 1
        `;

        if (existing.length > 0) {
          await prisma.$executeRaw`
            UPDATE curriculum_areas
            SET
              knowledge_items        = ${JSON.stringify(knowledge)}::jsonb,
              process_items          = ${JSON.stringify(process)}::jsonb,
              value_items            = ${JSON.stringify(value)}::jsonb,
              middle_knowledge_items = ${JSON.stringify(middleKnowledge)}::jsonb,
              middle_process_items   = ${JSON.stringify(middleProcess)}::jsonb,
              middle_value_items     = ${JSON.stringify(middleValue)}::jsonb
            WHERE subject = ${subject}
              AND area    = ${area}
              AND grade_range = ${gradeRange}
          `;
          updated++;
        } else {
          // 새 행 삽입 — core_idea·achievements는 빈 값으로 우선 삽입
          // (해당 교과 다른 학년 행이 있으면 core_idea를 복사)
          const ref = await prisma.$queryRaw`
            SELECT core_idea, achievements
            FROM curriculum_areas
            WHERE subject = ${subject} AND area = ${area}
            LIMIT 1
          `;
          const coreIdea   = ref[0]?.core_idea   ?? "";
          const achievements = ref[0]?.achievements ?? "[]";

          await prisma.$executeRaw`
            INSERT INTO curriculum_areas
              (id, subject, grade_range, area, core_idea,
               knowledge_items, process_items, value_items,
               middle_knowledge_items, middle_process_items, middle_value_items,
               achievements)
            VALUES
              (gen_random_uuid()::text, ${subject}, ${gradeRange}, ${area}, ${coreIdea},
               ${JSON.stringify(knowledge)}::jsonb,
               ${JSON.stringify(process)}::jsonb,
               ${JSON.stringify(value)}::jsonb,
               ${JSON.stringify(middleKnowledge)}::jsonb,
               ${JSON.stringify(middleProcess)}::jsonb,
               ${JSON.stringify(middleValue)}::jsonb,
               ${JSON.stringify(achievements)}::jsonb)
            ON CONFLICT DO NOTHING
          `;
          inserted++;
        }
        console.log(`  ✓ ${subject} ${gradeRange} · ${area}`);
      }
    }
  }

  console.log(`\n완료: 업데이트 ${updated}개, 신규 삽입 ${inserted}개, 건너뜀 ${skipped}개`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

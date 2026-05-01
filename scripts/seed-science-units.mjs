/**
 * 2022 개정 교육과정 과학 — 영역별 단원(단원코드+단원명) 데이터 투입
 *
 * 성취기준 코드 형식: [4과01-01] → 4=3-4학년군, 과=과학, 01=단원번호, 01=성취기준번호
 *
 * 사용법: node scripts/seed-science-units.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 과학 단원 데이터 — 영역별 단원코드·단원명
// unitCode: 성취기준 코드의 두 자리 단원번호와 일치
const SCIENCE_UNITS = {
  "3-4": {
    "운동과 에너지": [
      { unitCode: "01", unitName: "물체의 무게" },
      { unitCode: "07", unitName: "소리의 성질" },
      { unitCode: "09", unitName: "자석의 이용" },
    ],
    "물질": [
      { unitCode: "05", unitName: "물질의 성질" },
      { unitCode: "10", unitName: "물의 상태 변화" },
      { unitCode: "15", unitName: "기체의 성질" },
    ],
    "생명": [
      { unitCode: "02", unitName: "동물의 생활" },
      { unitCode: "03", unitName: "식물의 생활" },
      { unitCode: "04", unitName: "생물의 한살이" },
      { unitCode: "12", unitName: "다양한 생물과 우리 생활" },
      { unitCode: "14", unitName: "생물과 환경" },
    ],
    "지구와 우주": [
      { unitCode: "06", unitName: "지구와 바다" },
      { unitCode: "11", unitName: "지표의 변화" },
      { unitCode: "13", unitName: "달의 위상 변화" },
    ],
    "과학과 사회": [
      { unitCode: "08", unitName: "건강한 생활" },
      { unitCode: "16", unitName: "기후 변화와 우리 생활" },
    ],
  },
  "5-6": {
    "운동과 에너지": [
      { unitCode: "02", unitName: "빛의 성질" },
      { unitCode: "07", unitName: "온도와 열" },
      { unitCode: "10", unitName: "물체의 운동" },
      { unitCode: "15", unitName: "전기의 이용" },
    ],
    "물질": [
      { unitCode: "03", unitName: "용해와 용액" },
      { unitCode: "05", unitName: "혼합물의 분리" },
      { unitCode: "09", unitName: "산과 염기" },
      { unitCode: "14", unitName: "연소와 소화" },
    ],
    "생명": [
      { unitCode: "04", unitName: "우리 몸의 구조와 기능" },
      { unitCode: "11", unitName: "식물의 구조와 기능" },
    ],
    "지구와 우주": [
      { unitCode: "01", unitName: "지층과 화석" },
      { unitCode: "06", unitName: "날씨와 우리 생활" },
      { unitCode: "12", unitName: "지구와 달의 운동" },
      { unitCode: "13", unitName: "계절의 변화" },
    ],
    "과학과 사회": [
      { unitCode: "08", unitName: "자원과 에너지" },
      { unitCode: "16", unitName: "과학과 나의 미래" },
    ],
  },
};

async function main() {
  let updated = 0;
  let skipped = 0;

  for (const [gradeRange, areaMap] of Object.entries(SCIENCE_UNITS)) {
    for (const [area, units] of Object.entries(areaMap)) {
      const rows = await prisma.$queryRaw`
        SELECT id FROM curriculum_areas
        WHERE subject = '과학' AND grade_range = ${gradeRange} AND area = ${area}
        LIMIT 1
      `;
      if (!rows.length) {
        console.log(`⚠ 없음: 과학 ${gradeRange} ${area}`);
        skipped++;
        continue;
      }
      const id = rows[0].id;
      await prisma.$executeRaw`
        UPDATE curriculum_areas
        SET units = ${JSON.stringify(units)}::jsonb
        WHERE id = ${id}
      `;
      console.log(`✓ 과학 ${gradeRange} ${area}: ${units.length}개 단원 저장`);
      updated++;
    }
  }

  console.log(`\n완료: ${updated}개 영역 업데이트, ${skipped}개 스킵`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

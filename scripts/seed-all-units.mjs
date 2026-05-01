/**
 * 2022 개정 교육과정 — 전 교과 단원 데이터 투입
 *
 * 설계 원칙:
 *  - 각 CurriculumArea 행의 achievements 배열은 해당 교과·학년군 전체 성취기준을 담고 있음
 *  - units 필드에 영역별 단원코드를 넣으면 UI가 해당 단원의 성취기준만 필터링
 *  - extractUnitCode("[4국01-01]") → "01" 방식으로 코드에서 단원번호 추출
 *  - 영역(area)이 곧 하나의 '단원'인 교과: 영역코드(01,02…)를 unitCode로 사용
 *  - 과학: 이미 seed-science-units.mjs로 처리 → 본 스크립트에서 제외
 *  - 사회: DB에 성취기준 미입력 상태 → 제외
 *  - 바른생활·슬기로운생활·즐거운생활: 각 영역 행에 해당 영역 성취기준만 존재,
 *    코드에 괄호 없는 포맷(2바01-01)이라 extractUnitCode 미적용 → 제외
 *
 * 사용법: node scripts/seed-all-units.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── 영역 → 단원코드 매핑 ────────────────────────────────────────────────────
// unitCode: achievements 코드의 두 번째 숫자 (예: [4국01-01] → "01")
// unitName: UI에 표시될 단원(영역) 이름

const UNITS_BY_SUBJECT = {
  // ── 국어 (1-2, 3-4, 5-6학년군 공통) ──────────────────────────────────────
  국어: {
    "1-2": {
      "듣기·말하기": [{ unitCode: "01", unitName: "듣기·말하기" }],
      읽기:          [{ unitCode: "02", unitName: "읽기" }],
      쓰기:          [{ unitCode: "03", unitName: "쓰기" }],
      문법:          [{ unitCode: "04", unitName: "문법" }],
      문학:          [{ unitCode: "05", unitName: "문학" }],
      매체:          [{ unitCode: "06", unitName: "매체" }],
    },
    "3-4": {
      "듣기·말하기": [{ unitCode: "01", unitName: "듣기·말하기" }],
      읽기:          [{ unitCode: "02", unitName: "읽기" }],
      쓰기:          [{ unitCode: "03", unitName: "쓰기" }],
      문법:          [{ unitCode: "04", unitName: "문법" }],
      문학:          [{ unitCode: "05", unitName: "문학" }],
      매체:          [{ unitCode: "06", unitName: "매체" }],
    },
    "5-6": {
      "듣기·말하기": [{ unitCode: "01", unitName: "듣기·말하기" }],
      읽기:          [{ unitCode: "02", unitName: "읽기" }],
      쓰기:          [{ unitCode: "03", unitName: "쓰기" }],
      문법:          [{ unitCode: "04", unitName: "문법" }],
      문학:          [{ unitCode: "05", unitName: "문학" }],
      매체:          [{ unitCode: "06", unitName: "매체" }],
    },
  },

  // ── 수학 (1-2, 3-4, 5-6학년군 공통) ──────────────────────────────────────
  수학: {
    "1-2": {
      "수와 연산":    [{ unitCode: "01", unitName: "수와 연산" }],
      "변화와 관계":  [{ unitCode: "02", unitName: "변화와 관계" }],
      "도형과 측정":  [{ unitCode: "03", unitName: "도형과 측정" }],
      "자료와 가능성":[{ unitCode: "04", unitName: "자료와 가능성" }],
    },
    "3-4": {
      "수와 연산":    [{ unitCode: "01", unitName: "수와 연산" }],
      "변화와 관계":  [{ unitCode: "02", unitName: "변화와 관계" }],
      "도형과 측정":  [{ unitCode: "03", unitName: "도형과 측정" }],
      "자료와 가능성":[{ unitCode: "04", unitName: "자료와 가능성" }],
    },
    "5-6": {
      "수와 연산":    [{ unitCode: "01", unitName: "수와 연산" }],
      "변화와 관계":  [{ unitCode: "02", unitName: "변화와 관계" }],
      "도형과 측정":  [{ unitCode: "03", unitName: "도형과 측정" }],
      "자료와 가능성":[{ unitCode: "04", unitName: "자료와 가능성" }],
    },
  },

  // ── 도덕 (3-4, 5-6학년군) ─────────────────────────────────────────────────
  도덕: {
    "3-4": {
      "자신과의 관계":         [{ unitCode: "01", unitName: "자신과의 관계" }],
      "타인과의 관계":         [{ unitCode: "02", unitName: "타인과의 관계" }],
      "사회·공동체와의 관계":  [{ unitCode: "03", unitName: "사회·공동체와의 관계" }],
      "자연과의 관계":         [{ unitCode: "04", unitName: "자연과의 관계" }],
    },
    "5-6": {
      "자신과의 관계":         [{ unitCode: "01", unitName: "자신과의 관계" }],
      "타인과의 관계":         [{ unitCode: "02", unitName: "타인과의 관계" }],
      "사회·공동체와의 관계":  [{ unitCode: "03", unitName: "사회·공동체와의 관계" }],
      "자연과의 관계":         [{ unitCode: "04", unitName: "자연과의 관계" }],
    },
  },

  // ── 음악 (3-4, 5-6학년군) ─────────────────────────────────────────────────
  음악: {
    "3-4": {
      연주: [{ unitCode: "01", unitName: "연주" }],
      감상: [{ unitCode: "02", unitName: "감상" }],
      창작: [{ unitCode: "03", unitName: "창작" }],
    },
    "5-6": {
      연주: [{ unitCode: "01", unitName: "연주" }],
      감상: [{ unitCode: "02", unitName: "감상" }],
      창작: [{ unitCode: "03", unitName: "창작" }],
    },
  },

  // ── 미술 (3-4, 5-6학년군) ─────────────────────────────────────────────────
  미술: {
    "3-4": {
      "미적 체험": [{ unitCode: "01", unitName: "미적 체험" }],
      표현:        [{ unitCode: "02", unitName: "표현" }],
      감상:        [{ unitCode: "03", unitName: "감상" }],
    },
    "5-6": {
      "미적 체험": [{ unitCode: "01", unitName: "미적 체험" }],
      표현:        [{ unitCode: "02", unitName: "표현" }],
      감상:        [{ unitCode: "03", unitName: "감상" }],
    },
  },

  // ── 체육 (3-4, 5-6학년군) ─────────────────────────────────────────────────
  체육: {
    "3-4": {
      운동:   [{ unitCode: "01", unitName: "운동" }],
      스포츠: [{ unitCode: "02", unitName: "스포츠" }],
      표현:   [{ unitCode: "03", unitName: "표현" }],
    },
    "5-6": {
      운동:   [{ unitCode: "01", unitName: "운동" }],
      스포츠: [{ unitCode: "02", unitName: "스포츠" }],
      표현:   [{ unitCode: "03", unitName: "표현" }],
    },
  },

  // ── 영어 (3-4, 5-6학년군) ─────────────────────────────────────────────────
  영어: {
    "3-4": {
      "이해(reception)":  [{ unitCode: "01", unitName: "이해(듣기·읽기)" }],
      "표현(production)": [{ unitCode: "02", unitName: "표현(말하기·쓰기)" }],
    },
    "5-6": {
      "이해(reception)":  [{ unitCode: "01", unitName: "이해(듣기·읽기)" }],
      "표현(production)": [{ unitCode: "02", unitName: "표현(말하기·쓰기)" }],
    },
  },

  // ── 실과 (5-6학년군) ──────────────────────────────────────────────────────
  실과: {
    "5-6": {
      "인간 발달과 주도적 삶":    [{ unitCode: "01", unitName: "인간 발달과 주도적 삶" }],
      "생활환경과 지속가능한 선택":[{ unitCode: "02", unitName: "생활환경과 지속가능한 선택" }],
      "기술적 문제해결과 혁신":   [{ unitCode: "03", unitName: "기술적 문제해결과 혁신" }],
      "지속가능한 기술과 융합":   [{ unitCode: "04", unitName: "지속가능한 기술과 융합" }],
      "디지털 사회와 인공지능":   [{ unitCode: "05", unitName: "디지털 사회와 인공지능" }],
    },
  },
};

// ─── 메인 ────────────────────────────────────────────────────────────────────
async function main() {
  let updated = 0;
  let skipped = 0;

  for (const [subject, gradeMap] of Object.entries(UNITS_BY_SUBJECT)) {
    for (const [gradeRange, areaMap] of Object.entries(gradeMap)) {
      for (const [area, units] of Object.entries(areaMap)) {
        const rows = await prisma.$queryRaw`
          SELECT id FROM curriculum_areas
          WHERE subject    = ${subject}
            AND grade_range = ${gradeRange}
            AND area        = ${area}
          LIMIT 1
        `;
        if (!rows.length) {
          console.log(`⚠ 없음: ${subject} ${gradeRange}학년군 · ${area}`);
          skipped++;
          continue;
        }
        const id = rows[0].id;
        await prisma.$executeRaw`
          UPDATE curriculum_areas
          SET units = ${JSON.stringify(units)}::jsonb
          WHERE id = ${id}
        `;
        console.log(`✓ ${subject} ${gradeRange} · ${area}: ${units.length}개 단원`);
        updated++;
      }
    }
  }

  console.log(`\n완료: ${updated}개 영역 업데이트, ${skipped}개 스킵`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

/**
 * parse-achievements-md.mjs
 *
 * 2022 개정 초등학교 교육과정 성취기준 마크다운 파일을 파싱하여
 * src/data/curriculum-achievements.json 으로 저장합니다.
 *
 * 실행: node scripts/parse-achievements-md.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const INPUT_PATH = resolve(
  "/Users/youngmini/Downloads/2022_개정_초등학교교육과정_성취기준_학년군별_교과별_영역별.md"
);
const OUTPUT_PATH = resolve(ROOT, "src/data/curriculum-achievements.json");

// ─── 유틸 ────────────────────────────────────────────────────────────────────

/** ⋅ (U+22C5 DOT OPERATOR) → · (U+00B7 MIDDLE DOT) 정규화 */
function normalizeDot(str) {
  return str.replace(/⋅/g, "·");
}

/** 항목 앞의 `- ` 또는 `-` 제거 후 트림 */
function stripBullet(line) {
  return normalizeDot(line.replace(/^-\s*/, "").trim());
}

/**
 * `[코드]` 로 시작하는 줄에서 코드 + 내용을 추출합니다.
 * 반환: { code: "[6과01-01]", content: "내용..." } | null
 */
function parseCodeLine(line) {
  const match = line.match(/^(\[[^\]]+\])\s*(.*)/);
  if (!match) return null;
  return { code: match[1].trim(), content: normalizeDot(match[2].trim()) };
}

// ─── 학년군 코드 매핑 ─────────────────────────────────────────────────────────

const GRADE_RANGE_MAP = {
  "1~2학년군": "1-2",
  "3~4학년군": "3-4",
  "5~6학년군": "5-6",
};

// ─── 파서 ────────────────────────────────────────────────────────────────────

function parse(rawText) {
  const lines = rawText.split("\n");

  /** 최종 결과: { "1-2": { 교과: { 영역: {...} } } } */
  const result = {};

  let currentGrade = null; // "1-2" | "3-4" | "5-6"
  let currentSubject = null; // "과학" 등
  let currentArea = null; // "지층과 화석" 등

  // 현재 영역의 수집 버퍼
  let achievements = []; // [{code, content}]
  let explanations = {}; // { "[코드]": "내용" }
  let considerations = []; // string[]
  let achievementGroups = []; // [{ name, achievements }]
  let currentAchievementGroup = null;

  // 섹션 추적 (### 이하 ** ** 블록)
  // mode: null | "achievements" | "explanations" | "considerations"
  let mode = null;

  function flushArea() {
    if (!currentGrade || !currentSubject || !currentArea) return;
    if (!result[currentGrade]) result[currentGrade] = {};
    if (!result[currentGrade][currentSubject]) result[currentGrade][currentSubject] = {};
    result[currentGrade][currentSubject][currentArea] = {
      achievements: [...achievements],
      explanations: { ...explanations },
      considerations: [...considerations],
      achievementGroups: achievementGroups.map((group) => ({
        name: group.name,
        achievements: [...group.achievements],
      })),
    };
    achievements = [];
    explanations = {};
    considerations = [];
    achievementGroups = [];
    currentAchievementGroup = null;
    mode = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // ── ## 초등학교 X~Y학년군 ──────────────────────────────────────────────
    if (line.startsWith("## 초등학교 ")) {
      flushArea();
      currentArea = null;
      currentSubject = null;
      // "## 초등학교 5~6학년군" → "5~6학년군"
      const m = line.match(/^## 초등학교\s+(.+?)$/);
      if (m) {
        const key = m[1].trim(); // "5~6학년군"
        currentGrade = GRADE_RANGE_MAP[key] ?? null;
      }
      continue;
    }

    // ── ### 교과 ──────────────────────────────────────────────────────────
    if (line.startsWith("### ")) {
      flushArea();
      currentArea = null;
      currentSubject = line.replace(/^###\s+/, "").trim();
      continue;
    }

    // ── #### 영역 ─────────────────────────────────────────────────────────
    if (line.startsWith("#### ")) {
      flushArea();
      currentArea = normalizeDot(line.replace(/^####\s+/, "").trim());
      continue;
    }

    // ── **성취기준** / **성취기준 해설** / **성취기준 적용 시 고려 사항** ──
    if (line.startsWith("**성취기준 해설**")) {
      mode = "explanations";
      continue;
    }
    if (line.startsWith("**성취기준 적용 시 고려 사항**")) {
      mode = "considerations";
      continue;
    }
    if (line.startsWith("**성취기준**")) {
      mode = "achievements";
      currentAchievementGroup = null;
      continue;
    }

    // ── 수학 등에서 성취기준 하위 단원으로 쓰는 #####소단원 ────────────────
    if (line.startsWith("#####") && mode === "achievements") {
      currentAchievementGroup = normalizeDot(line.replace(/^#####\s*/, "").trim());
      if (currentAchievementGroup) {
        achievementGroups.push({ name: currentAchievementGroup, achievements: [] });
      }
      continue;
    }

    // ── 빈 줄 ─────────────────────────────────────────────────────────────
    if (line.trim() === "") {
      // 빈 줄은 섹션을 닫지 않음 (연속 성취기준 대응)
      continue;
    }

    // ── 항목 줄 (- ...) ───────────────────────────────────────────────────
    if (/^-\s*/.test(line.trimStart()) && mode) {
      const text = stripBullet(line);

      if (mode === "achievements") {
        const parsed = parseCodeLine(text);
        if (parsed) {
          achievements.push(parsed);
          if (currentAchievementGroup && achievementGroups.length > 0) {
            achievementGroups[achievementGroups.length - 1].achievements.push(parsed);
          }
        }
      } else if (mode === "explanations") {
        const parsed = parseCodeLine(text);
        if (parsed) {
          // [코드] 형태면 해설 딕셔너리에 저장
          explanations[parsed.code] = parsed.content;
        } else {
          // 코드 없이 시작하면 고려사항으로 분류
          considerations.push(text);
        }
      } else if (mode === "considerations") {
        const parsed = parseCodeLine(text);
        if (parsed) {
          // 코드로 시작하는 고려사항 — 일반 고려사항으로 처리
          considerations.push(`${parsed.code} ${parsed.content}`);
        } else {
          considerations.push(text);
        }
      }
      continue;
    }
  }

  // 마지막 영역 flush
  flushArea();

  return result;
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

console.log("📖 마크다운 파일 읽는 중...");
const raw = readFileSync(INPUT_PATH, "utf-8");

console.log("🔍 파싱 중...");
const data = parse(raw);

// 통계
const grades = Object.keys(data);
console.log(`\n✅ 파싱 완료`);
for (const grade of grades) {
  const subjects = Object.keys(data[grade]);
  let totalAreas = 0;
  for (const subj of subjects) totalAreas += Object.keys(data[grade][subj]).length;
  console.log(`  [${grade}학년군] 교과 ${subjects.length}개, 영역 ${totalAreas}개`);
}

// 출력 디렉토리 생성
mkdirSync(dirname(OUTPUT_PATH), { recursive: true });

console.log(`\n💾 저장 중: ${OUTPUT_PATH}`);
writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), "utf-8");
console.log("✅ 완료!");

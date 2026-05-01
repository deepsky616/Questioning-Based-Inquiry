# 성취기준 분류 선택 및 전 교과 단원 데이터 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사 페이지 단원 설계에서 전 교과의 성취기준을 단원(주제)별로 분류·선택할 수 있게 하고, 최종 선택된 성취기준이 Step 2 핵심어 생성에 반영되게 한다.

**Architecture:** Task 1(Codex)과 Task 2(UI)는 병렬 진행 가능. Codex 에이전트가 2022 개정 교육과정 문서에서 전 교과 단원명을 수집해 `scripts/seed-units.sql`을 생성하고, Claude Code가 `teacher-curriculum/page.tsx`의 "단원 선택"(line 584–637)과 "성취기준"(line 639–695) 두 섹션을 하나의 통합 섹션으로 병합한다. 기존 `getFilteredAchievements()` → `callGenerate("keywords")` 흐름은 변경 없이 재사용한다.

**Tech Stack:** Next.js 14 App Router, TypeScript, PostgreSQL (Supabase), Prisma, Tailwind CSS

---

## 파일 구조

| 파일 | 역할 | 변경 |
|------|------|------|
| `src/app/(teacher)/teacher-curriculum/page.tsx` | "단원 선택" + "성취기준" 두 섹션 → 통합 1개 섹션 | 수정 (lines 584–695) |
| `scripts/seed-units.sql` | 전 교과 단원 데이터 UPDATE 스크립트 | 신규 생성 |

---

## Task 1: Codex — 전 교과 단원 데이터 수집 및 `scripts/seed-units.sql` 생성

> Task 2와 병렬 진행 가능.

**Files:**
- Create: `scripts/seed-units.sql`

- [ ] **Step 1: Codex 스킬 실행**

`/codex` 스킬을 아래 프롬프트로 실행한다:

```
2022 개정 초등학교 교육과정의 각 교과·학년군·영역별 단원 목록을 조사해
아래 SQL 형식으로 scripts/seed-units.sql 파일을 작성하세요.

--- DB 정보 ---
테이블: curriculum_areas
컬럼: subject, grade_range, area, units (jsonb, 기본값 '[]')

--- 대상 교과 및 영역 ---
국어(1-2, 3-4, 5-6): 듣기·말하기 / 읽기 / 쓰기 / 문법 / 문학 / 매체
수학(1-2, 3-4, 5-6): 수와 연산 / 변화와 관계 / 도형과 측정 / 자료와 가능성
사회(3-4, 5-6): 지리 인식 / 자연환경과 인간생활 / 인문환경과 인간생활 / 지속가능한 세계 / 정치 / 법 / 경제 / 사회·문화 / 역사 일반 / 지역사 / 한국사
도덕(3-4, 5-6): 자신과의 관계 / 타인과의 관계 / 사회·공동체와의 관계 / 자연과의 관계
과학(3-4, 5-6): 운동과 에너지 / 물질 / 생명 / 지구와 우주 / 과학과 사회
체육(3-4, 5-6): 운동 / 스포츠 / 표현
음악(1-2, 3-4, 5-6): 연주 / 감상 / 창작
미술(1-2, 3-4, 5-6): 미적 체험 / 표현 / 감상
영어(3-4, 5-6): 이해(reception) / 표현(production)
실과(5-6): 인간 발달과 주도적 삶 / 생활환경과 지속가능한 선택 / 기술적 문제해결과 혁신 / 지속가능한 기술과 융합 / 디지털 사회와 인공지능
바른 생활(1-2): 나와 우리 / 자연과 더불어 사는 삶 / 인터넷·AI와 생활
슬기로운 생활(1-2): 나와 가족 / 마을과 우리나라 / 봄·여름 / 가을·겨울
즐거운 생활(1-2): 나와 가족 / 마을과 우리나라 / 봄·여름 / 가을·겨울

--- 출력 SQL 형식 ---
UPDATE curriculum_areas
SET units = '[{"unitCode":"01","unitName":"단원명"},{"unitCode":"02","unitName":"단원명2"}]'::jsonb
WHERE subject = '교과명' AND grade_range = '학년군' AND area = '영역명';

--- 규칙 ---
1. unitCode는 해당 영역 내 순서대로 "01"부터 두 자리 숫자
2. 성취기준 코드 [4과02-01]에서 중간 숫자(02)가 unitCode와 일치해야 함
3. 단원 구분이 없는 영역(음악·미술·영어 등)은 UPDATE 제외
4. 조회 출처: 교육부 고시 제2022-33호, ncic.re.kr 또는 교육부 공식 배포 PDF
```

- [ ] **Step 2: 결과를 `scripts/seed-units.sql`로 저장**

Codex 출력 SQL을 `scripts/seed-units.sql`에 저장. 최소 포함해야 할 예시:

```sql
-- ===================================================
-- 2022 개정 교육과정 — 전 교과 단원 데이터 시드
-- curriculum_areas.units 컬럼 UPDATE
-- ===================================================

-- 과학 3-4학년군
UPDATE curriculum_areas
SET units = '[{"unitCode":"01","unitName":"지층과 화석"},{"unitCode":"02","unitName":"화산과 지진"},{"unitCode":"03","unitName":"날씨와 우리 생활"},{"unitCode":"04","unitName":"지구의 모습"}]'::jsonb
WHERE subject = '과학' AND grade_range = '3-4' AND area = '지구와 우주';

UPDATE curriculum_areas
SET units = '[{"unitCode":"01","unitName":"물질의 성질"},{"unitCode":"02","unitName":"물의 상태 변화"},{"unitCode":"03","unitName":"용해와 용액"},{"unitCode":"04","unitName":"혼합물의 분리"}]'::jsonb
WHERE subject = '과학' AND grade_range = '3-4' AND area = '물질';

UPDATE curriculum_areas
SET units = '[{"unitCode":"01","unitName":"동물의 생활"},{"unitCode":"02","unitName":"식물의 생활"},{"unitCode":"03","unitName":"우리 몸의 구조와 기능"}]'::jsonb
WHERE subject = '과학' AND grade_range = '3-4' AND area = '생명';

UPDATE curriculum_areas
SET units = '[{"unitCode":"01","unitName":"자석의 이용"},{"unitCode":"02","unitName":"소리의 성질"},{"unitCode":"03","unitName":"빛의 성질"},{"unitCode":"04","unitName":"전기의 이용"}]'::jsonb
WHERE subject = '과학' AND grade_range = '3-4' AND area = '운동과 에너지';

-- 과학 5-6학년군 및 나머지 교과는 Codex가 채움
-- ...
```

- [ ] **Step 3: SQL 사전 검증 (dry-run)**

적용 전 영향받을 행이 정확한지 확인:

```bash
psql $DATABASE_URL -c "
SELECT subject, grade_range, area
FROM curriculum_areas
WHERE units = '[]'::jsonb
ORDER BY subject, grade_range, area;
"
```

Expected: 단원 데이터 없는 행 목록 출력 (이 행들이 seed-units.sql로 채워짐)

- [ ] **Step 4: 커밋**

```bash
git add scripts/seed-units.sql
git commit -m "feat: 전 교과 2022 개정 교육과정 단원 데이터 시드 SQL 추가"
```

---

## Task 2: `teacher-curriculum/page.tsx` — 두 섹션 통합

> Task 1과 병렬 진행 가능.

**Files:**
- Modify: `src/app/(teacher)/teacher-curriculum/page.tsx` (lines 584–695)

- [ ] **Step 1: 교체할 블록 범위 확인**

`page.tsx` line 584(단원 선택 주석)부터 line 695(성취기준 div 닫는 태그)까지 제거 대상임을 확인:

```bash
grep -n "단원 선택\|성취기준 —" src/app/\(teacher\)/teacher-curriculum/page.tsx
```

Expected:
```
584:              {/* 단원 선택 (단원 데이터가 있는 교과만 표시) */}
639:              {/* 성취기준 — 선택된 단원에 해당하는 것만 표시 */}
```

- [ ] **Step 2: 두 섹션을 하나의 통합 섹션으로 교체**

`page.tsx` line 584–695의 아래 **교체 전** 블록 전체를:

```tsx
              {/* 단원 선택 (단원 데이터가 있는 교과만 표시) */}
              {curriculumData.units.length > 0 && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-blue-700">단원 선택</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedUnitCodes(curriculumData.units.map((u) => u.unitCode))}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        전체 선택
                      </button>
                      <span className="text-xs text-blue-300">|</span>
                      <button
                        onClick={() => setSelectedUnitCodes([])}
                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        전체 해제
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-blue-500">수업할 단원을 선택하면 해당 단원의 성취기준만 표시됩니다</p>
                  <div className="flex flex-wrap gap-2">
                    {curriculumData.units.map((u) => {
                      const selected = selectedUnitCodes.includes(u.unitCode);
                      return (
                        <button
                          key={u.unitCode}
                          onClick={() =>
                            setSelectedUnitCodes((prev) =>
                              selected
                                ? prev.filter((c) => c !== u.unitCode)
                                : [...prev, u.unitCode]
                            )
                          }
                          className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                            selected
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                          }`}
                        >
                          {u.unitName}
                        </button>
                      );
                    })}
                  </div>
                  {selectedUnitCodes.length > 0 && (
                    <p className="text-xs text-blue-600">
                      {selectedUnitCodes.length}개 단원 선택됨 ·{" "}
                      {getFilteredAchievements().length}개 성취기준 적용
                    </p>
                  )}
                </div>
              )}

              {/* 성취기준 — 선택된 단원에 해당하는 것만 표시 */}
              {curriculumData.achievements.length > 0 && (
                <div className="rounded-lg border p-4 space-y-1">
                  <p className="text-xs font-semibold text-gray-600 mb-2">
                    성취기준
                    {curriculumData.units.length > 0 && selectedUnitCodes.length > 0 && (
                      <span className="ml-2 text-indigo-500 font-normal">
                        ({getFilteredAchievements().length}개)
                      </span>
                    )}
                  </p>
                  {curriculumData.units.length === 0 || selectedUnitCodes.length === 0 ? (
                    curriculumData.units.length > 0 ? (
                      <p className="text-sm text-gray-400">단원을 선택하면 성취기준이 표시됩니다</p>
                    ) : (
                      curriculumData.achievements.map((a, i) => (
                        <p key={i} className="text-sm text-gray-700">
                          <span className="font-mono text-indigo-600 mr-2">{a.code}</span>
                          {a.content}
                        </p>
                      ))
                    )
                  ) : (
                    (() => {
                      const filtered = getFilteredAchievements();
                      if (filtered.length === 0) {
                        return <p className="text-sm text-gray-400">선택된 단원의 성취기준이 없습니다</p>;
                      }
                      // 단원별로 그룹화하여 표시
                      const grouped: Record<string, typeof filtered> = {};
                      filtered.forEach((a) => {
                        const code = extractUnitCode(a.code);
                        if (!grouped[code]) grouped[code] = [];
                        grouped[code].push(a);
                      });
                      return Object.entries(grouped).map(([unitCode, achs]) => {
                        const unit = curriculumData.units.find((u) => u.unitCode === unitCode);
                        return (
                          <div key={unitCode} className="mb-3">
                            {unit && (
                              <p className="text-xs font-semibold text-indigo-700 mb-1">
                                [{unit.unitName}]
                              </p>
                            )}
                            {achs.map((a, i) => (
                              <p key={i} className="text-sm text-gray-700 ml-2">
                                <span className="font-mono text-indigo-600 mr-2">{a.code}</span>
                                {a.content}
                              </p>
                            ))}
                          </div>
                        );
                      });
                    })()
                  )}
                </div>
              )}
```

아래 **교체 후** 통합 블록으로 교체:

```tsx
              {/* 성취기준 선택 — 단원 칩 + 분류 표시 통합 */}
              {curriculumData.achievements.length > 0 && (
                <div className="rounded-lg border p-4 space-y-4">
                  {/* 단원 칩 — 데이터 있는 교과만 */}
                  {curriculumData.units.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-blue-700">단원(분류) 선택</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelectedUnitCodes(curriculumData.units.map((u) => u.unitCode))}
                            className="text-xs text-blue-600 hover:text-blue-800 underline"
                          >
                            전체 선택
                          </button>
                          <span className="text-xs text-blue-300">|</span>
                          <button
                            onClick={() => setSelectedUnitCodes([])}
                            className="text-xs text-blue-600 hover:text-blue-800 underline"
                          >
                            전체 해제
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {curriculumData.units.map((u) => {
                          const selected = selectedUnitCodes.includes(u.unitCode);
                          return (
                            <button
                              key={u.unitCode}
                              onClick={() =>
                                setSelectedUnitCodes((prev) =>
                                  selected
                                    ? prev.filter((c) => c !== u.unitCode)
                                    : [...prev, u.unitCode]
                                )
                              }
                              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                                selected
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                              }`}
                            >
                              {u.unitName}
                            </button>
                          );
                        })}
                      </div>
                      {selectedUnitCodes.length > 0 && (
                        <p className="text-xs text-blue-600">
                          {selectedUnitCodes.length}개 단원 선택됨 · {getFilteredAchievements().length}개 성취기준 적용
                        </p>
                      )}
                    </div>
                  )}

                  {/* 성취기준 목록 */}
                  <div>
                    <p className="text-xs font-semibold text-gray-600 mb-2">
                      성취기준
                      {curriculumData.units.length > 0 && selectedUnitCodes.length > 0 && (
                        <span className="ml-2 text-indigo-500 font-normal">
                          ({getFilteredAchievements().length}개)
                        </span>
                      )}
                    </p>
                    {curriculumData.units.length === 0 ? (
                      <div className="space-y-1">
                        {curriculumData.achievements.map((a, i) => (
                          <p key={i} className="text-sm text-gray-700">
                            <span className="font-mono text-indigo-600 mr-2">{a.code}</span>
                            {a.content}
                          </p>
                        ))}
                      </div>
                    ) : selectedUnitCodes.length === 0 ? (
                      <p className="text-sm text-gray-400">단원을 선택하면 성취기준이 표시됩니다</p>
                    ) : (
                      (() => {
                        const filtered = getFilteredAchievements();
                        if (filtered.length === 0)
                          return <p className="text-sm text-gray-400">선택된 단원의 성취기준이 없습니다</p>;
                        const grouped: Record<string, typeof filtered> = {};
                        filtered.forEach((a) => {
                          const uc = extractUnitCode(a.code);
                          if (!grouped[uc]) grouped[uc] = [];
                          grouped[uc].push(a);
                        });
                        return (
                          <div className="space-y-3">
                            {selectedUnitCodes
                              .filter((uc) => grouped[uc])
                              .map((uc) => {
                                const unit = curriculumData.units.find((u) => u.unitCode === uc);
                                return (
                                  <div key={uc}>
                                    {unit && (
                                      <p className="text-xs font-semibold text-indigo-700 mb-1">
                                        [{unit.unitName}]
                                      </p>
                                    )}
                                    <div className="space-y-0.5 ml-2">
                                      {grouped[uc].map((a, i) => (
                                        <p key={i} className="text-sm text-gray-700">
                                          <span className="font-mono text-indigo-600 mr-2">{a.code}</span>
                                          {a.content}
                                        </p>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
              )}
```

- [ ] **Step 3: TypeScript 타입 에러 없음 확인**

```bash
cd /Users/youngmini/Questioning-Based-Inquiry
npx tsc --noEmit 2>&1
```

Expected: 출력 없음 (0 errors)

- [ ] **Step 4: 커밋**

```bash
git add src/app/\(teacher\)/teacher-curriculum/page.tsx
git commit -m "feat: 단원 선택과 성취기준 섹션 통합 — 분류 칩 선택 → 즉시 그룹 표시"
```

---

## Task 3: 시드 데이터 DB 적용

> Task 1 완료 후 진행.

**Files:**
- Run: `scripts/seed-units.sql`

- [ ] **Step 1: 현재 units 현황 확인**

```bash
psql $DATABASE_URL -c "
SELECT subject, grade_range, area,
       jsonb_array_length(units) AS unit_count
FROM curriculum_areas
ORDER BY subject, grade_range, area;
"
```

Expected: `unit_count = 0`인 행이 다수 존재

- [ ] **Step 2: 시드 SQL 실행**

```bash
psql $DATABASE_URL -f scripts/seed-units.sql
```

Expected: 각 UPDATE마다 `UPDATE 1` 출력

- [ ] **Step 3: 적용 결과 확인**

```bash
psql $DATABASE_URL -c "
SELECT subject, grade_range, area,
       jsonb_array_length(units) AS unit_count
FROM curriculum_areas
WHERE jsonb_array_length(units) > 0
ORDER BY subject, grade_range, area;
"
```

Expected: 과학·사회 등 단원 데이터가 있는 교과의 `unit_count > 0` 확인

- [ ] **Step 4: 특정 행 내용 확인**

```bash
psql $DATABASE_URL -c "
SELECT units
FROM curriculum_areas
WHERE subject = '과학' AND grade_range = '3-4' AND area = '지구와 우주';
"
```

Expected:
```json
[{"unitCode":"01","unitName":"지층과 화석"},{"unitCode":"02","unitName":"화산과 지진"},...]
```

---

## Task 4: 수동 검증

- [ ] **Step 1: 개발 서버 실행**

```bash
cd /Users/youngmini/Questioning-Based-Inquiry
npm run dev
```

- [ ] **Step 2: 과학 3-4학년군 — 지구와 우주 검증**

브라우저 `http://localhost:3000` → 교사 로그인 → 단원 설계 탭:
1. 학년군: `3-4` → 교과: `과학` → 영역: `지구와 우주` 선택
2. 통합 성취기준 섹션 안에 단원 칩 `[지층과 화석]` `[화산과 지진]` `[날씨와 우리 생활]` `[지구의 모습]` 표시 확인
3. `[지층과 화석]`만 클릭 → `[지층과 화석]` 헤더 아래 해당 성취기준 2–3개만 표시 확인
4. `[화산과 지진]` 추가 클릭 → 두 단원 성취기준 모두 표시 확인
5. `전체 해제` 클릭 → "단원을 선택하면 성취기준이 표시됩니다" 메시지 확인
6. `전체 선택` 후 "다음 단계: 핵심어 추천받기" 클릭 → Step 2 정상 진입 확인

- [ ] **Step 3: 타 교과 검증 — 사회 3-4학년군**

1. 교과: `사회` → 영역 하나 선택
2. 단원 칩 표시 및 성취기준 분류 확인

- [ ] **Step 4: 하위 호환 확인 — 단원 데이터 없는 영역**

1. 단원 데이터가 없는 영역 선택 (예: 음악 `연주`)
2. 단원 칩 없이 성취기준 전체 평면 표시 확인 (칩 UI 미노출)

- [ ] **Step 5: Step 2 연결 확인**

일부 단원만 선택 후 "다음 단계: 핵심어 추천받기" 클릭 → AI가 선택된 단원 성취기준만 반영한 핵심어 추천 확인

---

## Self-Review

### Spec 커버리지

| 요구사항 | 커버 태스크 |
|----------|-------------|
| 성취기준을 단원(분류)별로 제시 | Task 2 (UI 통합) + Task 3 (데이터) |
| 여러 분류를 선택/삭제 가능 | Task 2 (칩 다중 선택·해제) |
| 최종 선택된 성취기준 → Step 2 핵심어 | 기존 `getFilteredAchievements()` 재사용 — 변경 없음 |
| 전 교과 동일 적용 | Task 1 (Codex 전 교과 데이터) + Task 3 (DB 적용) |
| 단원 데이터 없는 영역 하위 호환 | Task 2 `curriculumData.units.length === 0` 분기 |

### Placeholder 없음 ✓
### 타입 일관성 ✓
- `filtered`: `{ code: string; content: string }[]` — Task 2 전체에서 동일
- `grouped`: `Record<string, typeof filtered>` — Task 2 전체에서 동일
- `extractUnitCode`: 기존 함수 재사용, 시그니처 변경 없음
- `getFilteredAchievements()`: 기존 함수 재사용, 반환 타입 변경 없음

# 질문 중심 탐구설계 — 단원설계(교사 페이지) 대체 설계

- 작성일: 2026-06-10
- 상태: 설계 승인됨 (구현 계획 작성 전) · 개정 1 (교사 단원설계 페이지 대체 결정 반영)
- 관련 페이지: 교사 질문 조회(`teacher-questions`), 학생 단원설계 표시(`student-unit-design`)

## 용어

이 문서에서 **"질문 중심 탐구설계"**는 교사가 학생 질문을 *비슷한 내용끼리 묶고 · 유형화하고 · 탐구 흐름 기준으로 순서를 정해* 학생에게 배포하는 기능을 가리킨다. 기존에 "단원설계"로 불리던 사용자 대면 명칭을 모두 이 용어로 교체한다(교사·학생 메뉴, 화면 제목 포함).

> 참고: 기존 코드 식별자(`unit-design`, `unit-sequence`, `UNIT_FLOW_OPTIONS`)와 API 경로(`/api/unit-design/*`), `UnitDesign` 모델은 **그대로 유지**한다. 코드 레벨 명칭은 두고, 사용자에게 보이는 텍스트만 새 용어를 따른다.

## 배경 / 문제

학생 질문을 묶고 탐구 흐름에 맞게 순서를 잡아 배포하는 기능이 현재 **교사 단원설계 페이지(`teacher-unit-design`)**에 있다. 그런데 이 페이지는 교사가 일상적으로 쓰는 **질문 조회 페이지(`teacher-questions`)**와 동선이 분리돼 있고, 기능적으로도 "질문 시퀀싱 → 세션 배포"로 질문 조회에서 하려는 일과 사실상 중복이다.

목표: 교사 단원설계 페이지를 제거하고, 그 핵심 기능(시퀀싱·드래그·교사 추가·배포)을 질문 조회 페이지로 이전한다.

## 범위 결정 (승인됨)

**접근 A — 교사 페이지만 대체.**
- 제거: `teacher-unit-design` 페이지, 교사 네비 "단원설계" 메뉴 항목.
- 유지(손대지 않음): `UnitDesign` 모델, `/api/unit-design/*` 라우트 5개, 학생 화면(`student-unit-design`).
- **데이터베이스 마이그레이션 없음.** 되돌리기 쉬운 최소 변경.

> 대안 B(학생 화면 통합)·C(생태계 전체 정리, 모델·API 제거)는 채택하지 않음 — 마이그레이션·대규모 의존 정리가 필요.

## 목표 / 비목표

### 목표
- 질문 조회 페이지에서 세션 학생 질문을 AI로 묶고/유형화/순서 제안받는다.
- 교사가 드래그로 순서를 직접 조정하고, 질문을 직접 추가한다(`source: "teacher"`).
- 정리 결과(그룹·순서)를 저장해 학생 화면에 그 순서대로 노출한다.
- 교사 단원설계 페이지와 메뉴를 제거한다.

### 비목표
- 새 AI 시퀀싱 알고리즘을 만들지 않는다(`unit-sequence.ts`·`/api/unit-design/sequence` 재사용).
- DB 스키마 마이그레이션을 추가하지 않는다.
- `UnitDesign` 모델·API·학생 화면을 제거하지 않는다(접근 A).
- 교육과정 기반 질문 생성(`/api/unit-design/generate`, `teacher-curriculum` 소관)은 건드리지 않는다 — 단원설계와 별개 기능이며 그대로 유지.
- 학생이 순서/그룹을 편집하는 기능은 범위 밖(읽기 전용).

## 제거 / 유지 목록

| 대상 | 처리 |
|------|------|
| `src/app/(teacher)/teacher-unit-design/page.tsx` | **삭제** |
| 교사 `layout.tsx`의 `{ href: "/teacher-unit-design", label: "단원설계" }` | **삭제** |
| 단원설계 페이지 전용 테스트(있으면) | 삭제 또는 새 위치로 이전 |
| `UnitDesign` 모델 · `/api/unit-design/*`(generate/sequence/[id]/[id]session/route) | **유지** |
| `student-unit-design` 페이지 | **유지** (제목·메뉴 용어만 "질문 중심 탐구설계"로) |
| `teacher-curriculum`의 `generate` 호출 | **유지** (무관) |

## 데이터 모델

`QuestionSession.sharedQuestions`(기존 `Json @default("[]")`) 항목 구조만 확장. 학생 화면이 이미 이 필드를 받는다.

```
// 기존
{ type: string, content: string }

// 확장 (추가 필드 optional → 하위 호환)
{
  type: string,            // factual | conceptual | controversial | student | teacher
  content: string,
  contentGroup?: string,   // 비슷한 질문 묶음 이름
  priority?: number,       // 1부터 연속, 학생 노출 순서
  source?: "student" | "teacher"
}
```
- 스키마 변경 없음. 누락 필드는 "단일 그룹 · 배열 순서"로 폴백.

## 컴포넌트 / 모듈 구조

### 1. `<QuestionSequenceEditor>` (신규 공용 컴포넌트)

`teacher-unit-design` 페이지에 있던 sequence + 드래그 UI 로직을 이 컴포넌트로 **이전**한다. (단원설계 페이지는 삭제되므로 "추출 후 교체"가 아니라 "로직 이전 + 페이지 삭제"다.)

- **무엇을 하나**: 질문 배열을 받아 ① 탐구 흐름 기준 선택 → ② "AI로 정리"(`/api/unit-design/sequence`) → ③ 교사 질문 추가 → ④ 그룹별 표시 + 드래그 순서 조정. 정리 결과를 콜백으로 반환.
- **props**: `initialQuestions: SequenceInputQuestion[]`, `subject?`, `topic?`, `onChange(result: SequencedQuestion[])`
- **출력**: `SequencedQuestion[]`(기존 `unit-sequence.ts` 타입)
- **의존**: `unit-sequence.ts`, `/api/unit-design/sequence`
- **경계**: "정리 UI"만 책임. 저장·배포·데이터 로딩은 부모 페이지가 담당 → 재사용 가능 단위.

### 2. 교사 질문 조회 페이지 (`teacher-questions`)

- 세션 선택 상태에서 **"질문 중심 탐구설계"** 진입점(버튼/패널) 추가 → `<QuestionSequenceEditor>` 표시 → **[학생에게 배포]** 버튼.
- 1604줄 큰 페이지이므로 정리·배포 UI는 별도 파일(`QuestionSequencePanel.tsx`)로 분리.

### 3. 저장 API — `/api/sessions/[id]/publish-questions` 확장

- 정리 결과(`{type, content, contentGroup, priority, source}[]`)를 받아 `sharedQuestions`에 저장하도록 zod 입력 스키마 확장. 기존 호출 형태와 공존(새 필드 optional 분기).
- 권한: 세션 소유 교사 검사(기존 유지).

### 4. 학생 화면 (`student-unit-design`) — 표시처로 활용

- 이 화면은 이미 `unitDesignId` 있는 세션의 `sharedQuestions`를 표시한다. 질문 조회에서 배포한 일반 세션도 보이도록 **필터를 "`sharedQuestions`가 있는 세션"으로 완화**한다(`unitDesignId` 의무 제거).
- 표시: `contentGroup`별 그룹 + `priority` 순. 그룹/순서 없는 기존 데이터는 단일 목록 폴백.
- 화면 제목·학생 메뉴 라벨을 "질문 중심 탐구설계"로 변경.
- (student-explore에는 별도 렌더를 추가하지 않는다 — 표시처를 student-unit-design으로 단일화.)

## 공유 로직 (순수 함수) — `src/lib/shared-questions.ts` (신규)

- `normalizeSharedQuestions(raw)`: 누락 `contentGroup`(기본 그룹)·`priority`(배열 인덱스) 보정.
- `groupSharedQuestions(items)`: `contentGroup`별 묶고 그룹 내 `priority` 정렬, 그룹은 최소 priority 순.
- 교사 저장·학생 표시 양쪽에서 사용.

## 데이터 흐름

```
[교사: 질문 조회 페이지]
  세션 선택 → 학생 질문 로드
     → <QuestionSequenceEditor> (① 흐름 선택 ② AI 정리 ③ 교사질문 추가 ④ 드래그)
     → [학생에게 배포] → POST /api/sessions/[id]/publish-questions (sharedQuestions 저장)

[학생: 질문 중심 탐구설계 화면(기존 student-unit-design)]
  세션 로드 → sharedQuestions(있는 세션) → normalize → group → 그룹·순서 렌더(읽기전용)
```

## 엣지 케이스

- **질문 0개**: 에디터 빈 상태, 배포 버튼 비활성.
- **AI 정리 실패(429/502)**: `unit-sequence.ts` 키워드 폴백 자동 대체(기존). "기본 규칙으로 정리됨" 안내.
- **드래그 후 재-AI정리**: 수동 순서 덮어쓰기 전 확인.
- **기존 sharedQuestions(그룹/순서 없음)**: 폴백 표시, 재배포 시 새 구조로 갱신.
- **단원설계 페이지로 만든 기존 세션**: `unitDesignId`가 남아 있어도 학생 화면 필터 완화로 정상 표시(하위 호환).
- **레이트 리밋·권한**: sequence는 분당 10회(기존), 배포는 세션 소유 교사 403(기존).

## 테스트 전략

- **단위(vitest)**: `shared-questions.ts`(정규화/그룹/정렬/폴백), publish-questions 확장 스키마·권한(401/403)·저장 형태.
- **회귀**: `teacher-unit-design` 삭제로 깨지는 테스트 식별 → 시퀀싱 로직 테스트는 `<QuestionSequenceEditor>`/`unit-sequence` 단위 테스트로 이전·보존.
- **수동 확인**: 교사 메뉴에서 단원설계 사라짐, 질문 조회에서 정리·배포, 학생 화면에서 그룹·순서 표시.

## 점진적 구현 순서(요약)

1. `shared-questions.ts` 순수 함수 + 단위 테스트.
2. `<QuestionSequenceEditor>`로 시퀀싱·드래그 로직 이전(`unit-sequence` 재사용).
3. `publish-questions` 입력 스키마 확장 + 테스트.
4. 질문 조회 페이지에 정리·배포 패널 통합.
5. `student-unit-design` 필터 완화 + 그룹/순서 렌더 + 용어 변경.
6. `teacher-unit-design` 페이지·교사 메뉴 항목 삭제, 관련 테스트 정리.

> 상세 단계·파일별 변경은 별도 구현 계획(plan)에서 다룬다.

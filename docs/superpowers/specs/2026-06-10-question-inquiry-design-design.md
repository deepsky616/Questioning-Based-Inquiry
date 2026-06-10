# 질문 중심 탐구설계 — 질문 조회 페이지 통합 설계

- 작성일: 2026-06-10
- 상태: 설계 승인됨 (구현 계획 작성 전)
- 관련 페이지: 교사 질문 조회(`teacher-questions`), 학생 질문 탐구(`student-explore`)

## 용어

이 문서에서 **"질문 중심 탐구설계"**는 교사가 학생 질문을 *비슷한 내용끼리 묶고 · 유형화하고 · 탐구 흐름 기준으로 순서를 정해* 학생에게 배포하는 기능을 가리킨다.

> 참고: 기존 코드의 식별자(`unit-design`, `unit-sequence`, `UNIT_FLOW_OPTIONS` 등)와 API 경로(`/api/unit-design/sequence`)는 그대로 재사용한다. 코드 레벨 명칭은 유지하되, **사용자에게 보이는 모든 텍스트와 신규 명칭**은 "질문 중심 탐구설계" 용어를 따른다.

## 배경 / 문제

교사가 학생 질문을 받은 뒤, 비슷한 질문을 묶고 탐구 흐름에 맞게 순서를 잡아 수업에 활용하고 싶어 한다. 현재 이 기능(AI 유목화 · 유형화 · 순서 제안 · 드래그 재정렬 · 교사 질문 추가)은 **단원 설계 페이지에만** 존재하고, 일상적으로 사용하는 **질문 조회 페이지에는 없다.** 교사는 질문을 보는 화면과 정리하는 화면을 오가야 한다.

목표: 질문 조회 페이지에서 곧바로 질문을 정리하고, 그 결과를 학생에게 배포한다.

## 목표 / 비목표

### 목표
- 질문 조회 페이지에서 세션의 학생 질문을 AI로 묶고/유형화/순서 제안받는다.
- 교사가 드래그로 순서를 직접 조정한다.
- 교사가 질문을 직접 추가한다(`source: "teacher"`).
- 정리 결과(그룹·순서)를 저장해 학생 화면에 그 순서대로 노출한다.

### 비목표
- 새로운 AI 시퀀싱 알고리즘을 만들지 않는다 (`unit-sequence.ts`와 `/api/unit-design/sequence` 재사용).
- 데이터베이스 스키마 마이그레이션을 추가하지 않는다.
- 학생이 순서를 바꾸거나 그룹을 편집하는 기능은 범위 밖(읽기 전용 표시).
- 단원 설계 페이지의 기존 동작을 바꾸지 않는다(공용 컴포넌트 추출 시 동작 동일 유지).

## 핵심 결정 (승인됨)

저장은 **기존 `QuestionSession.sharedQuestions`(JSON) 필드를 확장**하는 방식으로 한다(접근 A). `Question` 모델 컬럼 추가(B)나 별도 엔티티 신설(C)은 채택하지 않는다 — 마이그레이션이 필요하거나 기존 배포 흐름과 중복되기 때문.

## 데이터 모델

`QuestionSession.sharedQuestions`는 이미 존재하는 `Json @default("[]")` 필드다. 학생 화면(`student-explore`)이 이미 이 필드를 받아 표시한다. 항목 구조만 확장한다.

```
// 기존
{ type: string, content: string }

// 확장 (추가 필드는 모두 optional → 하위 호환)
{
  type: string,            // factual | conceptual | controversial | student | teacher
  content: string,
  contentGroup?: string,   // 비슷한 질문 묶음 이름 (예: "광합성 관련 질문")
  priority?: number,       // 1부터 연속, 학생 노출 순서
  source?: "student" | "teacher"
}
```

- 스키마 변경 없음(JSON 내부 구조만 확장).
- 하위 호환: `contentGroup`/`priority`가 없는 기존 데이터는 "단일 그룹 · 배열 순서"로 폴백한다.
- 정규화 헬퍼를 두어, 읽는 쪽에서 누락 필드를 일관되게 채운다(아래 `normalizeSharedQuestions` 참고).

## 컴포넌트 / 모듈 구조

### 1. `<QuestionSequenceEditor>` (신규 공용 컴포넌트)

단원 설계 페이지에 이미 있는 sequence + 드래그 UI를 **공용 컴포넌트로 추출**한다. 두 페이지(단원 설계, 질문 조회)가 공유한다.

- **무엇을 하나**: 질문 배열을 받아, 탐구 흐름 기준 선택 → AI 정리 → 교사 질문 추가 → 그룹별 표시 → 드래그 순서 조정을 제공하고, 정리된 결과를 콜백으로 돌려준다.
- **입력 (props)**:
  - `initialQuestions: SequenceInputQuestion[]`
  - `subject?: string`, `topic?: string`
  - `onChange(result: SequencedQuestion[]): void`
- **출력**: `SequencedQuestion[]` (`{ id, type, content, source, contentGroup, priority, lessonPhase, rationale }` — 기존 `unit-sequence.ts` 타입 그대로)
- **의존**: `unit-sequence.ts`(흐름 정의·폴백), `/api/unit-design/sequence`(AI 정리)
- **경계 검증**: 이 컴포넌트는 "정리 UI"만 책임진다. 저장·배포·데이터 로딩은 부모(페이지)가 담당한다 → 단원 설계/질문 조회 어느 쪽에서도 독립적으로 재사용 가능.

> 추출 시 단원 설계 페이지(`teacher-unit-design`)는 이 컴포넌트를 사용하도록 교체한다. 동작은 동일해야 하며, 기존 단원 설계 테스트로 회귀를 보호한다.

### 2. 교사 질문 조회 페이지 (`teacher-questions`)

- 세션이 선택된 상태에서 **"질문 정리·배포"** 진입점(버튼/패널)을 추가한다.
- 클릭 시 해당 세션의 학생 질문을 `<QuestionSequenceEditor>`에 전달한다.
- 하단에 **[학생에게 배포]** 버튼 → 정리 결과를 저장 API로 전송.
- 1604줄짜리 큰 페이지이므로, 정리·배포 UI는 별도 파일(예: `QuestionSequencePanel.tsx`)로 분리해 페이지 비대화를 막는다.

### 3. 저장 API — `/api/sessions/[id]/publish-questions` 확장

- 기존 라우트는 이미 `sharedQuestions`를 동기화한다.
- 정리 결과(`{type, content, contentGroup, priority, source}[]`)를 받아 `sharedQuestions`에 저장하도록 입력 스키마를 확장한다(zod).
- 권한: 세션 소유 교사 검사(기존 패턴 유지).
- 기존 호출 형태(질문 id 목록만 보내는 방식)와 공존하도록, 새 형태를 optional 필드로 받아 분기한다.

### 4. 학생 질문 탐구 페이지 (`student-explore`)

- `sharedQuestions`를 `contentGroup`별로 묶고 `priority` 순으로 정렬해 읽기 전용으로 표시한다.
- 표시 예:
  ```
  📂 광합성 관련 질문
     1. 광합성은 어디서 일어나나요?   [사실적]
     2. 빛이 없으면 어떻게 될까요?     [개념적]
  📂 에너지 관련 질문
     3. ...
  ```
- 그룹/순서 정보가 없는 기존 세션은 단일 목록(배열 순서)으로 폴백.

## 공유 로직 (순수 함수)

테스트 가능하도록 순수 함수로 분리한다.

- `normalizeSharedQuestions(raw): NormalizedSharedQuestion[]`
  - 누락된 `contentGroup`(→ 기본 그룹), `priority`(→ 배열 인덱스) 보정.
- `groupSharedQuestions(items): { group: string, questions: ... }[]`
  - `contentGroup`별 묶고 그룹 내 `priority` 정렬, 그룹은 최소 priority 순.
- 위치: `src/lib/shared-questions.ts` (신규) — 교사 저장·학생 표시 양쪽에서 사용.

## 데이터 흐름

```
[교사: 질문 조회 페이지]
  세션 선택 → 학생 질문 로드
     → <QuestionSequenceEditor>
          ① 탐구 흐름 기준 선택
          ② "AI로 정리" → POST /api/unit-design/sequence → 묶음·유형·순서
          ③ 교사 질문 추가 (source: teacher)
          ④ 드래그로 순서 조정
     → [학생에게 배포]
          → POST /api/sessions/[id]/publish-questions (sharedQuestions 저장)

[학생: 질문 탐구 페이지]
  세션 로드 → sharedQuestions
     → normalizeSharedQuestions → groupSharedQuestions
     → 그룹 헤더 + priority 순 렌더 (읽기 전용)
```

## 엣지 케이스

- **질문 0개**: 에디터는 빈 상태 안내, 배포 버튼 비활성.
- **AI 정리 실패(429/502)**: `unit-sequence.ts`의 키워드 기반 폴백으로 자동 대체(기존 동작). 사용자에게 "기본 규칙으로 정리됨" 안내.
- **드래그 후 재-AI정리**: 사용자의 수동 순서를 덮어쓰기 전 확인.
- **기존 sharedQuestions(그룹/순서 없음)**: 폴백 표시, 재배포 시 새 구조로 갱신.
- **레이트 리밋**: `/api/unit-design/sequence`는 이미 사용자당 분당 10회 제한(기존). 추가 조치 불필요.
- **권한**: 다른 교사의 세션에 배포 시도 → 403(기존 검사).

## 테스트 전략

- **단위(vitest)**:
  - `shared-questions.ts`: 정규화/그룹핑/정렬, 폴백 케이스.
  - publish-questions 라우트: 새 입력 스키마 검증, 권한(401/403), 저장 형태.
- **회귀**: 단원 설계 기존 테스트가 `<QuestionSequenceEditor>` 추출 후에도 통과(동작 보존).
- **E2E(playwright, 선택)**: 미인증 publish 401, 교사 정리→배포→학생 그룹 표시 플로우(모킹 기반).

## 점진적 구현 순서(요약)

1. `shared-questions.ts` 순수 함수 + 단위 테스트.
2. `<QuestionSequenceEditor>` 추출, 단원 설계 페이지를 이 컴포넌트로 교체(회귀 확인).
3. `publish-questions` 라우트 입력 스키마 확장 + 테스트.
4. 질문 조회 페이지에 정리·배포 패널 통합.
5. `student-explore` 그룹/순서 렌더.

> 상세 단계와 파일별 변경은 별도 구현 계획(plan)에서 다룬다.

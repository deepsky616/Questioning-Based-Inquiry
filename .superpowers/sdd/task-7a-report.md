# 작업 7가 서버 판정기 보고서

## 결과

- 상태: 완료
- 구현 커밋: `815f541ce8df015b8ee198474c1116eefa91f244`
- 새 판정기: 이야기 주사위, 질문 주사위, 질문 릴레이, 카바 놀이
- 기본 제공 놀이 일곱 개가 모두 서버 판정기 등록부를 사용한다.

## 시험 우선 기록

먼저 다음 명령으로 실패를 확인했다.

```bash
npm test -- --run \
  src/__tests__/question-game-room-engine-story-dice.test.ts \
  src/__tests__/question-game-room-engine-rounds.test.ts \
  src/__tests__/game-room-route.test.ts
```

처음 결과는 시험 파일 세 개 모두 실패였다.

- 새 `turn-games.ts`가 없어 이야기 주사위와 공유 라운드 시험 묶음을 불러오지 못했다.
- 방 판정기 등록 경계에서 `story-dice`, `dice`, `relay`, `kaba`가 모두 `false`였다.
- 그 시점의 기존 라우트 시험 113개는 통과했다.

이 실패 뒤에만 새 판정기 모듈과 등록, 라우트 시작 흐름을 구현했다.

## 구현 계약

- 네 놀이는 `stateVersion: 2`, 실행 식별값, 라운드 식별값과 최근 명령 식별값을 서버 권위 상태로 쓴다.
- 각 명령은 허용 본문 키를 정확히 검사한다. 클라이언트가 면, 정오, 참가자, 이름, 다음 차례나 상태를 넣으면 거절한다.
- 참가자 이름, 질문 주사위 면, 이야기 단어와 굴림 결과, 카바 문장 배정과 정오는 서버 자료만 쓴다.
- 이야기 단어는 한국어 키와 영어 표시값을 함께 보존한다.
- 질문 주사위, 질문 릴레이와 카바는 현재 참가자가 공유 라운드마다 한 번씩 처리하고 세 번째 라운드의 마지막 저장에서 끝난다.
- 이야기 주사위는 한 이야기와 술래를 유지한다. 질문과 술래 답변이 모두 있어야 한 쌍이며, 각 질문자가 두 공유 순환을 끝내야 완료한다.
- 질문 릴레이 권위 기록은 `round`와 `roundId`가 있는 방 질문 사슬로 투영한다. 두 필드가 없던 옛 사슬도 읽는다.
- 카바는 25개 문장에서 참가자 수에 맞춰 6개부터 24개까지 겹치지 않게 배정한다. 맞음과 틀림 모두 시도로 센다.
- 네 놀이만 한 공유 라운드가 끝난 뒤 방장 조기 종료를 받는다.
- 이탈 뒤 현재 라운드 대상은 라운드 시작 대상과 현재 참가자의 교집합이다. 이탈로 순환이 채워지면 바로 다음 라운드나 완료로 전환한다.
- 한 명만 남으면 다른 전환보다 참가자 부족 종료를 먼저 적용한다.
- 이야기 술래가 나가면 다음 참가자를 술래로 정하고 미완성 질문만 버리며 완료 쌍은 보존한다.
- 엄격 읽기 함수는 도달할 수 없는 단계, 완료 부족, 진행 중 전체 제출, 라운드 식별값 재사용, 참가자와 이름 불일치, 현재 및 과거 기록 누락을 거절한다.
- 비속어와 중복 질문 검사를 서버 명령 경계에서 적용한다.

## 라우트 호환

- 새 기본 제공 방의 `start`는 임시 버전 1 저장 갈래를 거치지 않고 서버 판정기로 간다.
- 이미 진행 중인 버전 1 방은 직접 상태 쓰기를 받지 않고 새 규칙으로 다시 시작하라는 호환 응답을 유지한다.
- 새 시작은 점수와 근거 판본 2를 저장한다.

## 최종 검증

새 판정기와 라우트 대상 시험:

```bash
npm test -- --run \
  src/__tests__/question-game-room-engine-story-dice.test.ts \
  src/__tests__/question-game-room-engine-rounds.test.ts \
  src/__tests__/game-room-route.test.ts
```

- 통과: 시험 파일 3개, 시험 139개

중앙 판정기와 기존 판정기 회귀를 포함한 묶음:

```bash
npm test -- --run \
  src/__tests__/question-game-room-engine.test.ts \
  src/__tests__/question-game-room-engine-memory.test.ts \
  src/__tests__/question-game-room-engine-mystery.test.ts \
  src/__tests__/question-game-room-engine-ladder.test.ts \
  src/__tests__/question-game-room-engine-story-dice.test.ts \
  src/__tests__/question-game-room-engine-rounds.test.ts \
  src/__tests__/game-room-route.test.ts
```

- 통과: 시험 파일 7개, 시험 335개

나머지 검사:

- `npx tsc --noEmit`: 통과
- 수정한 여덟 파일 대상 `npx eslint`: 통과
- `git diff --check`: 통과

## 변경 범위

- `src/lib/question-game-room-engines/turn-games.ts`
- `src/lib/question-game-room-engine.ts`
- `src/lib/question-games-data.ts`
- `src/app/api/question-games/rooms/[code]/route.ts`
- `src/__tests__/question-game-room-engine-story-dice.test.ts`
- `src/__tests__/question-game-room-engine-rounds.test.ts`
- `src/__tests__/question-game-room-engine.test.ts`
- `src/__tests__/game-room-route.test.ts`

지역 놀이 화면과 다른 작업자의 병행 변경은 구현 커밋에 넣지 않았다.

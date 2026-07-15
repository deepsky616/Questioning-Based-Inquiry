# 작업 7마 차례 화면 보정 보고서

## 결과

- 상태: 완료
- 제품 커밋: `92de0d2eb11ce54ebc25b0ed01b1d9fd0bcf7ac6`
- 대상 화면: 이야기 주사위, 질문 주사위, 질문 릴레이, 까바놀이 친구 방
- 서버 판정기, 저장 자료 구조와 명령 이름은 바꾸지 않았다.

## 시험 우선 기록

제품 코드를 바꾸기 전에 `room-turn-games-flow.test.tsx`에 다음 회귀 시험을 추가했다.

- 네 화면의 준비, 굴림, 제출과 조기 종료가 전역 요청 중 잠기는지 확인
- 화면 자체 명령이 진행 중일 때 나가기 단추가 잠기는지 확인
- 세 명 이야기 방에서 첫 회차를 마친 뒤 질문자 한 명이 나간 실제 서버 상태 생성
- 이탈 뒤 진행 목표 `2 / 3`과 최종 목표 `3 / 3` 확인
- 이야기, 질문과 대답 입력의 보이는 라벨 연결 확인
- 회차, 제출 수와 차례가 같은 실시간 알림 영역에 있는지 확인
- 공백 없는 영문 이백 자 질문과 본문, 영문 팔십 자 주제의 줄바꿈 계약 확인

```bash
npm test -- src/__tests__/room-turn-games-flow.test.tsx
```

- 시험 파일 한 개 실패
- 마흔한 시험 중 기존 열다섯 개 통과, 새 결함 시험 스물여섯 개 실패
- 실패 원인은 단추 미잠금, 잘못된 이야기 목표, 연결 라벨과 실시간 영역 부재, 줄바꿈 클래스 부재로 각각 확인했다.

실시간 영역 시험을 회차 진행까지 포함하도록 한 번 더 강화했을 때 이야기 화면 한 건이 기대대로 실패했다. 알림 영역을 전체 진행 묶음으로 넓힌 뒤 다시 통과시켰다.

## 구현 내용

- 네 화면 모두 `actionLoading`을 실제로 받고 `requestPending = actionLoading || pendingKind !== null`을 사용한다.
- 준비, 굴림, 주제 설정, 질문과 답변 제출, 조기 종료의 함수 가드와 단추를 같은 기준으로 잠근다.
- 화면 명령이 처리되는 동안 나가기 단추도 잠근다.
- 이야기 목표는 진행 중에 `현재 기록 + 현재 미제출 대상 + 남은 회차와 현재 대상 수의 곱`으로 계산한다.
- 이야기가 끝난 뒤 목표 수는 실제 질문과 대답 기록 수와 같게 표시한다.
- 질문 주사위, 질문 릴레이와 까바놀이 입력에 보이는 라벨과 입력 식별값을 연결했다. 이야기, 질문과 대답의 기존 동적 라벨도 세 단계 모두 시험한다.
- 회차, 제출 진행과 현재 차례 묶음에 `aria-live="polite"`를 적용했다.
- 주제, 현재 문장, 이야기, 질문, 대답과 공유 기록에 `min-w-0`과 `break-words`를 적용했다.
- 한국어와 영어 입력 라벨 문구를 함께 추가했다.

## 최종 확인

```bash
npm test -- src/__tests__/room-turn-games-flow.test.tsx src/__tests__/room-action-inputs.test.tsx
```

- 시험 파일 두 개 통과
- 시험 마흔여덟 개 통과

```bash
npm test -- src/__tests__/room-turn-games-flow.test.tsx src/__tests__/room-action-inputs.test.tsx src/__tests__/use-room-command-request.test.tsx src/__tests__/question-game-room-engine-story-dice.test.ts src/__tests__/question-game-room-engine-rounds.test.ts src/__tests__/question-play-localization.test.ts src/__tests__/game-room-route.test.ts
```

- 시험 파일 일곱 개 통과
- 시험 이백삼십이 개 통과

```bash
npx eslint 'src/app/(student)/student-question-play/games/RoomStoryDice.tsx' 'src/app/(student)/student-question-play/games/RoomDice.tsx' 'src/app/(student)/student-question-play/games/RoomRelay.tsx' 'src/app/(student)/student-question-play/games/RoomKaba.tsx' src/lib/question-game-i18n.ts src/__tests__/room-turn-games-flow.test.tsx src/__tests__/room-action-inputs.test.tsx
```

- 수정 파일 코드 검사 통과

```bash
npx tsc --noEmit
```

- 전체 형 검사 통과

```bash
git diff --check -- <이번 제품 파일>
```

- 변경 공백 검사 통과

## 남은 걱정

- 단위 시험은 줄바꿈 클래스와 문서 구조 계약을 확인한다. 실제 삼백이십 픽셀 화면의 픽셀 넘침과 화면 읽기 도구의 알림 순서는 뒤의 브라우저 검증 범위에 남는다.
- 병행 작업자가 수정 중인 점수 배포 관련 파일은 읽거나 고치거나 제품 커밋에 넣지 않았다.

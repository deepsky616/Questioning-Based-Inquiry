# 작업 6나 셋째 묶음 검토 보정 결과

## 실패 시험 확인

제품 코드를 바꾸기 전에 다음 명령을 실행했다.

```bash
npm test -- src/__tests__/room-ladder-flow.test.tsx
```

- 시험 스물일곱 개 가운데 다섯 개가 실패했다.
- 새 실행, 참가자 식별값 교체와 참가자 이름 교체 뒤에도 옛 준비 요청이 입력을 잠갔다.
- 새 라운드가 와도 옛 제출 요청 때문에 새 명령을 보낼 수 없었다.
- 두 명인 참가자 부족 종료 방이 안전 안내 대신 실제 종료 화면을 보였다.

## 구현

- 구현 커밋: `5d1010be722ce75b61e6bf0dc8a55c4f81d6b518`
- 요청 수명 표식에 방 코드, 생성 시각, `playId`, 단계, `roundId`, 참가자 식별값과 이름 목록을 넣었다.
- 요청 수명이 바뀌면 대기 요청, 재전송 자료, 준비 오류와 작성기 상태를 바로 초기화한다.
- 늦은 성공과 실패는 요청을 시작한 수명과 현재 수명이 다르면 화면 상태를 바꾸지 않는다.
- 최근 명령 확인은 같은 방 코드, 생성 시각과 `playId`를 가진 사다리 실행만 받는다.
- 옛 요청이 남아 `actionLoading`이 참이어도 새 수명의 명령은 자체 대기 표식으로 따로 보낼 수 있다.
- 방 껍데기는 사다리 놀이, 버전 넷 실행 식별값, 중복 없는 참가자와 단계별 참가자 관계를 검사한다.
- 참가자 부족 종료는 현재 인원이 둘보다 적고 대상과 현재 참가자가 맞아야 한다.
- 완료 종료는 현재 참가자가 마지막 라운드 참가자와 배정의 부분집합이고 이름이 맞아야 한다. 완료 뒤 정상 이탈은 허용한다.
- `room-action-inputs.test.tsx`의 옛 임의 실행 문자열 한 값을 실제 버전 넷 식별값으로 바꿔 시험 자료 계약을 동기화했다.

## 최종 확인

```bash
npm test -- src/__tests__/question-ladder.test.ts src/__tests__/ladder-shared-components.test.tsx src/__tests__/question-game-room-engine-ladder.test.ts src/__tests__/room-ladder-flow.test.tsx src/__tests__/room-action-inputs.test.tsx src/__tests__/question-game-room-engine.test.ts
```

- 시험 파일 여섯 개 통과
- 시험 이백열 개 통과
- 실패 없음

```bash
npx tsc --noEmit
```

- 통과

```bash
npx eslint 'src/app/(student)/student-question-play/games/RoomLadder.tsx' src/__tests__/room-ladder-flow.test.tsx src/__tests__/room-action-inputs.test.tsx
```

- 통과

```bash
git diff --check
```

- 통과

## 남은 걱정

- 긴 이름, 여덟 열 사다리와 밝고 어두운 화면의 실제 작은 화면 배치 및 계산 대비는 이번 보정에서 실제 브라우저로 다시 확인하지 않았다.

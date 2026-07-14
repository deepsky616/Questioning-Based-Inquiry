# 작업 5나 구현 준비 분석

## 살핀 범위와 현재 상태

- 기준: 작업 5 계획과 설계, `.superpowers/sdd/task-5b-brief.md`
- 앞선 결과: `.superpowers/sdd/task-5-analysis.md`, 작업 5가 지시와 보고서
- 방 화면 기준: `RoomMemory.tsx`, `roomShared.tsx`, `RoomResult.tsx`, `useRoom.ts`
- 미스터리 구현: `mystery-box-rules.ts`, `question-game-room-engines/mystery.ts`, `MysteryBoxGame.tsx`, 놀이 페이지
- 시험 기준: 미스터리 판정기와 요청 경로 시험, `room-memory-actions.test.tsx`, `use-room.test.tsx`

작업 5가는 순수 규칙, 서버 판정기, 저장 상태와 공개 상태 판독, 비공개 응답 제거를 이미 구현했다. 작업 5나는 이 서버 표현을 새 방 화면에 연결하고 지역 화면의 종료 흐름만 고치는 묶음이다. 이 분석에서는 제품 코드와 시험을 수정하지 않는다.

현재 놀이 페이지의 `ROOM_GAME_MAP`에는 `mystery-box`가 없다. 그래서 진행 방은 참가자 이름만 지역 `MysteryBoxGame`에 넘기는 대체 분기로 떨어진다. 브라우저마다 물건, 기록, 차례와 결과가 따로 만들어지는 직접 원인이다.

## 공개 상태 규약

### 판독 입구는 하나만 쓴다

`RoomMysteryBox`는 `readMysteryPublicState(room.gameState)`만 호출해야 한다.

```ts
const state = readMysteryPublicState(room.gameState);
```

다음 방식은 쓰지 않는다.

- `room.gameState as MysteryRoomState` 강제 변환
- 저장 전용 `readMysteryState`
- `private`, `itemId` 또는 내장 목록 위치 읽기
- 화면에서 공개 상태를 보충해 저장 상태처럼 만드는 처리

공개 판독기는 `private`가 자기 필드로 하나라도 있으면 거절한다. 진행 중 공개 정답, 잘못된 라운드, 차례 범위, 기록과 점수 불일치도 거절한다. 판독이 실패하면 헤더와 안전한 준비 안내만 그리고 어떤 명령도 보내지 않아야 한다.

| 단계 | 공개 상태에서 기대할 값 | 없어야 하는 값 |
| --- | --- | --- |
| `setup` | 라운드 영, 빈 차례와 기록 및 점수 | `roundId`, `answer`, `winnerId`, `private` |
| `play` | `roundId`, 라운드, 차례, 기록, 질문 점수 | `answer`, `winnerId`, `private` |
| `done/completed` | 기록, 점수, 공개 정답, 선택 승자 | `private` |
| `done/insufficient-players` | 종료 사유, 준비 뒤였다면 공개 정답 | 준비 전 종료라면 `roundId`와 정답 |

방 껍데기도 함께 확인하는 편이 안전하다. `done`은 `room.status === "ended"`여야 한다. 끝난 방에 `play`가 오거나 진행 방에 `done`이 오면 입력을 열지 않는다. 공개 판독 함수는 방 껍데기까지 검사하지 않는다.

### 방 서버의 활동은 추측 횟수다

작업 5가의 확정 규약은 질문과 추측을 다르게 센다.

- `mystery-ask`는 질문 기록과 질문자 점수만 늘린다.
- 질문은 차례, `round`, `roundId`와 남은 활동을 바꾸지 않는다.
- `mystery-guess`만 활동 한 번을 사용한다.
- 틀린 추측은 새 `roundId`, 다음 라운드와 다음 차례를 만든다.
- 맞은 추측 또는 스무 번째 틀린 추측이 방을 끝낸다.

따라서 방 화면의 사용 횟수는 `history.length`가 아니다.

```ts
const guessCount = state.history.filter((item) => item.kind === "guess").length;
const remaining = state.maxRounds - guessCount;
```

`state.round`는 진행 중이면 다음 추측 번호이고, 완료 뒤에는 마지막 추측 번호다. `scores`는 참가자별 질문 수다. 최고 질문 수로 승자를 다시 계산하면 안 되고 승자는 오직 `winnerId`로 정한다. 방 전체 질문 기록이 별도 스무 개 상한에 닿으면 질문 입력만 막고 추측 입력은 계속 열어야 한다.

### 식별값과 이름 역할을 나눈다

- 현재 차례는 `state.turnOrder[state.currentTurnIdx]`로 정한다.
- 내 차례는 그 식별값과 `myId`의 일치로만 정한다.
- 현재 이름은 `room.players`에서 찾고 과거 기록은 기록 안 `playerName`을 쓴다.
- 완료 뒤 떠난 승자 이름은 마지막 맞은 추측 기록에서 찾는다.
- 점수 표는 `state.scores` 식별값을 기준으로 현재 참가자와 과거 기록 이름을 합쳐야 이탈한 참가자를 잃지 않는다.

## `RoomMemory`에서 재사용할 규약

### 재사용할 뼈대

1. `RoomHeader`로 방 번호, 참가자 수와 나가기를 같은 위치에 둔다.
2. 엄격한 판독이 실패하면 `WaitingBanner`만 보이고 일찍 반환한다.
3. `room.code`와 `room.createdAt`을 방 수명으로 묶는다.
4. 요청 중 지역 잠금과 상위 `actionLoading`을 함께 사용한다.
5. `playId`와 `roundId`가 없는 진행 화면은 명령을 보내지 않는다.
6. 화면은 서버가 준 차례, 기록, 점수와 결과만 그린다.
7. 새 영역은 `bg-card`, `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`를 기본으로 쓴다.

`RoomMemory`의 실행 수명 참조와 요청 완료 뒤 같은 방인지 확인하는 방식은 재사용할 가치가 있다. 다만 미스터리에는 자동 복원 효과가 없다. `setup`을 보고 효과로 `mystery-start`를 보내면 다시 그리기와 재접속에서 명령이 겹치므로 반드시 방장 단추로만 시작한다.

### `RoomResult`는 재사용하지 않는다

현재 `RoomResult`는 작업 5나에 맞지 않는다.

- 방장이 결과에 들어오면 점수 지급 요청을 자동으로 보낸다.
- 지급 결과를 `update-state`로 공유한다.
- 최고 양수 점수를 승자로 계산하지만 미스터리 점수는 질문 수다.
- 공개 정답, 스무 번째 추측 종료와 참가자 부족 종료를 구분하지 않는다.

`RoomMysteryBox.tsx` 안에 작은 전용 결과 구역을 둔다. 서버 질문 수, `winnerId` 기반 결과, 종료 사유, 공개 정답과 다시 시작만 보여 준다. 점수 지급과 공유는 작업 8 전에는 호출하지 않는다.

## `RoomMysteryBox` 권장 구조

### 지역 상태 경계

화면이 가져도 되는 지역 상태는 질문 입력, 추측 입력, 현재 요청 종류, 같은 요청을 다시 보낼 때 쓸 명령 식별값뿐이다. 물건, 판정 답, 차례, 기록, 라운드, 점수, 승자와 종료 단계는 지역 상태로 만들지 않는다.

한 요청 참조를 상태와 따로 두어 같은 화면 갱신 틱의 연속 누르기도 막아야 한다. `actionLoading`만 보면 상위 상태가 다시 그려지기 전 두 번째 누르기가 들어올 수 있다.

```ts
if (pendingRef.current || actionLoading) return;
pendingRef.current = request;
setPendingKind(request.kind);
```

요청 완료 뒤 잠금을 풀 때도 시작한 방의 `code`, `createdAt`, `playId`와 필요한 `roundId`가 현재 화면과 같은지 확인한다.

### 세 놀이 명령

`useRoom.sendAction`은 `commandId`, `expectedVersion`, `expectedCreatedAt`을 자동으로 붙인다. 화면은 아래 자료만 더한다.

| 명령 | 화면이 더할 자료 | 조건 |
| --- | --- | --- |
| `mystery-start` | `playId` | `setup`, 방장, 실행 식별값 있음 |
| `mystery-ask` | `playId`, `roundId`, 좁힌 `locale`, 다듬은 `question` | `play`, 내 차례, 질문 상한 전 |
| `mystery-guess` | `playId`, `roundId`, 좁힌 `locale`, 다듬은 `guess` | `play`, 내 차례 |

언어는 `resolveQuestionGameLocale(locale)`로 `ko` 또는 `en`만 보낸다. 질문 이백 자와 추측 팔십 자 상한을 입력에도 적용하되 서버 판정이 최종 근거다. 모든 호출에 `{ expectedRoom: { code: room.code, createdAt: room.createdAt } }`를 넘기면 오래된 화면이 같은 번호의 새 방에 명령하는 것도 막는다.

### `useRoom` 결과 처리

미스터리 응답에는 별도 짧은 결과가 없다. `result.result`를 기대하지 말고 `result.ok`와 상위 방 갱신만 본다.

- 성공: `useRoom`이 공개 방을 적용한다. 해당 입력과 재시도 자료를 비운다.
- `409`: 최신 공개 방을 적용한다. 입력은 보존하고 새 차례와 라운드에 따라 잠근다.
- 서버 거절과 연결 오류: 현재 방과 입력을 보존한다.
- 방 없음: 훅이 방 연결을 비운다.
- `superseded`: 옛 응답이므로 현재 입력과 새 방을 건드리지 않는다.

질문 성공은 `roundId`와 차례를 바꾸지 않는다. 라운드 변경을 기다리지 말고 `await onAction(...)`이 `ok`일 때 그 질문 입력을 지워야 한다. 반대로 요청 전에 지우면 거절과 충돌에서 학생 글을 잃는다.

### 연결 오류 뒤 명령 식별값 재사용

`useRoom`은 호출마다 새 명령 식별값을 만든다. 연결이 끊긴 뒤 같은 질문을 새 식별값으로 다시 보내면 첫 요청이 이미 저장된 경우 질문이 두 번 기록될 수 있다. 질문은 라운드와 차례를 바꾸지 않기 때문에 특히 위험하다.

제출 시 `crypto.randomUUID()`를 한 번 만들고 `options.commandId`로 넘긴다. 실패 뒤 입력, 방 수명, 명령 종류와 문자열이 같으면 같은 식별값을 다시 쓴다. 입력, `playId` 또는 `roundId`가 바뀌면 새 식별값을 만든다. 공개 `recentCommandIds`에 보류 식별값이 나타나면 응답을 잃었어도 서버 반영을 확인하고 입력을 정리할 수 있다. 시작과 추측에도 같은 원칙을 적용할 수 있다.

### 단계별 표현

- 준비: 방장에게만 시작 단추를 보이고 비방장은 기다린다. 재접속한 `play`에서는 시작 명령을 만들지 않는다.
- 진행: 추측 라운드와 남은 추측, 질문 수, 현재 차례와 전체 기록을 보인다.
- 질문 답: `yes`, `no`, `unknown`을 현재 언어의 `text.yes`, `text.no`, `text.notSure`로 바꾼다.
- 입력: 질문과 추측을 서로 다른 값과 단추로 둔다. 차례 밖, 요청 중, 식별값 없음에서는 둘 다 잠근다.
- 결과: `winnerId`가 있으면 정답 성공, 없고 `completed`면 스무 오답, `insufficient-players`면 참가자 부족으로 구분한다.
- 정답: `getLocalizedText(state.answer, locale, "")`로 완료 뒤에만 표시한다.

## 다시 시작 흐름

전용 결과에서 방장만 `restart`를 보낸다. 이는 미스터리 접두 명령 세 개와 별개인 방 수명 명령이다.

```ts
await onAction(
  "restart",
  {},
  { expectedRoom: { code: room.code, createdAt: room.createdAt } },
);
```

옛 `playId`나 `roundId`는 다시 시작 자료에 넣지 않는다. 훅이 명령 식별값, 현재 버전과 생성 시각을 붙인다. 성공하면 서버가 방을 `waiting`, `gameState`를 빈 값으로 만들고 `playId`와 점수 근거 버전을 지운다. 상위 페이지는 다음 그리기에서 `RoomLobby`로 돌아간다.

다시 시작 단추도 지역 요청 참조와 `actionLoading`으로 중복을 막는다. 실패면 결과 화면을 유지하고 최신 공개 방을 따른다. 비방장은 방장 대기 안내만 본다.

## 놀이 페이지 최소 연결

1. `RoomMysteryBox`를 가져온다.
2. `ROOM_GAME_MAP`에 `"mystery-box": RoomMysteryBox`를 넣는다.
3. `shouldShowRoomCompatibilityNotice(room)`는 지도 조회보다 먼저 둔다.
4. 지역 친구 대체 분기를 제거한다.
5. 지도에 없는 진행 방은 지역 놀이를 시작하지 않고 안전하게 안내한다.
6. 혼자와 인공지능의 `GAME_MAP` 연결은 그대로 둔다.

## 지역 `MysteryBoxGame` 최소 수정

### 현재 잘못된 지점

- `MAX_Q = 20`이 공통 규칙과 따로 있다.
- `advanceTurnAfter`는 목록이 스무 개가 되면 `guessing`을 열어 별도 추측을 한 번 더 준다.
- 혼자 모드 첫 틀린 추측은 기록하지 않고 바로 `lose`로 간다.
- 여러 명 모드의 틀린 추측만 목록에 기록하고 차례를 넘긴다.
- 질문과 틀린 추측을 모두 `qaList`에 넣지만 화면은 전부 질문으로 부른다.

### 가장 좁은 흐름 수정

1. `QUESTION_GAME_RULES["mystery-box"].targets[isAI ? "ai" : "solo"].count`를 최대값으로 읽고 `MAX_Q`를 없앤다.
2. `guessing` 단계를 없애고 진행, 성공, 실패만 유지한다.
3. `advanceTurnAfter`는 새 목록 길이가 최대면 바로 `lose`로 끝내고 차례를 넘기지 않는다.
4. 사람의 틀린 추측은 혼자와 여러 명 모두 먼저 오답 기록을 추가하고 입력을 비운다.
5. 오답 기록 뒤 최대면 실패 종료, 혼자면 같은 차례로 진행, 인공지능 또는 지역 대전이면 다음 차례로 간다.
6. 스무 번째 질문도 강제 추측을 열지 않고 바로 실패 종료한다.
7. 인공지능의 스무 번째 질문이나 오답도 같은 도우미를 지나 다음 효과를 예약하지 않는다.
8. 맞은 추측은 최대값 전에 즉시 끝낸다.

```ts
recordFailure(nextActivities);
if (nextActivities.length >= maxActivities) {
  finishWithoutWinner();
  return;
}
closeGuessInput();
if (hasTurns) passTurn();
```

혼자 오답도 같은 도우미를 쓰되 차례는 그대로 남는다. 종료 판단을 오답 기록보다 먼저 하면 결과 검토와 활동 수가 하나 모자라므로 기록을 먼저 만든다.

### 방과 지역의 활동 뜻 차이

- 작업 5 전체 설계와 기존 지역 화면은 질문 또는 틀린 추측을 지역 활동으로 센다.
- 작업 5가는 방 서버에서 추측만 활동으로 세고 질문은 차례와 라운드를 유지하도록 확정했다.

작업 5나만으로 서버 규약을 다시 바꾸면 앞선 판정기와 공개 상태 시험을 모두 다시 열어야 한다. 가장 작은 구현은 방 화면에서 추측 횟수를 따르고 지역 화면에서 기존 `qaList` 전체를 활동으로 세는 것이다. 방 화면은 `남은 추측`, 지역 화면은 `남은 활동`처럼 실제 단위를 드러내야 한다.

두 모드 활동을 반드시 같은 뜻으로 맞춰야 한다면 구현 전에 규약을 다시 정해야 한다. 이는 화면만의 수정이 아니며 `mystery.ts`, 판정기 시험, 설계와 작업 5가 보고서를 함께 바꾸는 별도 변경이다.

이번 최소 수정에서는 지역 내장 목록 통합, 지역 속성 판정 통합, 부분 문자열 판정 변경, `qaList` 자료형 재설계와 지역 점수 지급 제거까지 넓히지 않는다. 이 차이들은 남지만 첫 오답과 스무 활동 종료의 필수 수정은 아니다. 지역 점수 지급 제거는 작업 8 범위다.

## 시험 계획

### 이미 충분히 덮인 서버 범위

작업 5가 시험은 아래를 이미 직접 확인한다. 작업 5나에서 같은 판정기 시험을 복사하지 않는다.

- 방장 시작과 비방장 거절
- 질문은 점수만 늘리고 차례 및 활동 유지
- 틀린 추측의 새 라운드와 차례 이동
- 맞은 추측 조기 종료와 스무 번째 오답 종료
- 같은 명령 재생과 재접속 상태 유지
- 참가자 이탈과 부족 인원 종료
- 저장 상태와 공개 상태 판독 분리
- 성공, 조회, 재생, 저장 충돌, 나가기, 다시 시작 응답의 비밀 제거

`use-room.test.tsx`도 성공, `409`, 거절, 연결 오류, 방 없음, 옛 응답, 방 수명, 여러 요청의 `actionLoading`과 명령 결과 거르기를 확인한다. 새 화면 시험은 훅을 다시 시험하지 않고 반환값에 맞춘 화면 반응을 시험한다.

### 새 `room-mystery-box.test.tsx`

#### 공개 상태와 시작

1. 공개 `setup`에서 방장만 시작 단추를 보고 `mystery-start`에 `playId`만 더한다.
2. 비방장은 방장 대기 안내를 보고 시작 명령을 보내지 못한다.
3. `private`가 있거나 손상된 공개 상태는 안전 안내만 보이고 어떤 명령도 보내지 않는다.
4. `play`로 다시 그리거나 재접속해도 시작을 자동으로 보내지 않는다.

#### 공유 진행과 입력

5. 두 참가자 그리기에 같은 기록, 판정, 라운드, 남은 추측과 현재 차례가 보인다.
6. 질문 답 의미값은 한국어와 영어 화면에서 각각 번역된다.
7. 내 차례 질문은 `mystery-ask`와 `playId`, `roundId`, 언어, 질문만 보낸다.
8. 내 차례 추측은 `mystery-guess`와 `playId`, `roundId`, 언어, 추측만 보낸다.
9. 차례 밖, 요청 중, 실행 식별값 없음과 라운드 식별값 없음에서는 두 입력이 잠긴다.
10. 연속 누르기는 같은 요청을 한 번만 보낸다.
11. 성공 때 해당 입력만 비우고 `409`, 거절, 연결 오류와 `superseded`에서는 보존한다.
12. 질문 성공 뒤 라운드가 그대로여도 질문 입력이 비워진다.
13. 연결 오류 뒤 같은 입력 재시도는 같은 명령 식별값을 쓴다. 공개 `recentCommandIds`로 반영을 확인하면 입력을 정리한다.
14. 질문 상한 뒤 질문만 잠기고 추측은 가능하다.

#### 결과와 다시 시작

15. 맞은 추측 완료는 `winnerId`, 과거 기록 이름, 공개 정답과 질문 수를 보인다.
16. 스무 번째 오답 완료는 승자를 만들지 않고 스무 추측 종료와 공개 정답을 보인다.
17. 준비 전과 진행 중 참가자 부족 종료를 구분하고 정답이 없는 경우도 안전하게 그린다.
18. 끝나기 전 어느 화면 자료에도 공개 정답이 나타나지 않는다.
19. 방장 다시 시작은 `restart`만 보내고 같은 방 수명을 선택값으로 준다. 옛 `playId`와 `roundId`는 보내지 않는다.
20. 다시 시작 중 중복을 막고 비방장은 방장 대기 안내만 본다.
21. 점수 지급 요청과 `update-state` 공유를 전혀 하지 않는다.

#### 소스 경계

22. 미스터리 접두 명령은 `mystery-start`, `mystery-ask`, `mystery-guess` 정확히 세 개다.
23. 전체 `onAction` 허용 목록은 위 세 개와 `restart`뿐이다.
24. `set-state`, `update-state`, `end`, `Math.random`, `private`, `itemId`와 지역 정답 판정 함수가 없다.
25. 공개 판독 함수 호출은 있고 저장 상태 강제 변환은 없다.

`restart`는 결과 요구에 필요한 방 명령이므로 놀이 명령 세 개 제한과 충돌하지 않는다. 소스 시험에서 미스터리 접두 명령과 전체 허용 목록을 나누어 검사해야 한다.

### 같은 시험 파일의 지역 화면 묶음

`room-memory-actions.test.tsx`가 방 화면과 지역 화면을 한 파일에서 함께 검증하는 선례가 있다. 범위를 늘리지 않으려면 새 파일 안에 `MysteryBoxGame` 지역 종료 묶음을 둔다.

1. 혼자 모드 첫 틀린 추측 뒤 결과가 아니라 같은 학생 입력이 다시 열린다.
2. 첫 오답이 기록되고 남은 활동이 하나 줄어든다.
3. 인공지능 모드의 사람 오답 뒤 인공지능 차례로 이동한다.
4. 열아홉 번째 실패 뒤 진행하고 스무 번째 실패에서만 끝난다.
5. 스무 번째 질문 뒤 강제 추측 입력을 열지 않고 끝난다.
6. 스무 번째 사람 활동 뒤 인공지능 지연 효과를 시작하지 않는다.
7. 최대 활동은 공통 규칙의 `solo`와 `ai` 목표에서 읽고 파일 안 고정 스무 값이 없다.
8. 맞은 추측은 최대 활동 전 즉시 끝난다.

인공지능 시험은 가짜 시각과 `useAIPlay` 응답을 고정해 한 차례만 진행시킨다. 지역 물건 선택은 난수를 고정하되 방 화면 소스 시험과 섞지 않는다.

### `game-room-route.test.ts` 페이지 연결 묶음

1. 페이지가 `RoomMysteryBox`를 가져오고 `ROOM_GAME_MAP`의 `mystery-box`에 연결한다.
2. 호환 안내 판별이 계속 지도 조회보다 먼저다.
3. 지역 친구 설정을 만드는 대체 분기가 사라진다.
4. `GAME_MAP`의 혼자 및 인공지능용 `MysteryBoxGame` 연결은 남는다.

실제 요청 경로의 비공개 시험은 이미 같은 파일에 있다. 다시 시작 서버 시험도 끝난 미스터리 저장 상태에서 공개 응답이 빈 `gameState`가 되는 것까지 확인하므로 중복 추가할 필요가 없다.

### 권장 집중 검사

```bash
npm test -- src/__tests__/room-mystery-box.test.tsx src/__tests__/question-game-room-engine-mystery.test.ts src/__tests__/game-room-route.test.ts src/__tests__/use-room.test.tsx
npx tsc --noEmit
npx eslint 'src/app/(student)/student-question-play/games/RoomMysteryBox.tsx' 'src/app/(student)/student-question-play/games/MysteryBoxGame.tsx' 'src/app/(student)/student-question-play/[gameId]/page.tsx' src/__tests__/room-mystery-box.test.tsx src/__tests__/game-room-route.test.ts
git diff --check
```

## 구현 순서와 파일 경계

1. 새 화면 시험에 공개 상태와 명령 실패를 먼저 만든다.
2. `RoomMysteryBox.tsx`를 공개 판독과 입력 잠금만 가진 표현 화면으로 만든다.
3. 전용 결과와 다시 시작을 붙이고 점수 요청이 없음을 고정한다.
4. 놀이 페이지 지도에 연결하고 지역 친구 대체 분기를 함께 제거한다.
5. 같은 시험 파일에 지역 첫 오답과 스무 활동 경계를 추가한다.
6. `MysteryBoxGame.tsx`의 최대값, 오답 기록, 종료와 차례 도우미만 고친다.
7. 집중 시험, 형 검사, 수정 파일 코드 검사와 공백 검사를 실행한다.

작업 5나의 제품 수정 경계는 새 방 화면, 지역 미스터리 화면, 놀이 페이지와 두 시험 파일이면 충분하다. 공통 서버 판정기, 공개 응답, 저장소와 데이터베이스는 다시 열지 않는다.

## 가장 큰 위험

1. 방 화면에서 `history.length`를 남은 활동으로 쓰면 질문만 해도 추측 횟수가 줄어 서버와 화면이 어긋난다.
2. `scores` 최고값을 승자로 쓰면 질문을 많이 한 참가자를 정답 승자로 잘못 표시한다.
3. `RoomResult`를 그대로 쓰면 학생 방장에서 점수 요청과 금지된 `update-state`가 실행된다.
4. 요청 전에 입력을 지우면 충돌과 거절에서 학생 글을 잃는다.
5. 연결 오류 뒤 새 명령 식별값으로 질문을 다시 보내면 중복 기록될 수 있다.
6. `setup` 자동 효과는 다시 그리기와 재접속에서 시작 명령을 겹치게 한다.
7. `room.players`만으로 결과를 만들면 이탈한 작성자와 승자 이름 및 점수를 잃는다.
8. 공개 정답을 단계 검사 없이 읽으면 잘못된 상태나 나중 변경에서 조기 노출될 수 있다.
9. 지역 `guessing`을 남기면 스무 활동 뒤 스물한 번째 강제 추측이 열린다.
10. 지역 혼자 오답을 목록에 넣지 않고 계속시키기만 하면 종료 경계가 한 번 밀린다.
11. 방과 지역 모두 `활동`이라고 표시하면서 다른 단위를 세면 같은 규칙으로 오해하기 쉽다.

가장 먼저 잠글 불변값은 공개 판독만 사용하기, 방에서는 추측 기록만 남은 횟수로 세기, 승자는 `winnerId`만 따르기, 성공 뒤에만 입력 비우기, 결과에서 점수 요청하지 않기의 다섯 가지다.

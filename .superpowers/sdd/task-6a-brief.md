# 작업 6가: 질문 사다리 순수 규칙과 서버 세 라운드 판정

먼저 `docs/superpowers/plans/2026-07-14-question-game-reliability.md`의 작업 6 전체와 최상위 설계, `.superpowers/sdd/task-6-analysis.md`, 작업 5의 최종 보고서와 현재 판정기 등록부를 읽는다. 이 묶음은 화면과 무관한 사다리 계산, 친구 방 공개 상태, 서버 명령과 자동 종료를 완결한다.

## 나눔 판단

이 나눔은 안전하다. `question-ladder.ts`의 순수 자료 계약과 `ladder.ts`의 공개 상태 계약을 먼저 시험으로 고정하면 화면 묶음은 서버 난수, 배정, 질문 기록과 종료를 만들지 않고 받은 상태를 표현할 수 있다. 작업 6나는 이 묶음이 검토를 통과한 커밋에서 시작하고, 공개 형이나 서버 전이를 임의로 바꾸지 않는다. 계약 결함이 발견되면 화면에서 우회하지 말고 작업 6가의 판정기와 시험을 별도 보정한다.

## 범위

- 생성: `src/lib/question-ladder.ts`
- 생성: `src/lib/question-game-room-engines/ladder.ts`
- 수정: `src/lib/question-game-room-engine.ts`
- 생성: `src/__tests__/question-ladder.test.ts`
- 생성: `src/__tests__/question-game-room-engine-ladder.test.ts`
- 수정: `src/__tests__/question-game-room-engine.test.ts`
- 필요할 때 수정: 실제 명령 길과 이탈 공개 응답을 확인하는 기존 방 경로 시험

`LadderGame`, `RoomLadder`, 화면 구성 요소, 화면 문구와 화면 시험은 수정하지 않는다.

## 순수 사다리 계약

`src/lib/question-ladder.ts`는 방, 사용자, 화면과 점수를 알지 않는 순수 모듈이다. 다음 공개 함수와 필요한 자료형을 제공한다.

- `generateLadderGrid(columnCount, random)`
- `traceLadderColumns(startColumn, grid)`
- `buildLadderPathSegments(startColumn, grid)`
- `assignLadderTopics(topics, grid)`

발판 높이는 한 곳의 상수로 열 줄을 사용한다. 열 수는 `2..8`, 각 행의 길이는 `columnCount - 1`이며 한 행에서 참인 발판 바로 옆은 반드시 거짓이다. 난수는 호출할 때마다 유한한 `0 이상 1 미만`이어야 하며 그 밖의 값은 조용히 보정하지 않고 거절한다. 입력 배열을 바꾸지 않는다.

`traceLadderColumns`는 시작 열과 각 발판 행을 지난 뒤의 열을 순서대로 돌려준다. 모든 시작 열의 마지막 값은 중복 없는 일대일 도착 순열이어야 한다. `assignLadderTopics`는 각 시작 열에 대해 `startColumn`, `destinationColumn`, `topic`을 함께 돌려주고 도착 열과 주제의 관계를 같은 추적 함수로 계산한다.

`buildLadderPathSegments`는 다음 형식의 실제 경로만 돌려준다.

```ts
interface LadderPathSegment {
  axis: "vertical" | "horizontal";
  from: { column: number; level: number };
  to: { column: number; level: number };
}
```

- 발판 높이는 `row + 0.5`다.
- 열이 바뀌는 행은 현재 열의 세로 구간, 실제 발판의 가로 구간, 새 열의 세로 구간 순서다.
- 가로 구간은 같은 높이에서 그 행의 참인 발판만 지난다.
- 앞 구간 끝과 다음 구간 시작은 정확히 같고 대각선은 없다.
- 마지막 구간의 열은 추적 결과의 도착 열과 같다.
- 경로가 다른 열로 옮겨 간 뒤 예전 시작 열 아래쪽에 여분 세로 구간을 만들지 않는다.

잘못된 열 수, 행 너비, 시작 열, 주제 수와 발판 관계를 직접 거절한다.

## 서버 공개 상태 계약

`ladder.ts`는 `LadderRoomState`, `LadderAssignment`, `LadderQuestion`과 엄격한 `readLadderState`를 내보낸다. 실행 중 순환 의존을 만들지 않도록 공통 판정기 형은 형 전용 가져오기를 사용한다.

상태에는 적어도 다음 뜻이 구분되어야 한다.

- `game: "ladder"`, `stateVersion: 2`
- `phase: "setup" | "compose" | "done"`
- `round`, 공통 규칙에서 읽은 `maxRounds: 3`, 선택적 `roundId`
- 방장이 준비한 원본 `topicPool`
- 현재 라운드에 쓰는 `roundTopics`, `grid`, `roundPlayerIds`, `assignments`
- 모든 라운드의 누적 `questions`
- `recentCommandIds`와 끝난 경우 `endReason`

배정에는 참가자 식별값과 이름, 시작 열, 도착 열과 주제가 모두 들어간다. 질문에는 `roundId`, 라운드, 참가자 식별값과 이름, 서버 배정에서 읽은 주제, 다듬은 질문과 `ko | en` 언어가 들어간다. 클라이언트가 보낸 이름, 열, 주제, 발판과 분류 결과는 저장하지 않는다.

`readLadderState`는 허용하지 않은 키와 잘못된 형뿐 아니라 다음 관계도 거절한다.

- 현재 그리드 너비와 `roundTopics`, `roundPlayerIds`, `assignments` 수가 같은가
- 시작 열과 도착 열이 각각 중복 없는 순열인가
- 추적한 도착 열, 배정 주제와 저장값이 같은가
- 질문 키 `(roundId, playerId)`가 중복되지 않는가
- 현재 라운드 질문의 참가자와 주제가 현재 배정과 같은가
- 누적 질문이 학생당 셋, 방 전체 스물넷을 넘지 않는가
- `setup`, 진행 중 `compose`, `done/completed`, `done/insufficient-players`의 라운드와 방 상태 관계가 맞는가

이전 라운드 질문을 쓴 학생이 나갈 수 있으므로 지난 질문 작성자를 현재 방 참가자와 억지로 같게 만들지 않는다. 준비 전 참가자 부족 종료는 `round: 0`과 없는 `roundId`를 허용하고, 진행 뒤 참가자 부족 종료는 기존 라운드 자료를 보존한다.

## 서버 명령과 전이

초기 상태는 `setup`, `round: 0`, 빈 배열과 공통 목표에서 읽은 세 라운드다. 일반 `start`가 만든 현재 `playId`를 이어 쓴다.

### `ladder-prepare`

- 현재 방장만 `setup`에서 한 번 실행한다.
- 현재 참가자 수와 정확히 같은 `topics` 배열만 받는다.
- 각 주제는 앞뒤 공백을 없앤 뒤 비어 있지 않고 `QUESTION_GAME_LIMITS.topic` 이하다.
- 서버 난수로 발판을 만들고 공통 순수 함수로 배정한다.
- 클라이언트의 발판, 배정, 참가자 정보와 라운드 식별값은 받거나 신뢰하지 않는다.
- `topicPool`은 다듬은 원본 전체, `roundTopics`는 현재 참가자 수만큼이다.
- 같은 변경에서 `round: 1`, 새 `roundId`, 현재 참가자 식별값 갈무리와 `compose`를 저장한다.

### `ladder-submit-question`

- 공통 `playId`, `roundId`, `commandId`, `expectedVersion` 검사를 거친 현재 참가자만 실행한다.
- 본문에서 `locale`과 질문 문자열만 놀이 자료로 읽는다.
- 현재 라운드 배정이 정확히 하나 있고 같은 `(roundId, playerId)` 제출이 없어야 한다.
- 앞뒤 공백을 없앤 질문이 비어 있지 않고 `isQuestionFormForLocale`를 통과하며 `QUESTION_GAME_LIMITS.question` 이하다.
- `checkProfanity`가 찾은 비속어는 거절한다. 화면의 분류 결과는 보안 판정으로 받지 않는다.
- 같은 명령 식별값 재전송은 기존 성공을 재생하고, 다른 명령으로 같은 라운드 중복 제출은 거절한다.

현재 라운드 완료 대상은 `roundPlayerIds`와 현재 방 참가자의 교집합이다. 마지막 대상의 제출과 다음 전이를 한 변경에 넣는다.

- 1, 2 라운드는 누적 질문을 보존하고 새 `roundId`, 새 서버 발판과 새 배정을 만들어 라운드를 하나 올린다.
- 다음 라운드는 현재 참가자 목록을 새로 갈무리한다.
- 참가자가 줄었다면 `topicPool` 앞에서 현재 인원수만큼 고르는 결정된 규칙으로 `roundTopics`를 만든다.
- 3 라운드 마지막 제출은 `phase: "done"`, `endReason: "completed"`, 방 `status: "ended"`를 같은 변경에 저장한다.
- 별도 `end`, `set-state`, `update-state` 명령은 지원하지 않는다.

### 이탈

- 공통 이탈 처리가 한 명만 남은 방을 `insufficient-players`로 끝냈다면 완료로 덮지 않는다.
- 둘 이상 남고 나간 학생이 마지막 미제출 대상이었다면 같은 이탈 결과에서 다음 라운드로 이동하거나 3 라운드를 완료한다.
- 새 라운드는 이탈 뒤 참가자 목록, 서버 난수와 새 식별값으로 만든다.
- 이전 라운드와 나간 학생의 확정 질문은 지우지 않는다.
- 완료 뒤 이탈은 완료 사유와 누적 질문을 보존한다.
- 필요한 `random` 또는 `randomUUID`가 없거나 잘못되면 임시 지역 값을 만들지 않고 손상 결과로 처리한다.

## 시험 우선

먼저 `question-ladder.test.ts`에서 두 명부터 여덟 명, 맞닿지 않는 발판, 일대일 도착, 고정 그리드 추적, 실제 경로 선분, 불변 입력과 잘못된 입력을 실패시킨다. 구현 뒤 이 시험만 통과시킨다.

다음으로 `question-game-room-engine-ladder.test.ts`에서 초기 상태, 준비 권한과 길이, 두 명과 여덟 명 배정, 엄격한 상태 판독, 질문 모양과 비속어, 재생과 중복, 저장 경합 뒤 두 제출 보존, 라운드별 새 식별값, 세 번째 마지막 제출만 자동 종료, 이탈 교집합과 참가자 부족을 먼저 실패시킨다. 마지막 제출자가 방장이 아닌 경우도 직접 넣는다.

정적 등록부 시험은 작업 5의 `memory`, `mystery-box` 등록을 보존한 채 `ladder`만 더한다. 실제 방 경로 시험이 필요하면 성공, `409`, 나가기와 다시 시작에서 같은 공개 상태가 오고 서버 후보가 바뀌지 않는지도 확인한다. 데이터베이스는 쓰지 않는다.

## 완료 기준

- 지정 순수 함수 시험과 서버 판정 시험 통과
- `npx tsc --noEmit`, 수정 파일 코드 검사와 `git diff --check` 통과
- 기존 작업 5 등록과 시험 회귀 없음
- 자기 검토와 별도 검토 뒤 한 구현 커밋
- `.superpowers/sdd/task-6a-report.md`에 각 실패 확인, 최종 명령과 시험 개수, 커밋과 남은 우려 기록

작업 6나에 넘길 자료는 검토가 끝난 커밋 식별값, 네 순수 함수, 공개 상태 형, `readLadderState`, 두 서버 명령 본문과 실제 시험 자료다.

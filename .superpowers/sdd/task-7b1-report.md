# 작업 7나 첫 묶음 보고서

## 결과

- 구현 커밋: `410be04`
- 새 훅: `src/app/(student)/student-question-play/games/useRoomCommandRequest.ts`
- 새 시험: `src/__tests__/use-room-command-request.test.tsx`
- 친구 방 화면과 다른 제품 파일은 수정하지 않았다.

## 구현 계약

- 실행 키는 방 코드, 생성 시각, 놀이 식별값과 실행 식별값으로 만든다.
- 요청 수명은 실행 키, 단계, 라운드 식별값, 참가자 식별값과 이름, 호출자가 넘긴 추가 수명 조각을 포함한다.
- 같은 수명, 동작과 중복 방지 값의 재시도는 같은 `commandId`를 다시 사용한다.
- 모든 요청은 `expectedRoom`에 방 코드와 생성 시각을 넣는다.
- 한 수명에서는 요청 하나만 진행한다. 수명이 바뀌면 옛 진행 요청과 무관하게 새 요청을 보낼 수 있다.
- 같은 실행의 성공 응답 또는 엄격한 상태 읽기 함수가 확인한 최근 명령만 `confirmed`다.
- 확인되지 않은 충돌과 요청 예외는 `retryable`, 다른 수명이나 실행의 응답은 `stale`이다.
- 같은 수명의 폴링 상태에서 최근 명령이 확인되면 진행 요청을 풀고 `acknowledgementVersion`을 올린다.
- 단계, 라운드나 현재 동작자 변경은 새 입력 문맥이다. 이때 옛 재시도 자료를 먼저 버리고 화면이 새 입력 문맥으로 초기화하므로 옛 폴링 확인은 확인 횟수를 올리지 않는다.
- 훅은 입력값을 소유하거나 비우지 않는다. 화면은 `confirmed`일 때만 현재 문맥의 입력을 비우고, `retryable`과 `stale`에서는 보존해야 한다.
- 개발 엄격 실행과 컴포넌트 언마운트 뒤에는 늦은 응답이 상태를 갱신하지 않는다.

## 시험 우선 기록

1. 구현 파일이 없는 상태에서 대상 시험을 실행해 모듈을 찾을 수 없다는 예상 실패를 확인했다.
2. 최소 훅 구현 뒤 대상 시험 열다섯 개가 통과했다.
3. 개발 엄격 실행 회귀 시험을 추가해 응답이 `confirmed` 대신 `stale`이 되는 실패를 확인했다.
4. 효과 시작 때 마운트 표시를 다시 참으로 정한 뒤 전체 대상 시험 열일곱 개가 통과했다.

## 검증

- `npm test -- src/__tests__/use-room-command-request.test.tsx`: 한 파일, 열일곱 시험 통과
- `npx eslint 'src/app/(student)/student-question-play/games/useRoomCommandRequest.ts' src/__tests__/use-room-command-request.test.tsx`: 통과
- `git diff --cached --check`: 통과
- `npx tsc --noEmit`: 다시 실행했으나 동시 작업 중인 `turn-games.ts`의 한 타입 오류로 실패했다. 우리 두 파일의 타입 오류는 없다.

타입 검사 실패 파일은 다음 하나이며 이 구현 커밋에는 포함되지 않는다.

- `src/lib/question-game-room-engines/turn-games.ts:1550`

## 독립 검토 뒤 보정

- 보정 구현 커밋: `de7db4b`
- 재시도 자료를 동작 하나가 아니라 수명, 동작과 중복 방지 값으로 만든 전체 서명별로 보관한다.
- 같은 동작에서 값이 `A-B-A` 순서로 바뀌어도 마지막 `A`는 최초 `A`의 `commandId`를 다시 쓴다.
- 폴링 확인과 응답 확인은 해당 서명의 요청만 지우므로 다른 값의 재시도 자료를 보존한다.
- 새 수명이나 실행 뒤 남아 있는 예전 `send`와 언마운트 뒤 보관한 `send`는 요청 식별값 생성, 진행 상태 갱신과 `onAction` 호출 전에 `stale`을 돌려준다.
- 중복 방지 값과 추가 수명 조각의 공개 타입을 손실 없는 제이슨 값으로 좁혔다.
- 객체 키를 정렬해 키 순서가 다른 같은 객체를 같은 서명으로 만들고, 순환값, 정의되지 않은 값, 유한하지 않은 수와 직렬화에서 사라지는 속성은 요청 전에 명시적으로 거절한다.

## 보정 시험 우선 기록

1. 구현을 바꾸기 전에 재시도 보존, 폴링 확인, 객체 키 순서, 손실값 거절, 예전 함수와 언마운트 뒤 호출 시험을 추가했다.
2. 대상 시험에서 새 시험 여덟 개가 의도한 이유로 실패하는 것을 확인했다.
3. 전체 서명별 저장, 시작 전 수명 검사와 제한된 제이슨 직렬화를 구현한 뒤 대상 시험 스물다섯 개 통과를 확인했다.
4. 직렬화에서 사라지는 배열 속성 시험을 추가해 별도로 실패를 확인한 뒤, 배열의 모든 실제 속성과 원소 설명자를 검사하도록 보정했다.
5. 최종 대상 시험 스물여섯 개가 모두 통과했다.

## 보정 검증

- `npm test -- src/__tests__/use-room-command-request.test.tsx`: 한 파일, 스물여섯 시험 통과
- `npx eslint 'src/app/(student)/student-question-play/games/useRoomCommandRequest.ts' src/__tests__/use-room-command-request.test.tsx`: 통과
- `npx tsc --noEmit`: 통과, 남은 오류 없음
- 공용 훅 두 파일의 공백 검사: 통과

# 작업 6나 첫 묶음 보고

## 범위

- 새 공통 사다리 그림 `LadderBoard`
- 새 공통 질문 작성 및 확인 흐름 `LadderQuestionComposer`
- 한국어와 영어 공통 문구
- 새 동작 시험 `ladder-shared-components.test.tsx`

`LadderGame`, `RoomLadder`, 서버 판정기와 자료 저장 영역은 바꾸지 않았다.

## 시험 우선 기록

첫 실행은 다음 명령으로 새 모듈이 없는 실패를 확인했다.

```bash
npm test -- src/__tests__/ladder-shared-components.test.tsx
```

- 시험 파일 한 개 실패
- 시험 실행 전 `LadderBoard` 가져오기를 찾지 못해 실패
- 실패 원인이 새 공통 구성 요소 부재와 일치함을 확인

구현 뒤 자기 검토에서 확정 요청을 기다리는 동안 입력을 고치면 이전 성공은 무시하지만 진행 표시가 남는 경우를 찾았다. 해당 동작 시험을 먼저 추가하고 다음 명령에서 한 개 실패를 확인했다.

```bash
npm test -- src/__tests__/ladder-shared-components.test.tsx -t '확정 대기 중'
```

입력 수정이 이전 확정 요청 식별값뿐 아니라 화면 진행 상태도 끊게 고친 뒤 같은 시험이 통과했다.

## 구현 내용

### 공통 사다리 그림

- 승인된 `buildLadderPathSegments`가 돌려준 세로와 가로 선분만 선택 경로로 덧그린다.
- 기본 세로선과 실제 참 발판을 먼저 그리고 시작 열 전체를 선택색으로 바꾸지 않는다.
- 두 열부터 여덟 열까지 열 간격 구십육, 높이 사백인 안정 좌표를 쓴다.
- 긴 이름과 주제는 그림 좌표에 넣지 않고 그림 아래 전체 배정 목록에서 줄바꿈해 모두 보여 준다.
- 시작은 원과 `S`, 도착은 마름모와 `E`로 표시하고 한국어와 영어 접근 이름을 함께 둔다.
- 기본선과 선택 경로, 글자에 밝은 화면과 어두운 화면 색 짝을 명시했다.
- 그림 안에서 난수, 발판 생성과 배정 재계산을 하지 않는다.

### 공통 질문 확인

- `writing`, `checking`, `review`, `check-failed` 네 상태를 둔다.
- 앞뒤 공백 제거 뒤 빈 값, 현재 언어 질문 모양과 이백 자 상한을 먼저 검사한다.
- 잘못된 입력은 `/api/classify`를 부르지 않고 입력 가까이 알린다.
- 분류 응답은 기존 `parseClassificationResponse`로 검사하고 열린 정도, 질문 범위, 질문 유형, 까닭과 도움말을 보여 준다.
- 닫힌 질문과 사실 질문도 확정할 수 있다.
- 호출 제한, 통신 실패와 응답 모양 오류 뒤 입력을 보존하고 다시 확인과 도움말 없이 확정을 제공한다.
- 요청 식별값, 취소 신호와 `roundKey`를 함께 확인해 늦은 분류 및 확정 응답을 버린다.
- `onConfirm`이 참을 돌려준 때만 입력을 비우며, 거절과 통신 실패 때 입력과 검토를 보존한다.
- 확정 콜백에는 분류 자료 없이 다듬은 질문 문자열 하나만 전달한다.

## 최종 확인

```bash
npm test -- src/__tests__/ladder-shared-components.test.tsx src/__tests__/question-ladder.test.ts
```

- 시험 파일 두 개 통과
- 시험 여든두 개 통과

```bash
npx tsc --noEmit
```

- 형 검사 통과

```bash
npx eslint 'src/app/(student)/student-question-play/games/LadderBoard.tsx' 'src/app/(student)/student-question-play/games/LadderQuestionComposer.tsx' src/lib/question-game-i18n.ts src/__tests__/ladder-shared-components.test.tsx
```

- 수정 파일 코드 검사 통과

```bash
git diff --check
```

- 변경 공백 검사 통과

## 구현 커밋

- `5440d07cfa74cc17821cf5518ef05a4d912ec046 feat: 질문 사다리 공통 경로와 확인 추가`

## 남은 우려

- 이번 묶음은 공통 구성 요소만 만들었으므로 `LadderGame`과 `RoomLadder` 연결은 다음 화면 묶음에서 해야 한다.
- 실제 작은 화면 가로 움직임과 밝고 어두운 화면의 눈으로 보는 확인은 두 화면에 연결한 뒤 화면 자동 시험과 갈무리로 다시 확인해야 한다.
- 분류 도움말은 로그인과 호출 제한이 있는 기존 분류 경로에 기대지만, 실패해도 도움말 없이 질문을 확정할 수 있게 흐름을 열어 두었다.

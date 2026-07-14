# 작업 7다 지역 모드 추가 보정 보고서

## 보정 내용

- 질문 주사위는 셋째 학생 질문을 먼저 기록하고 바로 끝낸다.
- 셋째 질문에서는 이전 인공지능 질문의 피드백 요청을 새로 보내지 않으므로, 피드백 응답이 오지 않아도 결과 화면으로 이동한다.
- 이야기 주사위의 최초 단어 요청은 응답을 읽기 전에 현재 마운트 여부와 요청 번호를 확인한다.
- 목록으로 나가거나 화면이 언마운트된 뒤 도착한 단어 응답은 단어와 단계를 바꾸지 않는다.

## 시험 먼저 확인

다음 두 경계를 먼저 시험으로 추가했고 구현 전 두 시험이 모두 실패하는 것을 확인했다.

- 언마운트 뒤 도착한 이야기 단어 응답의 내용을 읽는 문제
- 셋째 질문이 끝나지 않는 피드백 약속을 기다려 종료하지 못하는 문제

## 최종 확인

관련 시험:

```bash
npm test -- src/__tests__/question-game-local-rounds.test.tsx src/__tests__/question-game-rules.test.ts src/__tests__/question-play-localization.test.ts src/__tests__/story-dice-emoji.test.ts src/__tests__/student-game-shared-header.test.ts
```

결과: 5개 파일, 31개 시험 전부 통과.

대상 파일 코드 검사:

```bash
npx eslint 'src/app/(student)/student-question-play/games/StoryDiceGame.tsx' 'src/app/(student)/student-question-play/games/DiceGame.tsx' 'src/__tests__/question-game-local-rounds.test.tsx'
```

결과: 통과.

타입 검사:

```bash
npx tsc --noEmit
```

결과: 통과.

변경 공백 검사:

```bash
git diff --check
```

결과: 통과.

## 범위 확인

- 지역 질문 주사위와 이야기 주사위, 지역 라운드 시험만 구현 커밋에 포함했다.
- 서버 놀이 엔진과 친구 방 화면, 공용 요청 훅은 수정하지 않았다.
- 공동 작업 폴더의 다른 작업자 변경은 포함하거나 되돌리지 않았다.

## 구현 커밋

`2187eb8`

`fix: 지역 질문놀이 요청 종료 경계 보완`

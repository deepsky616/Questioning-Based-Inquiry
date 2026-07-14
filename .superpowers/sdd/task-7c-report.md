# 작업 7다 지역 질문놀이 마무리 보고서

## 변경 내용

- 이야기 주사위는 혼자 하기와 인공지능 함께 하기 모두 질문과 대답 세 묶음이 완성될 때 자동으로 끝난다.
- 이야기 주사위의 빈 인공지능 응답은 현재 언어에 맞는 대체 질문으로 바꾸며, 셋째 대답 뒤에는 새 요청을 보내지 않는다.
- 질문 주사위 기록에 인공지능 여부를 넣어 학생 질문만 목표에 세고, 인공지능 응답이 비어도 학생 차례로 돌려보낸다.
- 질문 릴레이는 인공지능 질문을 목표 수에서 빼고 셋째 학생 질문 직후 자동으로 끝난다.
- 까바는 인공지능 함께 하기에서도 첫 학생이 열 문장을 모두 풀며, 빈 응답이나 읽을 수 없는 응답은 지역 질문 형태 검사로 판정한다.
- 네 놀이 모두 늦게 도착한 인공지능 응답을 무시하는 요청 번호를 두고, 지역 화면의 점수 지급 훅과 배지를 없앴다.
- 목표 수는 화면에 다시 적지 않고 `QUESTION_GAME_RULES`에서만 읽는다.

## 시험 먼저 확인

처음 작성한 지역 라운드 시험 10개는 구현 전 모두 실패했다. 이후 늦은 응답 경계와 까바의 학생 기록을 따로 추가해 각각 실패를 확인한 뒤 구현했다.

## 최종 확인

관련 시험:

```bash
npm test -- src/__tests__/question-game-local-rounds.test.tsx src/__tests__/question-game-rules.test.ts src/__tests__/question-play-localization.test.ts src/__tests__/story-dice-emoji.test.ts src/__tests__/student-game-shared-header.test.ts
```

결과: 5개 파일, 29개 시험 전부 통과.

대상 파일 코드 검사:

```bash
npx eslint 'src/app/(student)/student-question-play/games/StoryDiceGame.tsx' 'src/app/(student)/student-question-play/games/DiceGame.tsx' 'src/app/(student)/student-question-play/games/RelayGame.tsx' 'src/app/(student)/student-question-play/games/KabaGame.tsx' 'src/__tests__/question-game-local-rounds.test.tsx'
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

- 서버 놀이 엔진과 친구 방 화면은 수정하지 않았다.
- 공동 작업 폴더의 다른 미커밋 파일은 커밋에 넣지 않았다.
- 지역 놀이 화면에서 점수를 직접 지급하지 않는다.

## 구현 커밋

`8f0a7f387fc6ff7b5135f121a89aa9ea89c26c5e`

`fix: 지역 질문놀이 자동 종료 보완`

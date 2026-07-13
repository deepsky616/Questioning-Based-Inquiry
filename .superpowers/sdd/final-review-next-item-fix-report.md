# 최종 다음 문항 경합 수정 보고서

## 결과

바꾸기의 `다른 문제` 처리와 만들기의 `다른 주제` 처리가 새 내장 문항을 고르기 전에 진행 중인 실시간 생성 요청을 무효화하도록 수정했다.

기존 요청 식별값 경계를 그대로 재사용했다. 무효화는 식별값을 올리고, 생성 중 상태를 끝내고, 이전 생성 오류를 지운다. 따라서 늦은 성공, 실패, 마무리가 사용자가 고른 새 내장 문항과 입력을 덮지 않는다.

## 처음 실패한 시험

```bash
npm test -- src/__tests__/question-practice-handoff.render.test.tsx
```

- 17개 중 15개 통과, 새 회귀 시험 2개 실패
- 바꾸기 생성 요청 중 `다른 문제`를 고른 뒤 작성한 입력이 늦은 응답에 지워져 실패
- 만들기 생성 요청 중 `다른 주제`를 고른 뒤 작성한 입력이 늦은 응답에 지워져 실패
- 기존 탭 변경, 주소 변경, 이전 실패와 마무리, 같은 탭 재선택 경계 시험 15개는 통과

## 최종 검증

- `npm test -- src/__tests__/question-practice-handoff.render.test.tsx`
  - 1개 파일, 17개 시험 통과
- `npm test -- src/__tests__/practice-progress-route.test.ts src/__tests__/practice-progress-summary.render.test.tsx src/__tests__/practice-selection.test.ts src/__tests__/question-practice-data.test.ts src/__tests__/question-practice-handoff.render.test.tsx`
  - 5개 파일, 47개 시험 통과
- `npx eslint src/components/shared/QuestionPracticeView.tsx src/__tests__/question-practice-handoff.render.test.tsx`
  - 오류와 경고 없이 통과
- `npx tsc --noEmit`
  - 자료형 검사 통과
- `git diff --check`
  - 공백 오류 없이 통과

## 변경 파일

- `src/components/shared/QuestionPracticeView.tsx`
- `src/__tests__/question-practice-handoff.render.test.tsx`
- `.superpowers/sdd/final-review-next-item-fix-report.md`

원격 푸시는 수행하지 않았다.

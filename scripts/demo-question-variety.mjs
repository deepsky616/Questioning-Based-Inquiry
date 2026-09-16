import { readFileSync } from 'node:fs';
import { GRADE_FIVE_COMMENT_VARIANTS } from './demo-grade-five-comments.mjs';

export const DEMO_QUESTION_VARIANTS = JSON.parse(readFileSync(new URL('./demo-question-variants.json', import.meta.url), 'utf8'));
DEMO_QUESTION_VARIANTS.today[4].push({
  content: '학급 야외 활동용 보냉 가방을 고를 때 오래 차갑게 유지되는 정도와 들고 다니기 편한 정도 중 무엇을 더 중요하게 볼까요?',
  answer: '저는 이동 시간이 길다면 보냉 성능을 먼저 살펴보겠어요. 다만 학생이 직접 들 수 있는 무게인지도 함께 확인해야 해요.',
  hint: '활동 시간과 이동 거리를 정한 뒤 선택 기준의 우선순위를 비교해 보세요.',
  comments: ['저는 들기 편한지도 중요해요. 성능이 좋아도 너무 무거우면 직접 옮기기 어렵잖아요.', '짧은 이동과 긴 이동에 똑같은 기준을 적용해야 할지 토의해 보고 싶어요.', '같은 크기 가방에 같은 양의 얼음을 넣어 온도 변화를 비교한 자료가 있으면 판단하기 좋겠어요.'],
}, {
  content: '학교 보온 덮개 만들기에서 새 단열재와 집에서 가져온 포장재 중 어떤 재료를 선택하는 것이 좋을까요?',
  answer: '저는 깨끗하고 안전한 포장재를 다시 쓰고 싶어요. 다만 실제로 온도 변화를 늦추는지 확인한 뒤 선택하겠어요.',
  hint: '재사용, 구입 비용, 단열 효과를 각각 비교할 기준으로 정해 보세요.',
  comments: ['모둠끼리 재료를 똑같이 준비하기는 새 재료가 편할 것 같아요. 비용도 알아봐야겠어요.', '버릴 포장재를 다시 쓰면 쓰레기를 줄일 수 있어서 저는 재사용 쪽을 고르겠어요.', '성능 비교에서는 컵과 물의 양을 같게 하고 재료만 바꾸어야 판단하기 쉬워요.'],
});
export const demoTextKey = text => text.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();

export function demoQuestionChoices(key, lesson, index) {
  const base = lesson.questions[index];
  return [base, ...DEMO_QUESTION_VARIANTS[key][index].map(item => ({ ...base, ...item }))];
}

// 같은 교실에서 다른 학생에게도 같은 문장을 다시 배정하지 않는다.
// 준비한 자료가 부족하면 반복하는 대신 멈춰서 문항을 보충하게 한다.
export function takeDemoQuestion(key, lesson, index, used) {
  const base = lesson.questions[index];
  const indices = [index, ...lesson.questions.flatMap((q, i) => i !== index && q.closure === base.closure && q.type === base.type ? [i] : [])];
  const next = indices.flatMap(i => demoQuestionChoices(key, lesson, i)).find(q => !used.has(demoTextKey(q.content)));
  if (!next) throw new Error(`${key} 수업의 중복 없는 ${base.type} 질문이 부족합니다.`);
  used.add(demoTextKey(next.content));
  return next;
}

export function demoCommentChoices(key, lesson, question) {
  const exact = DEMO_QUESTION_VARIANTS[key].flat().find(item => item.content === question.content);
  if (exact) return [...exact.comments, exact.answer, exact.hint];
  const index = lesson.questions.findIndex(item => question.content.includes(item.content));
  if (index < 0) return [];
  const base = lesson.questions[index];
  return [...(GRADE_FIVE_COMMENT_VARIANTS[key]?.[index] ?? []), base.answer, base.hint];
}

export function takeDemoComment(key, lesson, question, used) {
  const text = demoCommentChoices(key, lesson, question).find(text => text?.trim() && !used.has(demoTextKey(text)));
  if (!text) throw new Error(`${key} 수업 질문에 연결할 중복 없는 답변이 부족합니다: ${question.id}`);
  used.add(demoTextKey(text));
  return text;
}

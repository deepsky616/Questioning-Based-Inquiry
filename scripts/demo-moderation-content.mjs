// 교사가 '부적절 의심만' 필터와 '이상 없음' 처리를 연습하는 합성 사례다.
// 실제 탐지 결과로 오해하지 않도록 사유에 시연용 표시를 넣는다.
export const DEMO_MODERATION_PREFIX = 'usb-demo-moderation-v1-question-';
export const DEMO_MODERATION_EXAMPLES = [
  ['이런 것도 모르는 친구는 바보 아닌가요?', '친구를 비하하는 표현 의심'],
  ['친구의 집 주소와 전화번호를 여기에 적어서 알려 주면 안 되나요?', '다른 사람의 개인정보 공개 유도 의심'],
  ['ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ', '의미 없는 문자 반복'],
  ['수업 말고 게임 아이템을 서로 사고팔 사람 있나요?', '수업과 무관한 거래 유도 의심'],
  ['친구 답을 몰래 베껴서 포인트만 많이 받는 방법은 없나요?', '답 베끼기와 보상 악용 유도 의심'],
];

export function buildDemoModerationQuestions({ sessionId, context, studentIds, createdAt = new Date() }) {
  if (!sessionId.startsWith('usb-demo-') || studentIds.length < 6 || studentIds.some(id => !/^usb-demo-student-\d{2}$/.test(id))) throw new Error('검토 시연 질문은 지정된 더미 학급에만 추가할 수 있습니다.');
  return DEMO_MODERATION_EXAMPLES.map(([content, reason], index) => ({
    id: `${DEMO_MODERATION_PREFIX}${String(index + 1).padStart(2, '0')}`,
    sessionId, authorId: studentIds[index + 1], content, context,
    closure: index === 4 ? 'open' : 'closed', cognitive: 'factual', inquiryType: 'factual',
    source: 'STUDENT', isPublic: false, flagged: true,
    flagReason: `시연용 · ${reason} · 교사 확인 필요`,
    createdAt, updatedAt: createdAt,
  }));
}

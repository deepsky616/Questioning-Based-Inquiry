const studentFields = ['summary', 'insights', 'relevanceInsights', 'growthInsights', 'rewriteExample'];
const classFields = ['summary', 'insights', 'commentInsights', 'engagementInsights', 'relevanceInsights', 'balanceInsights', 'bestQuestion', 'nextQuestions'];

// 시연의 2,048 토큰 제한 안에서도 생각 과정 뒤에 완성된 분석 객체를 받을 수 있게 한다.
// 참고: https://ai.google.dev/gemini-api/docs/generate-content/thinking
// 참고: https://ai.google.dev/gemini-api/docs/generate-content/structured-output
export function reportAnalysisOutput(scope: 'student' | 'class') {
  const fields = scope === 'student' ? studentFields : classFields;
  return {
    thinkingBudget: 512,
    responseMimeType: 'application/json',
    responseJsonSchema: {
      type: 'object',
      properties: {
        ...Object.fromEntries(fields.map(field => [field, {
          type: 'string',
          description: field === 'rewriteExample' || field === 'bestQuestion' || field === 'nextQuestions'
            ? '질문 예시 하나와 간단한 설명. 160자 이내.'
            : '제공된 활동에 근거한 핵심 내용. 80자 이내의 한두 문장.',
        }])),
        ...(scope === 'class' ? { themes: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 } } : {}),
      },
      required: [...fields, ...(scope === 'class' ? ['themes'] : [])],
      additionalProperties: false,
    },
  };
}

export function conciseReportPrompt(prompt: string): string {
  return `${prompt}\n\n[응답 길이와 완성 형식]\n분석 항목은 모두 포함하되, 각 설명은 80자 이내의 한두 문장으로 간결하게 작성하세요. 질문 인용·고쳐 쓰기·다음 질문은 각각 예시 하나만 160자 이내로 제시하세요. 핵심 주제는 짧은 낱말 세 개 이내로 적으세요. 문장 수를 길게 요구한 앞 지시보다 이 길이 지시를 우선하고, 마지막 항목과 닫는 중괄호까지 완성된 JSON 객체만 반환하세요.`;
}

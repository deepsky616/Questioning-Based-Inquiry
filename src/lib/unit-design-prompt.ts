import { z } from "zod";

export const unitDesignGenerateSchema = z.object({
  step: z.enum(["keywords", "sentences", "questions", "inquiry", "student_guides", "learning_guides", "recommend_achievements", "recommend_by_unit"]),
  subject: z.string(),
  gradeRange: z.string(),
  area: z.string(),
  unitName: z.string().optional(),
  coreIdea: z.string().optional().default(""),
  knowledgeItems: z.array(z.string()).optional().default([]),
  processItems: z.array(z.string()).optional().default([]),
  valueItems: z.array(z.string()).optional().default([]),
  achievements: z.array(z.object({ code: z.string(), content: z.string() })).optional().default([]),
  selectedKeywords: z.array(z.string()).optional().default([]),
  coreSentences: z.array(z.string()).optional().default([]),
  essentialQuestions: z.array(z.string()).optional().default([]),
  context: z.string().optional(),
  selectedContentItems: z.array(z.string()).optional().default([]),
  achievementExplanations: z.record(z.string()).optional().default({}),
  achievementConsiderations: z.array(z.string()).optional().default([]),
  inquiryQuestions: z.array(z.object({
    type: z.enum(["factual", "conceptual", "controversial"]),
    content: z.string().trim().min(1),
  })).optional(),
});

export function buildPrompt(data: z.infer<typeof unitDesignGenerateSchema>): string {
  const gradeLabel = `초등학교 ${data.gradeRange}학년군`;
  const achievementsSummary = data.achievements
    .slice(0, 12)
    .map((a) => `${a.code} ${a.content}`)
    .join("\n");
  const selectedCodes = new Set(data.achievements.map((achievement) => achievement.code));
  const explanationContext = Object.entries(data.achievementExplanations ?? {})
    .filter(([code]) => selectedCodes.has(code))
    .slice(0, 8)
    .map(([code, exp]) => `${code}: ${(exp as string).substring(0, 220)}`)
    .join("\n");
  const considerationContext = (data.achievementConsiderations ?? [])
    .slice(0, 6)
    .join("\n");
  const achievementSupportContext = `${achievementsSummary ? `[선택 성취기준]\n${achievementsSummary}` : ""}
${explanationContext ? `[선택 성취기준 해설]\n${explanationContext}` : ""}
${considerationContext ? `[성취기준 적용 시 고려 사항]\n${considerationContext}` : ""}`.trim();

  if (data.step === "recommend_by_unit") {
    const allAchs = data.achievements.map((a) => `${a.code}: ${a.content}`).join("\n");
    const numbered = (items: string[]) => items.map((it, i) => `${i}. ${it}`).join("\n");
    return `당신은 2022 개정 교육과정 전문가입니다.
교사가 교과서 단원명을 입력했습니다. 이 단원과 관련성이 높은 항목만 아래 목록에서 골라 추천하세요.
반드시 아래 제공된 목록 안에서만 선택하고, 새로 만들어내지 마세요.

[교과] ${data.subject}  [영역] ${data.area}  [학년군] ${gradeLabel}
[교과서 단원명] ${data.unitName ?? ""}

[해당 영역의 성취기준]
${allAchs || "(없음)"}

[지식·이해 항목]
${numbered(data.knowledgeItems) || "(없음)"}

[과정·기능 항목]
${numbered(data.processItems) || "(없음)"}

[가치·태도 항목]
${numbered(data.valueItems) || "(없음)"}

규칙:
- 성취기준은 위 목록의 코드만 사용. 단원과 직접 관련된 것만, 최소 1개(없으면 빈 배열).
- 지식·이해/과정·기능/가치·태도는 위 번호(인덱스)로만 선택. 관련성 높은 것만.
- 관련 항목이 없으면 해당 배열은 비웁니다.

아래 JSON만 출력 (다른 텍스트 없이):
{"recommendedCodes": ["[예시코드-01]"], "knowledgeIdx": [0], "processIdx": [], "valueIdx": [0]}`;
  }

  if (data.step === "recommend_achievements") {
    const allAchs = data.achievements
      .map((a) => `${a.code}: ${a.content}`)
      .join("\n");
    return `당신은 2022 개정 교육과정 전문가입니다.
교사가 수업에서 중점적으로 다루고자 하는 내용 요소를 선택했습니다.
선택한 내용 요소와 관련성이 높은 성취기준만 추천하세요.

[교과] ${data.subject}  [영역] ${data.area}  [학년군] ${gradeLabel}

[교사가 선택한 내용 요소]
${data.selectedContentItems.join(", ")}

[해당 영역의 성취기준]
${allAchs}

관련성이 높은 성취기준 코드만 선택하세요. 최소 1개 이상, 너무 많이 고르지 마세요.
내용 요소와 직접 연관된 성취기준을 우선 선택하되, 관련성이 낮은 것은 제외하세요.

아래 JSON만 출력 (다른 텍스트 없이):
{"recommendedCodes": ["[예시코드-01]", "[예시코드-02]"]}`;
  }

  if (data.step === "keywords") {
    return `당신은 2022 개정 교육과정 전문가입니다.
아래 교육과정 데이터에서 ${gradeLabel} 학생이 깊이있게 탐구해야 할 핵심어(개념)를 5~8개 추천하세요.

[교과] ${data.subject}  [영역] ${data.area}  [학년군] ${gradeLabel}
[핵심아이디어]
${data.coreIdea}
[지식·이해] ${data.knowledgeItems.slice(0, 10).join(", ")}
[과정·기능] ${data.processItems.slice(0, 8).join(", ")}
[가치·태도] ${data.valueItems.slice(0, 6).join(", ")}
${achievementSupportContext}

조건:
- 교과 고유의 핵심 개념 중심 (단순 사실 정보 X)
- 학생이 탐구를 통해 스스로 구성해야 하는 개념
- 3단어 이내 명사구
- 교사가 선택한 성취기준, 성취기준 해설, 적용 시 고려 사항을 우선 반영

아래 JSON만 출력 (다른 텍스트 없이):
{"keywords": ["개념1", "개념2", "개념3", "개념4", "개념5"]}`;
  }

  if (data.step === "sentences") {
    return `당신은 2022 개정 교육과정 전문가입니다.
아래 핵심어를 바탕으로 ${gradeLabel}에 맞는 핵심 문장을 2~3개 작성하세요.

[교과] ${data.subject}  [영역] ${data.area}
[핵심아이디어] ${data.coreIdea.split("\n")[0]}
[선택 성취기준 기반 맥락]
${achievementSupportContext}
[선택한 핵심어] ${data.selectedKeywords.join(", ")}
${data.context ? `[수업 맥락] ${data.context}` : ""}

재진술 원칙:
① 시·공간 초월 현재형 ("~한다")
② 특정 집단 한정 표현 금지
③ 가치 중립적 표현 사용
④ '왜?/어떻게?'를 생각해 2수준으로 심화

아래 JSON만 출력:
{"sentences": ["핵심 문장1", "핵심 문장2"]}`;
  }

  if (data.step === "questions") {
    return `당신은 수업 설계 전문가입니다.
아래 핵심 문장에서 단원 전체를 관통하는 핵심 질문을 1~2개 도출하세요.

[교과] ${data.subject}  [영역] ${data.area}  [학년군] ${gradeLabel}
[선택 성취기준 기반 맥락]
${achievementSupportContext}
[핵심 문장]
${data.coreSentences.map((s, i) => `${i + 1}. ${s}`).join("\n")}

핵심 질문 조건:
- 개방형: "왜?", "어떻게?", "어떤 의미인가?" 형태
- 단원 전체를 관통하는 본질적 물음
- 하나의 정답 없이 반복 탐구 가치가 있는 질문
- 특정 사실이나 시기에 한정하지 않음
- 학생의 삶과 연결될 수 있는 질문

아래 JSON만 출력:
{"questions": ["핵심 질문1", "핵심 질문2"]}`;
  }

  if (data.step === "student_guides") {
    const questions = (data.inquiryQuestions ?? [])
      .map((question, index) => `${index}. [${question.type}] ${question.content}`)
      .join("\n");
    return `당신은 학생의 탐구를 돕는 수업 설계 전문가입니다.
아래 탐구 질문마다 ${gradeLabel} 학생이 질문을 이해하고 스스로 생각을 시작하도록 짧은 안내를 만드세요.

[교과] ${data.subject}  [영역] ${data.area}  [학년군] ${gradeLabel}
[탐구 질문 원문]
${questions}

작성 규칙:
- 질문 원문을 바꾸거나 다시 쓰지 마세요.
- 정답이나 특정 입장을 제시하지 마세요.
- meaning은 질문이 무엇을 묻는지 학생 눈높이 한 문장으로 설명하세요.
- keywords는 꼭 알아야 하는 낱말만 0~3개 고르고, 뜻을 쉽게 설명하세요.
- thinkingStart는 답이 아니라 처음 살펴볼 자료, 관점, 비교 대상을 한 문장으로 제안하세요.
- 질문마다 원래 순서와 같은 index를 사용하세요.

아래 JSON만 출력:
{"guides":[
  {"index":0,"meaning":"...","keywords":[{"term":"...","meaning":"..."}],"thinkingStart":"..."}
]}`;
  }

  if (data.step === "learning_guides") {
    const inquiryQuestions = (data.inquiryQuestions ?? [])
      .map((question, index) => `${index}. [${question.type}] ${question.content}`)
      .join("\n");
    const achievementGuidesExample = JSON.stringify(
      data.achievements.map((_, index) => ({ index, explanation: "..." })),
    );
    return `당신은 학생의 이해와 탐구를 돕는 수업 설계 전문가입니다.
아래 원문을 바꾸지 않고 ${gradeLabel} 학생을 위한 짧은 이해 자료를 만드세요.

[교과] ${data.subject}  [영역] ${data.area}  [학년군] ${gradeLabel}
[선택한 핵심어] ${data.selectedKeywords.join(", ") || "(선택한 핵심어 없음)"}
[핵심 아이디어]
${data.coreIdea}
[성취기준]
${data.achievements.map((item, index) => `${index}. ${item.code} ${item.content}`).join("\n")}
[핵심 문장]
${data.coreSentences.map((item, index) => `${index}. ${item}`).join("\n")}
[핵심 질문]
${data.essentialQuestions.map((item, index) => `${index}. ${item}`).join("\n")}
[탐구 질문]
${inquiryQuestions}

작성 규칙:
- 모든 원문을 바꾸지 마세요.
- 정답이나 결론을 제시하지 마세요.
- coreIdea.explanation은 핵심 아이디어를 학생 눈높이 1~2문장으로 풀어 쓰세요.
- coreIdea.lifeConnection은 생활 속 익숙한 사례 하나만 제시하세요.
- coreIdea.keywords는 선택한 핵심어를 우선해 학생이 꼭 알아야 할 서로 다른 핵심 낱말을 3~5개 만들고 모든 낱말에 쉬운 뜻을 붙이세요.
- achievements는 모든 성취기준에 대해 쉬운 설명을 하나씩 만드세요. 학생이 무엇을 배우고 해 볼지 알 수 있게 쓰고 0부터 시작하는 원래 index를 빠짐없이 유지하세요.
- coreSentences는 모든 원문에 대해 쉬운 표현을 하나씩 만들고 0부터 시작하는 원래 index를 빠짐없이 유지하세요.
- essentialQuestions는 모든 원문에 대해 thinkingFocus 한 문장과 perspectives 2~3개를 만들고 원래 index를 빠짐없이 유지하세요.
- guides는 모든 탐구 질문에 대해 원문과 같은 index, meaning, 서로 다른 핵심 낱말 2~5개와 쉬운 뜻, thinkingStart를 빠짐없이 만드세요.

아래 JSON만 출력:
{"learningGuides":{"coreIdea":{"explanation":"...","lifeConnection":"...","keywords":[{"term":"핵심 낱말 1","meaning":"첫 번째 핵심 낱말의 쉬운 뜻"},{"term":"핵심 낱말 2","meaning":"두 번째 핵심 낱말의 쉬운 뜻"},{"term":"핵심 낱말 3","meaning":"세 번째 핵심 낱말의 쉬운 뜻"}]},"achievements":${achievementGuidesExample},"coreSentences":[{"index":0,"explanation":"..."}],"essentialQuestions":[{"index":0,"thinkingFocus":"...","perspectives":["...","..."]}]},"guides":[{"index":0,"meaning":"...","keywords":[{"term":"질문 낱말 1","meaning":"첫 번째 질문 낱말의 쉬운 뜻"},{"term":"질문 낱말 2","meaning":"두 번째 질문 낱말의 쉬운 뜻"}],"thinkingStart":"..."}]}`;
  }

  return `당신은 수업 설계 전문가입니다.
아래 교육과정 분석, 성취기준, 핵심어, 핵심 문장, 핵심 질문을 종합해 탐구 질문을 세 유형으로 생성하세요.

[교과] ${data.subject}  [영역] ${data.area}  [학년군] ${gradeLabel}
[선택 성취기준 기반 맥락]
${achievementSupportContext}
[선택한 핵심어] ${data.selectedKeywords.join(", ")}
[선택 핵심 문장]
${data.coreSentences.map((s, i) => `${i + 1}. ${s}`).join("\n")}
[선택 핵심 질문]
${data.essentialQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

탐구 질문 유형 및 수:
- factual (사실적): 사실·정보 확인·기억 → 3~4개
- conceptual (개념적): 추론·비교·분석·해석 → 3~4개
- controversial (논쟁적): 판단·의견·가치·적용 → 정확히 2개

각 탐구 질문은 핵심 질문에 가까워지는 '징검다리' 역할을 해야 합니다.

아래 JSON만 출력:
{"inquiryQuestions":[
  {"type":"factual","content":"..."},
  {"type":"conceptual","content":"..."},
  {"type":"controversial","content":"..."}
]}`;
}

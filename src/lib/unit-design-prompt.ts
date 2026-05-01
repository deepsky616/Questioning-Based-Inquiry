import { z } from "zod";

export const unitDesignGenerateSchema = z.object({
  step: z.enum(["keywords", "sentences", "questions", "inquiry", "recommend_achievements"]),
  subject: z.string(),
  gradeRange: z.string(),
  area: z.string(),
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

  return `당신은 수업 설계 전문가입니다.
아래 핵심 질문에 도달하기 위한 탐구 질문을 세 유형으로 생성하세요.

[교과] ${data.subject}  [영역] ${data.area}  [학년군] ${gradeLabel}
[선택 성취기준 기반 맥락]
${achievementSupportContext}
[핵심 질문]
${data.essentialQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

탐구 질문 유형 및 수:
- factual (사실적): 사실·정보 확인·기억 → 2~3개
- conceptual (개념적): 추론·비교·분석·해석 → 2~3개
- controversial (논쟁적): 판단·의견·가치·적용 → 2~3개

각 탐구 질문은 핵심 질문에 가까워지는 '징검다리' 역할을 해야 합니다.

아래 JSON만 출력:
{"inquiryQuestions": [
  {"type": "factual", "content": "..."},
  {"type": "factual", "content": "..."},
  {"type": "conceptual", "content": "..."},
  {"type": "conceptual", "content": "..."},
  {"type": "controversial", "content": "..."},
  {"type": "controversial", "content": "..."}
]}`;
}

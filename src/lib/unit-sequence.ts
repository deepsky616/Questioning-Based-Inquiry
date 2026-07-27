export const UNIT_FLOW_GROUPS = [
  {
    group: "1 그룹: 가장 보편적인 기본 흐름",
    flows: [
      {
        id: "cognitive-development",
        title: "인지적 발달 흐름",
        axis: "낮은 사고 ↔ 높은 사고",
        description: "무엇(What) 사실 확인에서 왜/어떻게(Why/How), 만약 ~라면(What if) 창의·융합 질문으로 확장",
      },
      {
        id: "scale-expansion",
        title: "시공간 및 규모의 확장 흐름",
        axis: "가까운 곳 ↔ 먼 곳",
        description: "학생 자신과 교실에서 지역사회, 국가, 세계와 미래로 시야를 넓힘",
      },
      {
        id: "prerequisite",
        title: "의존성 및 선수 학습 흐름",
        axis: "기반 지식 ↔ 심화 응용",
        description: "먼저 해결해야 할 기반 질문을 앞에 두고 심화 응용 질문으로 진행",
      },
    ],
  },
  {
    group: "2 그룹: 탐구 및 문제 해결 중심 흐름",
    flows: [
      {
        id: "problem-solving",
        title: "문제 해결 프로세스 흐름",
        axis: "현상 ↔ 해결책",
        description: "문제 발견, 원인 분석, 대안 탐색, 실천과 평가 순서로 배열",
      },
      {
        id: "inquiry-method",
        title: "탐구 기능 및 방법론적 흐름",
        axis: "데이터 수집 ↔ 결론 도출",
        description: "가설 설정, 실험 설계, 데이터 수집과 분석, 결론 도출 절차를 따름",
      },
      {
        id: "misconception",
        title: "인지적 갈등 및 오개념 깨기 흐름",
        axis: "도전 ↔ 재구성",
        description: "상식을 흔드는 질문으로 시작해 탐구를 통해 개념을 재구성",
      },
    ],
  },
  {
    group: "3 그룹: 관점 및 내러티브 중심 흐름",
    flows: [
      {
        id: "perspectives",
        title: "쟁점 및 다각적 관점 흐름",
        axis: "찬반 ↔ 관점 정립",
        description: "사실 파악, 이해관계자 관점 분석, 자기 관점 정립으로 진행",
      },
      {
        id: "narrative",
        title: "내러티브 및 스토리텔링 흐름",
        axis: "기승전결",
        description: "이야기나 역사적 사건의 흐름처럼 몰입도 있게 질문을 배치",
      },
      {
        id: "media-context",
        title: "매체 및 텍스트 융합 흐름",
        axis: "텍스트 ↔ 컨텍스트",
        description: "작품 이해, 시대·사회 배경, 학생 삶으로의 수용과 생산 순서",
      },
      {
        id: "bottom-up",
        title: "학생 관심도 및 교육과정 매핑",
        axis: "Bottom-Up 분류",
        description: "학생 질문을 먼저 유목화하고 교육과정 성취기준 흐름과 맞춰 순서를 잡음",
      },
    ],
  },
] as const;

export const UNIT_FLOW_OPTIONS = UNIT_FLOW_GROUPS.flatMap((group) =>
  group.flows.map((flow) => ({ ...flow, group: group.group })),
);

export type UnitFlowId = (typeof UNIT_FLOW_OPTIONS)[number]["id"];

export interface SequenceInputQuestion {
  id?: string;
  content: string;
  cognitive?: string | null;
  context?: string | null;
  source?: "student" | "teacher";
}

export interface SequencedQuestion {
  id: string;
  type: string;
  content: string;
  source: "student" | "teacher";
  contentGroup: string;
  priority: number;
  lessonPhase: string;
  rationale: string;
  flowId?: string;
  flowTitle?: string;
  flowAxis?: string;
  /** 묶기(merge)로 이 대표 질문에 합쳐진 원본 질문 내용들(검토 표시용) */
  mergedFrom?: string[];
}

const QUESTION_WORD_SCORE = [
  { words: ["무엇", "어디", "언제", "누구", "몇", "어떤"], score: 10, phase: "기초 개념 확인" },
  { words: ["왜", "어떻게", "차이", "비슷", "원인", "이유"], score: 30, phase: "관계와 원리 탐구" },
  { words: ["문제", "해결", "방법", "대안", "실천", "줄일"], score: 50, phase: "문제 해결 설계" },
  { words: ["만약", "하면", "미래", "새로운", "바꿀", "만들"], score: 70, phase: "확장과 적용" },
  { words: ["좋을까", "옳", "찬성", "반대", "필요", "가치"], score: 80, phase: "판단과 관점 정립" },
];

const COGNITIVE_SCORE: Record<string, number> = {
  factual: 10,
  conceptual: 40,
  controversial: 75,
};

export function getUnitFlow(flowId: string | undefined) {
  return UNIT_FLOW_OPTIONS.find((flow) => flow.id === flowId) ?? UNIT_FLOW_OPTIONS[0];
}

export function inferContentGroup(content: string): string {
  const normalized = content.replace(/[?!.,;:()[\]{}'"“”‘’]/g, " ").trim();
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.replace(/(은|는|이|가|을|를|에|의|와|과|로|으로|에서|에게)$/, ""))
    .filter((token) => token.length >= 2);

  const stopWords = new Set(["무엇", "어떻게", "어디", "언제", "왜", "우리", "학생", "질문", "있을까", "있나요", "되나요"]);
  const candidate = tokens.find((token) => !stopWords.has(token));
  return candidate ? `${candidate} 관련 질문` : "공통 탐구 질문";
}

export function fallbackSequenceQuestions(
  questions: SequenceInputQuestion[],
  flowId: string,
): SequencedQuestion[] {
  const flow = getUnitFlow(flowId);
  const scored = questions
    .map((question, index) => {
      const content = question.content.trim();
      const wordHit = QUESTION_WORD_SCORE.find((entry) => entry.words.some((word) => content.includes(word)));
      const cognitiveScore = question.cognitive ? COGNITIVE_SCORE[question.cognitive] ?? 35 : 35;
      let flowBias = 0;

      if (flow.id === "problem-solving" && /문제|원인|해결|대안|실천|평가/.test(content)) flowBias -= 12;
      if (flow.id === "inquiry-method" && /가설|실험|자료|데이터|관찰|분석|결론/.test(content)) flowBias -= 12;
      if (flow.id === "perspectives" && /찬성|반대|입장|관점|의견|좋을까/.test(content)) flowBias -= 10;
      if (flow.id === "scale-expansion" && /나|우리|학교|마을|지역|나라|세계|미래/.test(content)) {
        const scale = ["나", "우리", "학교", "마을", "지역", "나라", "세계", "미래"].findIndex((word) => content.includes(word));
        flowBias += Math.max(scale, 0) * 6;
      }
      if (flow.id === "misconception" && /정말|항상|반드시|왜/.test(content)) flowBias -= 14;

      return {
        question,
        index,
        phase: wordHit?.phase ?? (cognitiveScore < 30 ? "기초 개념 확인" : "관계와 원리 탐구"),
        score: Math.min(wordHit?.score ?? cognitiveScore, cognitiveScore) + flowBias,
      };
    })
    .sort((a, b) => a.score - b.score || a.index - b.index);

  return scored.map(({ question, phase }, index) => ({
    id: question.id ?? `manual-${index + 1}`,
    type: question.cognitive ?? "student",
    content: question.content.trim(),
    source: question.source ?? "student",
    contentGroup: inferContentGroup(question.content),
    priority: index + 1,
    lessonPhase: phase,
    rationale: `${flow.title} 기준에 따라 기초 확인, 원리 탐구, 적용·판단 질문 순서로 배치했습니다.`,
    flowId: flow.id,
    flowTitle: flow.title,
    flowAxis: flow.axis,
  }));
}

export function buildSequencePrompt(params: {
  flowId: string;
  subject: string;
  topic: string;
  questions: SequenceInputQuestion[];
  mode?: "merge" | "sort";
}) {
  const mode = params.mode ?? "sort";
  const selectedFlow = getUnitFlow(params.flowId);
  const criteria = UNIT_FLOW_GROUPS.map((group) => {
    const flows = group.flows
      .map((flow, index) => `${index + 1}. ${flow.title} (${flow.axis}): ${flow.description}`)
      .join("\n");
    return `${group.group}\n${flows}`;
  }).join("\n\n");

  const questionList = params.questions
    .map((question, index) => `${index + 1}. [id=${question.id ?? `manual-${index + 1}`}] [인지=${question.cognitive ?? "unknown"}] ${question.content}`)
    .join("\n");

  const intro = mode === "merge"
    ? "학생들이 만든 비슷한 질문들을 그 내용을 아우르는 하나의 대표 질문으로 통합하고, 교사가 선택한 단원 설계 흐름에 따라 수업 순서를 정하세요."
    : "학생들이 만든 질문을 비슷한 내용끼리 유목화하고, 교사가 선택한 단원 설계 흐름에 따라 수업 순서 우선순위를 정하세요.";

  return `당신은 학생 질문 기반 단원 설계 전문가입니다.
${intro}

[교과] ${params.subject || "미지정"}
[단원/주제] ${params.topic || "미지정"}

[사용 가능한 단원 설계 기준]
${criteria}

[이번 설계에 적용할 기준]
${selectedFlow.title} (${selectedFlow.axis})
${selectedFlow.description}

[학생 및 교사 추가 질문]
${questionList}

${mode === "merge"
  ? `작업 규칙:
- 주제·소재·답이 겹치는 질문들은 적극적으로 하나의 대표 질문으로 통합하세요. 목표는 원본보다 눈에 띄게 적은 대표 질문 목록입니다(예: 10개 → 4~6개). 정말 성격이 다른 질문만 그대로 남기세요.
- 대표 질문의 content는 묶인 질문들의 공통 관심사를 관통하는, 간결하고 자연스러운 한 문장의 질문이어야 합니다.
- 여러 질문의 문장을 그대로 이어 붙이거나 나열하지 마세요. 세부 표현은 생략하고, 공통된 핵심을 아우르는 상위 질문 한 문장으로 다시 표현하세요.
- content는 물음표로 끝나는 하나의 질문 문장으로 작성하세요.
- 모든 출력 질문에 mergedFrom 배열을 반드시 포함하세요: 그 대표 질문에 묶인 원본 질문들의 id 목록입니다. 묶지 않고 그대로 남긴 질문도 자기 자신의 id 1개를 넣으세요. 모든 원본 id가 정확히 한 번씩 어떤 mergedFrom에든 포함되어야 합니다.
- contentGroup에는 어떤 주제로 묶었는지 쓰세요.
- priority는 실제 수업 순서이며 1부터 연속된 숫자로 부여하세요.
- lessonPhase는 12자 이내 한국어, rationale은 한 문장, type은 factual/conceptual/controversial/student 중 가장 가까운 값.`
  : `작업 규칙:
- 질문은 의미가 비슷하면 같은 contentGroup으로 묶으세요.
- 모든 질문을 빠짐없이 포함하세요.
- priority는 실제 수업 순서이며 1부터 연속된 숫자로 부여하세요.
- lessonPhase는 해당 질문이 수업에서 맡는 역할을 12자 이내 한국어로 쓰세요.
- rationale은 왜 그 위치인지 한 문장으로 설명하세요.
- type은 factual, conceptual, controversial, student 중 가장 가까운 값을 쓰세요.`}

아래 JSON만 출력하세요:
{"sequencedQuestions":[
  {"id":"질문 id","type":"factual","content":"질문 내용","source":"student","contentGroup":"내용 묶음","priority":1,"lessonPhase":"기초 확인","rationale":"배치 이유"${mode === "merge" ? ',"mergedFrom":["원본 질문 id","원본 질문 id"]' : ""}}
]}`;
}

/**
 * AI 응답(sequencedQuestions)을 방어적으로 정규화한다.
 * 잘못된 항목 제거, 원본 id 되매핑, mergedFrom 검증, priority 재부여.
 * (Next 라우트 파일은 임의 export를 금지하므로 lib에 위치 — 라우트·테스트가 공유)
 */
export function normalizeSequencedQuestions(
  value: unknown,
  sourceQuestions: SequenceInputQuestion[],
  mode: "merge" | "sort" = "sort",
  flowId?: string,
): SequencedQuestion[] {
  if (!Array.isArray(value)) return [];
  const sourceById = new Map(sourceQuestions.map((question) => [question.id, question]));
  const flow = flowId ? getUnitFlow(flowId) : null;

  return value
    .map<SequencedQuestion | null>((item, index) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      // 통합(merge) 모드에서는 새 통합 질문이므로 원본 id가 없으면 새 id를 부여한다
      const id = typeof raw.id === "string" ? raw.id : (mode === "merge" ? `merged-${index + 1}` : sourceQuestions[index]?.id);
      const source = id ? sourceById.get(id) : undefined;
      const content = typeof raw.content === "string" ? raw.content : source?.content;
      if (!id || !content) return null;

      // 묶기 추적: AI가 돌려준 원본 질문 id들을 검증해 원본 내용으로 되매핑(검토 표시용)
      const mergedFrom =
        mode === "merge" && Array.isArray(raw.mergedFrom)
          ? raw.mergedFrom
              .map((mid) => (typeof mid === "string" ? sourceById.get(mid)?.content : undefined))
              .filter((c): c is string => Boolean(c))
          : undefined;

      return {
        id,
        ...(mergedFrom && mergedFrom.length > 0 ? { mergedFrom } : {}),
        type: typeof raw.type === "string" ? raw.type : source?.cognitive ?? "student",
        content,
        source: raw.source === "teacher" ? "teacher" : source?.source ?? "student",
        contentGroup: typeof raw.contentGroup === "string" && raw.contentGroup.trim()
          ? raw.contentGroup.trim()
          : "공통 탐구 질문",
        priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : index + 1,
        lessonPhase: typeof raw.lessonPhase === "string" && raw.lessonPhase.trim()
          ? raw.lessonPhase.trim()
          : "탐구",
        rationale: typeof raw.rationale === "string" && raw.rationale.trim()
          ? raw.rationale.trim()
          : "단원 설계 흐름에 맞춰 배치했습니다.",
        ...(flow
          ? {
              flowId: flow.id,
              flowTitle: flow.title,
              flowAxis: flow.axis,
            }
          : {}),
      } satisfies SequencedQuestion;
    })
    .filter((item): item is SequencedQuestion => item !== null)
    .sort((a, b) => a.priority - b.priority)
    .map((item, index) => ({ ...item, priority: index + 1 }));
}

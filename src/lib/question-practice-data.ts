/**
 * 학생 질문 연습 문항 은행.
 *
 * 근거 자료:
 * - 교육부, 「2025 초등 깊이있는 수업을 위한 질문기반 탐구수업」
 *   (닫힌/열린 질문 정의·전환 예시, 사실적·개념적·논쟁적 질문의 종류와 예시,
 *    사실적→개념적→논쟁적으로 사고를 확장하는 단계 흐름)
 * - 교육부·이화여대, 「학생 질문 중심의 교과 수업 모델」
 *   (질문 분류는 근거를 설명하는 활동, 부족한 유형을 추가 생성·전환하는 연습)
 *
 * 문항 콘텐츠는 한국어 고정(게임 콘텐츠와 동일 원칙), UI 라벨만 i18n.
 */

export type Closure = "closed" | "open";
export type Cognitive = "factual" | "conceptual" | "controversial";

// ── 모드 1: 분류 연습 ─────────────────────────────────────────────

export interface PracticeQuizItem {
  id: string;
  content: string;
  closure: Closure;
  cognitive: Cognitive;
  /** 분류 근거 해설 — "정답 맞히기"가 아니라 근거를 배우는 것이 목적 */
  explanation: string;
}

export const PRACTICE_QUIZ_BANK: PracticeQuizItem[] = [
  // 사실적·닫힌 — 정보 확인(누가/무엇/언제/어디서), 용어 정의, 목록, 절차
  { id: "q01", content: "'문화유산'이란 무엇인가요?", closure: "closed", cognitive: "factual",
    explanation: "단원에서 꼭 알아야 할 용어의 뜻을 확인하는 질문이에요. 찾아보면 정해진 답이 있으니 닫힌·사실적 질문이에요." },
  { id: "q02", content: "우리 지역의 문화유산에는 무엇이 있나요?", closure: "closed", cognitive: "factual",
    explanation: "'무엇'에 해당하는 정보를 조사해 확인하는 질문이에요. 탐구의 재료를 모으는 사실적 질문이에요." },
  { id: "q03", content: "숲에 사는 동물에는 무엇이 있나요?", closure: "closed", cognitive: "factual",
    explanation: "관련된 사례를 나열하는 목록형 질문이에요. 조사하면 답을 확인할 수 있어요." },
  { id: "q04", content: "직각삼각형에서 직각은 몇 개인가요?", closure: "closed", cognitive: "factual",
    explanation: "세어 보면 하나의 정답이 나오는 사실 확인 질문이에요." },
  { id: "q05", content: "문화유산 답사 보고서는 어떤 순서로 작성하나요?", closure: "closed", cognitive: "factual",
    explanation: "정해진 과정이나 방법의 순서를 묻는 절차형 사실적 질문이에요." },
  { id: "q06", content: "프랑스 혁명은 왜 일어났나요?", closure: "closed", cognitive: "factual",
    explanation: "'왜'로 시작하지만 교과서에서 답을 확인할 수 있는 질문이에요. 질문의 모양이 아니라 요구되는 생각이 기준이에요." },
  { id: "q07", content: "광합성에 필요한 세 가지는 무엇인가요?", closure: "closed", cognitive: "factual",
    explanation: "배운 정보를 기억에서 꺼내 확인하는 질문이에요. 답이 정해져 있어요." },
  { id: "q08", content: "영화 포스터에 적힌 제목은 무엇인가요?", closure: "closed", cognitive: "factual",
    explanation: "보이는 정보를 그대로 확인하는 질문이라 닫힌·사실적 질문이에요." },
  { id: "q09", content: "노든은 어떤 동물 무리에서 자라났나요?", closure: "closed", cognitive: "factual",
    explanation: "책 속에서 답을 바로 찾을 수 있는 내용 확인 질문이에요." },

  // 개념적 — 관계, 깊은 왜/어떻게, 의미·가치, 적용·예측, 일반화
  { id: "q10", content: "직사각형과 정사각형은 어떤 관계에 있나요?", closure: "closed", cognitive: "conceptual",
    explanation: "두 개념 사이의 관계(포함 관계)를 파악해야 하는 개념적 질문이에요. 답은 수학적으로 정해져 있어 닫힌 질문이에요." },
  { id: "q11", content: "동물들이 환경에 따라 다른 특징을 가지는 이유는 무엇인가요?", closure: "open", cognitive: "conceptual",
    explanation: "사실들을 연결해 원인과 원리를 생각해야 하는 개념적 질문이에요. 여러 갈래로 설명할 수 있어 열린 질문이에요." },
  { id: "q12", content: "생물 다양성은 생태계에 어떤 의미를 갖나요?", closure: "open", cognitive: "conceptual",
    explanation: "어떤 것이 갖는 의미와 중요성을 해석하는 개념적 질문이에요." },
  { id: "q13", content: "문화유산은 미래에 어떤 영향을 주나요?", closure: "open", cognitive: "conceptual",
    explanation: "배운 개념을 새로운 상황(미래)에 적용해 예측하는 개념적 질문이에요." },
  { id: "q14", content: "여러 문화유산에서 공통으로 발견할 수 있는 가치는 무엇인가요?", closure: "open", cognitive: "conceptual",
    explanation: "여러 사례에서 공통 원리를 끌어내는 일반화 질문이라 개념적 질문이에요." },
  { id: "q15", content: "노든은 왜 지평선을 자신의 바다라고 말했을까요?", closure: "open", cognitive: "conceptual",
    explanation: "책에 답이 그대로 나오지 않아 인물의 마음을 추론해야 해요. 답이 여럿 나올 수 있는 열린·개념적 질문이에요." },
  { id: "q16", content: "포스터 속 두 인물은 어떤 이야기를 나누는 중일까요?", closure: "open", cognitive: "conceptual",
    explanation: "보이는 장면을 근거로 상황을 추론하는 질문이에요. 다양한 답이 가능해요." },
  { id: "q17", content: "소비자의 수가 많아진 까닭은 무엇일까요?", closure: "open", cognitive: "conceptual",
    explanation: "'많아졌니?'라는 확인 질문을 원인을 탐구하는 질문으로 바꾼 것이에요. 개념적 사고가 필요해요." },
  { id: "q18", content: "어린 펭귄이 '코뿔소로 살겠다'고 한 것은 어떤 의미라고 생각하나요?", closure: "open", cognitive: "conceptual",
    explanation: "말 속에 숨은 의미를 해석하는 질문이에요. 자기 생각에 따라 답이 달라질 수 있어요." },

  // 논쟁적 — 찬반·관점, 가치 판단·우선순위, 해결책, 미래·책임, 만약~라면
  { id: "q19", content: "문화유산 보호를 위해 일반인의 출입을 제한하는 것은 정당할까요?", closure: "open", cognitive: "controversial",
    explanation: "찬성과 반대가 모두 가능한 쟁점에 대해 자기 기준으로 판단해야 하는 논쟁적 질문이에요." },
  { id: "q20", content: "생물 다양성과 인간의 편리함 중 어떤 가치를 우선해야 할까요?", closure: "open", cognitive: "controversial",
    explanation: "두 가치가 부딪히는 상황에서 우선순위를 판단하는 논쟁적 질문이에요." },
  { id: "q21", content: "문화유산으로 지역 경제를 활성화하는 가장 좋은 방법은 무엇일까요?", closure: "open", cognitive: "controversial",
    explanation: "여러 해결책 중 최선을 고르고 근거를 세워야 하는 논쟁적 질문이에요." },
  { id: "q22", content: "만약 우리 동네에 새 건물을 지어야 하는데 그 자리에 문화유산이 있다면 어떻게 해야 할까요?", closure: "open", cognitive: "controversial",
    explanation: "'만약 ~라면?' 가정 상황에서 서로 다른 입장을 비교하고 판단하는 논쟁적 질문이에요." },
  { id: "q23", content: "평면도형 중 어떤 도형이 일상생활에서 가장 필요하다고 생각하나요?", closure: "open", cognitive: "controversial",
    explanation: "정답이 없고 자신의 기준과 이유가 중요한 가치 판단 질문이에요." },
  { id: "q24", content: "생물 다양성이 파괴된다면 미래 세대는 어떤 어려움을 겪을까요?", closure: "open", cognitive: "controversial",
    explanation: "미래를 예측하고 책임을 생각하게 하는 논쟁적 질문이에요." },

  // ── 확장 문항(교과 다양화) — 사실적·닫힌 ──
  { id: "q25", content: "물이 끓기 시작하는 온도는 몇 도인가요?", closure: "closed", cognitive: "factual",
    explanation: "측정하거나 찾아보면 하나의 정답(100도)이 나오는 정보 확인 질문이에요." },
  { id: "q26", content: "우리나라의 수도는 어디인가요?", closure: "closed", cognitive: "factual",
    explanation: "'어디'에 해당하는 정보를 확인하는 질문이라 답이 정해져 있어요." },
  { id: "q27", content: "이 이야기에서 사건이 일어난 곳은 어디인가요?", closure: "closed", cognitive: "factual",
    explanation: "글 안에서 답을 그대로 찾을 수 있는 내용 확인 질문이에요." },
  { id: "q28", content: "삼각형의 변은 몇 개인가요?", closure: "closed", cognitive: "factual",
    explanation: "세어 보면 하나의 정답이 나오는 사실 확인 질문이에요." },
  { id: "q29", content: "그림자는 언제 생기나요?", closure: "closed", cognitive: "factual",
    explanation: "'빛이 물체에 가려질 때'라는 정해진 답을 확인하는 질문이에요." },
  { id: "q30", content: "한글을 만든 사람은 누구인가요?", closure: "closed", cognitive: "factual",
    explanation: "'누구'에 해당하는 역사적 사실을 확인하는 질문이에요." },
  { id: "q31", content: "올챙이는 자라서 무엇이 되나요?", closure: "closed", cognitive: "factual",
    explanation: "한살이 과정의 정해진 사실을 확인하는 질문이에요." },
  { id: "q32", content: "재활용 쓰레기는 어떻게 분리해서 버리나요?", closure: "closed", cognitive: "factual",
    explanation: "'어떻게'로 시작하지만 정해진 규칙(절차)을 확인하는 질문이라 사실적·닫힌 질문이에요." },
  { id: "q33", content: "지도에서 방위표가 없을 때 위쪽은 어느 방향인가요?", closure: "closed", cognitive: "factual",
    explanation: "지도의 약속(북쪽)을 확인하는 질문이라 답이 정해져 있어요." },
  { id: "q34", content: "화산이 분출할 때 나오는 물질에는 무엇이 있나요?", closure: "closed", cognitive: "factual",
    explanation: "관련된 것들을 나열하는 목록형 질문이라 조사하면 확인할 수 있어요." },
  { id: "q35", content: "주장하는 글에서 근거는 왜 필요한가요?", closure: "closed", cognitive: "factual",
    explanation: "'왜'로 시작하지만 교과서에 정리된 이유를 확인하는 질문이라 사실적 질문이에요." },

  // ── 확장 문항 — 개념적 ──
  { id: "q36", content: "계절이 바뀌면 사람들의 생활 모습은 어떻게 달라질까요?", closure: "open", cognitive: "conceptual",
    explanation: "계절 변화라는 개념을 생활에 연결해 적용하는 개념적 질문이에요." },
  { id: "q37", content: "분수와 소수는 어떤 관계가 있을까요?", closure: "closed", cognitive: "conceptual",
    explanation: "두 개념 사이의 관계를 파악해야 하는 개념적 질문이에요. 답은 수학적으로 정해져 있어 닫힌 질문이에요." },
  { id: "q38", content: "촌락과 도시는 서로 어떻게 도움을 주고받을까요?", closure: "open", cognitive: "conceptual",
    explanation: "두 지역의 관계와 상호작용을 연결해 생각하는 개념적 질문이에요." },
  { id: "q39", content: "물의 상태 변화와 빨래가 마르는 것은 어떤 관계가 있을까요?", closure: "open", cognitive: "conceptual",
    explanation: "배운 개념(증발)과 생활 현상을 연결하는 개념적 질문이에요." },
  { id: "q40", content: "주인공이 그런 선택을 한 까닭은 무엇일까요?", closure: "open", cognitive: "conceptual",
    explanation: "글에 답이 그대로 나오지 않아 인물의 마음을 추론해야 하는 개념적 질문이에요." },
  { id: "q41", content: "통신 수단의 변화는 사람들의 생활을 어떻게 바꾸었을까요?", closure: "open", cognitive: "conceptual",
    explanation: "변화의 원인과 영향을 연결해 분석하는 개념적 질문이에요." },
  { id: "q42", content: "먹이 사슬이 끊어지면 생태계에 어떤 일이 생길까요?", closure: "open", cognitive: "conceptual",
    explanation: "개념을 바탕으로 결과를 예측하는 개념적 질문이에요." },
  { id: "q43", content: "정직하게 행동하면 우리 반에 어떤 변화가 생길까요?", closure: "open", cognitive: "conceptual",
    explanation: "가치(정직)를 우리 반 상황에 적용해 예측하는 개념적 질문이에요." },
  { id: "q44", content: "막대그래프와 꺾은선그래프는 각각 어떤 경우에 더 알맞을까요?", closure: "open", cognitive: "conceptual",
    explanation: "두 개념을 비교하고 상황에 맞게 적용하는 개념적 질문이에요." },
  { id: "q45", content: "민주주의에서 투표가 중요한 까닭은 무엇일까요?", closure: "open", cognitive: "conceptual",
    explanation: "제도가 갖는 의미와 가치를 해석하는 개념적 질문이에요." },
  { id: "q46", content: "지진이 자주 나는 지역의 건물은 왜 특별하게 지어질까요?", closure: "open", cognitive: "conceptual",
    explanation: "자연 현상과 사람들의 대비 방법을 원리로 연결하는 개념적 질문이에요." },
  { id: "q47", content: "시에서 흉내 내는 말을 쓰면 어떤 느낌을 줄까요?", closure: "open", cognitive: "conceptual",
    explanation: "표현 방법이 주는 효과를 해석하는 개념적 질문이에요. 느낌은 여러 가지로 답할 수 있어요." },
  { id: "q48", content: "일회용품 사용과 환경 오염은 어떤 관계가 있을까요?", closure: "open", cognitive: "conceptual",
    explanation: "두 현상 사이의 원인과 결과를 연결하는 개념적 질문이에요." },

  // ── 확장 문항 — 논쟁적 ──
  { id: "q49", content: "학교에서 스마트폰 사용을 허용해야 할까요?", closure: "open", cognitive: "controversial",
    explanation: "찬성과 반대가 모두 가능한 쟁점을 자기 기준으로 판단하는 논쟁적 질문이에요." },
  { id: "q50", content: "급식에서 남기는 음식을 줄이는 가장 좋은 방법은 무엇일까요?", closure: "open", cognitive: "controversial",
    explanation: "여러 해결책 중 최선을 고르고 근거를 세워야 하는 논쟁적 질문이에요." },
  { id: "q51", content: "동물원은 동물을 보호하는 곳일까요, 가두는 곳일까요?", closure: "open", cognitive: "controversial",
    explanation: "하나의 대상을 서로 다른 관점에서 바라보고 판단하는 논쟁적 질문이에요." },
  { id: "q52", content: "우리 동네에 개발과 환경 보호 중 무엇이 더 필요할까요?", closure: "open", cognitive: "controversial",
    explanation: "두 가치가 부딪히는 상황에서 우선순위를 판단하는 논쟁적 질문이에요." },
  { id: "q53", content: "만약 하루 동안 전기를 쓸 수 없다면 무엇을 가장 먼저 준비해야 할까요?", closure: "open", cognitive: "controversial",
    explanation: "'만약 ~라면?' 가정 상황에서 기준을 세워 우선순위를 정하는 논쟁적 질문이에요." },
  { id: "q54", content: "친구의 잘못을 봤을 때 말하는 것과 모른 척하는 것 중 무엇이 옳을까요?", closure: "open", cognitive: "controversial",
    explanation: "가치가 충돌하는 상황에서 옳고 그름을 판단하는 논쟁적 질문이에요." },
  { id: "q55", content: "우리 지역 축제에 더 많은 사람이 오게 하는 가장 좋은 방법은 무엇일까요?", closure: "open", cognitive: "controversial",
    explanation: "정답이 없는 문제에 최선의 방안을 제안하고 설득해야 하는 논쟁적 질문이에요." },
  { id: "q56", content: "로봇이 사람의 일을 대신하는 것은 좋은 일일까요?", closure: "open", cognitive: "controversial",
    explanation: "장점과 단점을 여러 관점에서 비교하고 판단하는 논쟁적 질문이에요." },
  { id: "q57", content: "오래된 건물을 보존하는 것과 새 시설을 짓는 것 중 무엇을 우선해야 할까요?", closure: "open", cognitive: "controversial",
    explanation: "두 입장의 근거를 비교해 우선순위를 정하는 논쟁적 질문이에요." },
  { id: "q58", content: "교실에서 반려동물을 기르는 것에 찬성하나요, 반대하나요?", closure: "open", cognitive: "controversial",
    explanation: "찬반 입장을 정하고 이유를 세워야 하는 논쟁적 질문이에요." },
  { id: "q59", content: "물이 부족해진다면 물을 어떻게 나누어 써야 공평할까요?", closure: "open", cognitive: "controversial",
    explanation: "미래 상황을 가정하고 '공평함'의 기준을 스스로 세워야 하는 논쟁적 질문이에요." },
  { id: "q60", content: "숙제가 꼭 필요하다고 생각하나요?", closure: "open", cognitive: "controversial",
    explanation: "정답이 없고 자신의 경험과 기준으로 의견을 세우는 논쟁적 질문이에요." },
];

// ── 모드 2: 질문 바꾸기 ───────────────────────────────────────────

/** 전환 목표 — 닫힌→열린 / 사실적→개념적 / 개념적·사실적→논쟁적 */
export type TransformTarget = "open" | "conceptual" | "controversial";

export interface PracticeTransformItem {
  id: string;
  /** 바꾸기 전의 원본 질문(닫힌·사실적 위주) */
  source: string;
  target: TransformTarget;
  hint: string;
  /** 참고 예시 답 — 판정 후에만 보여준다 */
  example: string;
}

export const PRACTICE_TRANSFORM_BANK: PracticeTransformItem[] = [
  { id: "t01", source: "그림책 주인공의 이름은 무엇인가요?", target: "open",
    hint: "이름 확인 대신, 인물의 행동이나 마음을 생각하게 만들어 보세요.",
    example: "주인공의 행동이 어떤 결과를 가져올까요?" },
  { id: "t02", source: "소비자의 수가 많아졌나요?", target: "open",
    hint: "'예/아니오'로 끝나지 않게, 까닭이나 영향을 물어보세요.",
    example: "소비자의 수가 많아진 까닭은 무엇일까요?" },
  { id: "t03", source: "우리 지역의 문화유산에는 무엇이 있나요?", target: "conceptual",
    hint: "목록을 묻는 대신, 문화유산이 무엇을 보여주는지 물어보세요.",
    example: "문화유산은 옛사람들의 생각과 삶의 방식을 어떻게 보여줄까요?" },
  { id: "t04", source: "숲에 사는 동물에는 무엇이 있나요?", target: "conceptual",
    hint: "'무엇'에서 '왜/어떻게'로 바꿔 원인이나 원리를 물어보세요.",
    example: "동물들이 숲 환경에 알맞은 특징을 가지는 이유는 무엇일까요?" },
  { id: "t05", source: "직사각형은 각이 몇 개인가요?", target: "conceptual",
    hint: "개수 세기 대신, 다른 도형과의 관계나 성질을 물어보세요.",
    example: "직사각형과 정사각형은 어떤 관계에 있나요?" },
  { id: "t06", source: "광합성에 필요한 세 가지는 무엇인가요?", target: "conceptual",
    hint: "필요한 것을 나열하는 대신, 그것들이 어떤 역할을 하는지 연결해 보세요.",
    example: "빛의 세기가 달라지면 광합성은 어떻게 달라질까요?" },
  { id: "t07", source: "우리나라의 멸종 위기 동물에는 무엇이 있나요?", target: "controversial",
    hint: "조사로 끝나지 않게, 서로 다른 입장이 부딪히는 상황을 만들어 보세요.",
    example: "멸종 위기 동물 보호와 개발 중 어떤 가치를 우선해야 할까요?" },
  { id: "t08", source: "'문화유산'이란 무엇인가요?", target: "controversial",
    hint: "뜻풀이 대신, 찬반이 갈릴 수 있는 상황을 상상해 보세요.",
    example: "문화유산 관람료를 받는 것은 정당할까요?" },
  { id: "t09", source: "에너지를 아끼는 방법에는 무엇이 있나요?", target: "controversial",
    hint: "여러 방법 중 무엇이 최선인지, 기준을 세워 판단하게 해 보세요.",
    example: "에너지 절약을 위해 불편함을 감수해야 한다면 어디까지 받아들일 수 있을까요?" },
  { id: "t10", source: "계절이 바뀌면 나무는 어떻게 변하나요?", target: "open",
    hint: "관찰로 확인되는 사실 대신, 스스로 추론하거나 상상해야 답할 수 있게 바꿔 보세요.",
    example: "만약 계절이 바뀌지 않는다면 나무와 숲은 어떻게 될까요?" },
];

// ── 모드 3: 질문 만들기 ───────────────────────────────────────────

export interface PracticeCreateTopic {
  id: string;
  title: string;
  /** 짧은 제시문 — 이 내용을 읽고 질문을 만든다 */
  passage: string;
}

export const PRACTICE_CREATE_TOPICS: PracticeCreateTopic[] = [
  { id: "c01", title: "문화유산",
    passage: "우리 지역에는 오래된 성곽과 전통 한옥 마을이 있어요. 매년 많은 관광객이 찾아오지만, 사람들이 많이 다니면서 훼손되는 부분도 생기고 있어요." },
  { id: "c02", title: "생물 다양성",
    passage: "숲, 강, 사막, 극지방에는 서로 다른 동물과 식물이 살아요. 그런데 최근에는 서식지가 사라지거나 기후가 변하면서 사라져 가는 생물이 늘고 있어요." },
  { id: "c03", title: "평면도형",
    passage: "교실 문은 직사각형, 색종이는 정사각형, 삼각자는 직각삼각형 모양이에요. 우리 주변의 물건에는 여러 평면도형이 숨어 있어요." },
  { id: "c04", title: "긴긴밤 (그림책)",
    passage: "코뿔소 노든은 코끼리 무리에서 자랐고, 어린 펭귄은 버려진 알에서 태어났어요. 서로 다른 두 존재가 '우리'가 되어 함께 바다를 찾아 떠나요." },
  { id: "c05", title: "우리 동네",
    passage: "우리 동네에는 시장, 공원, 도서관이 있어요. 오래된 골목이 재개발로 사라진다는 소식에 주민들의 생각이 서로 달라요." },
  { id: "c06", title: "에너지와 환경",
    passage: "전기를 만들 때 온실가스가 나와요. 태양광, 풍력 같은 새로운 방법도 있지만 비용이 많이 들고 자리도 많이 차지해요." },
  { id: "c07", title: "광합성",
    passage: "식물은 빛, 물, 이산화 탄소를 이용해 스스로 양분을 만들어요. 이 과정을 광합성이라고 하고, 주로 잎에서 일어나요." },
  { id: "c08", title: "학교 급식",
    passage: "우리 학교 급식은 영양사 선생님이 영양의 균형을 생각해 식단을 짜요. 그런데 남기는 음식이 많아서 음식물 쓰레기가 고민이에요." },
];

// ── 공통 헬퍼 ────────────────────────────────────────────────────

/**
 * 셔플백 방식 출제 — 은행의 모든 문항을 한 번씩 다 내기 전에는 같은 문항이
 * 다시 나오지 않는다. 소진되면 다시 채우되, 직전 문항이 곧바로 반복되지 않게 한다.
 */
export interface DeckDraw<T> {
  item: T;
  /** 이번 사이클에서 아직 나오지 않은 문항 id 목록 */
  remaining: string[];
}

export function drawFromDeck<T extends { id: string }>(
  bank: readonly T[],
  remaining: string[],
  lastId?: string,
): DeckDraw<T> {
  let pool = remaining.filter((id) => bank.some((b) => b.id === id));
  if (pool.length === 0) {
    pool = bank.map((b) => b.id);
    if (pool.length > 1 && lastId) pool = pool.filter((id) => id !== lastId);
  }
  const pickedId = pool[Math.floor(Math.random() * pool.length)];
  const item = bank.find((b) => b.id === pickedId)!;
  return { item, remaining: pool.filter((id) => id !== pickedId) };
}

/**
 * 전환·생성 결과 판정.
 * - open: 열린 질문이면 성공
 * - conceptual: 개념적이면 성공 (더 깊은 논쟁적도 인정 — 사고 확장의 연속선)
 * - controversial: 논쟁적이어야 성공
 */
export function isTargetAchieved(
  target: TransformTarget,
  result: { closure: string; cognitive: string },
): boolean {
  if (target === "open") return result.closure === "open";
  if (target === "conceptual") return result.cognitive === "conceptual" || result.cognitive === "controversial";
  return result.cognitive === "controversial";
}

// 2022 개정 교육과정 — 바른 생활 / 슬기로운 생활 / 즐거운 생활 (1-2학년) 시드
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const AREAS = [
  // ──────────────────── 바른 생활 ────────────────────
  {
    subject: "바른 생활",
    gradeRange: "1-2",
    area: "나와 우리",
    coreIdea:
      "나를 소중히 여기며 함께 살아가는 삶은 서로에 대한 배려와 존중을 바탕으로 한다.\n가족과 친구 사이에서 규칙과 배려를 실천하며 건강한 관계를 만들어 간다.",
    knowledgeItems: ["나의 소중함", "감정 표현과 조절", "친구와의 관계", "규칙과 질서", "배려와 존중"],
    processItems: ["감정 인식하기", "규칙 지키기", "배려 실천하기", "갈등 해결하기"],
    valueItems: ["자기 존중", "배려", "공감", "협력"],
    achievements: [
      { code: "2바01-01", content: "나의 몸과 마음을 소중히 여기며 건강하게 생활한다." },
      { code: "2바01-02", content: "다른 사람과 함께 살아가는 데 필요한 규칙을 알고 지킨다." },
      { code: "2바01-03", content: "친구와 사이좋게 지내기 위해 배려와 존중을 실천한다." },
    ],
  },
  {
    subject: "바른 생활",
    gradeRange: "1-2",
    area: "자연과 더불어 사는 삶",
    coreIdea:
      "자연은 우리의 삶과 연결되어 있으며, 이를 아끼고 보호하는 마음과 실천이 필요하다.\n생명의 소중함을 알고 환경을 지키는 생활 습관을 기른다.",
    knowledgeItems: ["생명의 소중함", "자연과 나의 관계", "환경 보호", "동식물 사랑"],
    processItems: ["생명 존중 실천하기", "자연 보호 활동하기", "환경 지키는 습관 만들기"],
    valueItems: ["생명 존중", "자연 사랑", "환경 보호", "책임감"],
    achievements: [
      { code: "2바02-01", content: "생명의 소중함을 알고 동식물을 아끼며 돌본다." },
      { code: "2바02-02", content: "자연을 사랑하는 마음으로 환경을 보호하는 생활을 실천한다." },
    ],
  },
  {
    subject: "바른 생활",
    gradeRange: "1-2",
    area: "인터넷·AI와 생활",
    coreIdea:
      "디지털 기기를 바르게 사용하는 습관과 태도가 건강한 디지털 생활의 기반이 된다.\n온라인에서도 서로를 존중하고 배려하는 태도가 필요하다.",
    knowledgeItems: ["디지털 기기 올바른 사용", "사이버 예절", "개인 정보 보호", "과의존 예방"],
    processItems: ["디지털 기기 바르게 사용하기", "온라인 예절 실천하기", "사용 시간 조절하기"],
    valueItems: ["디지털 시민 의식", "절제", "책임", "배려"],
    achievements: [
      { code: "2바03-01", content: "디지털 기기를 바르게 사용하는 습관을 가진다." },
      { code: "2바03-02", content: "온라인에서 지켜야 할 예절을 알고 실천한다." },
    ],
  },

  // ──────────────────── 슬기로운 생활 ────────────────────
  {
    subject: "슬기로운 생활",
    gradeRange: "1-2",
    area: "나와 가족",
    coreIdea:
      "나와 가족은 서로 사랑하고 협력하며 함께 살아가는 가장 가까운 공동체이다.\n나의 특징을 알고 가족 구성원 각각의 역할과 생활을 탐구한다.",
    knowledgeItems: ["나의 신체적·심리적 특징", "가족의 구성과 역할", "가족의 다양한 모습", "가족 생활과 문화"],
    processItems: ["관찰하기", "조사하기", "분류하기", "표현하기", "소통하기"],
    valueItems: ["가족 사랑", "감사", "협력", "호기심"],
    achievements: [
      { code: "2슬01-01", content: "나의 몸과 마음의 특징을 탐색하고 표현한다." },
      { code: "2슬01-02", content: "가족의 구성과 역할을 알아보고 가족이 함께하는 생활을 탐구한다." },
    ],
  },
  {
    subject: "슬기로운 생활",
    gradeRange: "1-2",
    area: "봄·여름",
    coreIdea:
      "봄과 여름의 자연과 생활 모습은 계절의 특성에 따라 다양하게 변화한다.\n계절의 변화를 탐구하는 과정을 통해 자연과 생활의 관계를 이해한다.",
    knowledgeItems: ["봄·여름의 날씨와 특징", "계절과 동식물의 변화", "봄·여름 생활 모습", "놀이와 문화"],
    processItems: ["관찰하기", "비교하기", "조사하기", "탐구하기"],
    valueItems: ["호기심", "탐구심", "자연에 대한 감수성"],
    achievements: [
      { code: "2슬02-01", content: "봄과 여름의 특징을 관찰하고 탐구한다." },
      { code: "2슬02-02", content: "계절의 변화에 따른 동식물의 모습과 사람들의 생활을 조사한다." },
    ],
  },
  {
    subject: "슬기로운 생활",
    gradeRange: "1-2",
    area: "가을·겨울",
    coreIdea:
      "가을과 겨울의 자연과 생활 모습은 계절의 특성에 따라 다양하게 변화한다.\n자연의 변화 속에서 동식물과 사람의 생활 모습을 탐구하며 세상을 이해한다.",
    knowledgeItems: ["가을·겨울의 날씨와 특징", "식물의 열매와 씨앗", "동물의 겨울나기", "겨울 생활 모습"],
    processItems: ["관찰하기", "비교하기", "조사하기", "분류하기"],
    valueItems: ["호기심", "탐구심", "감사", "자연에 대한 경외감"],
    achievements: [
      { code: "2슬03-01", content: "가을과 겨울의 특징을 탐구하고 표현한다." },
      { code: "2슬03-02", content: "동물의 겨울나기 방법을 알아보고 자연의 변화를 탐구한다." },
    ],
  },
  {
    subject: "슬기로운 생활",
    gradeRange: "1-2",
    area: "마을과 우리나라",
    coreIdea:
      "마을과 우리나라는 다양한 사람들이 함께 살아가는 공동체로, 고유한 모습과 특성이 있다.\n우리 마을과 나라의 모습을 탐구하며 공동체 의식과 나라 사랑을 기른다.",
    knowledgeItems: ["마을의 모습과 생활 장소", "우리나라의 상징", "우리나라의 문화와 명절", "다양한 직업과 역할"],
    processItems: ["관찰하기", "조사하기", "비교하기", "소통하기"],
    valueItems: ["공동체 의식", "나라 사랑", "문화 존중", "협력"],
    achievements: [
      { code: "2슬04-01", content: "마을의 모습과 생활 장소를 탐색하고 표현한다." },
      { code: "2슬04-02", content: "우리나라를 상징하는 것들을 알고 우리 문화와 명절을 탐구한다." },
    ],
  },

  // ──────────────────── 즐거운 생활 ────────────────────
  {
    subject: "즐거운 생활",
    gradeRange: "1-2",
    area: "나와 가족",
    coreIdea:
      "나와 가족을 주제로 다양한 방식으로 표현하고 즐기는 경험이 예술적 감성과 자기표현 능력을 기른다.\n놀이와 예술을 통해 나와 가족에 대한 애정을 표현한다.",
    knowledgeItems: ["나와 가족을 표현하는 방법", "노래와 몸 표현", "그리기와 만들기", "놀이와 게임"],
    processItems: ["노래 부르기", "그리기", "만들기", "신체 표현하기", "놀이하기"],
    valueItems: ["즐거움", "창의성", "자기표현", "가족 사랑"],
    achievements: [
      { code: "2즐01-01", content: "나와 가족을 주제로 노래를 부르거나 다양한 방법으로 표현한다." },
      { code: "2즐01-02", content: "신체를 활용하여 나와 가족의 모습과 감정을 표현한다." },
    ],
  },
  {
    subject: "즐거운 생활",
    gradeRange: "1-2",
    area: "봄·여름",
    coreIdea:
      "봄과 여름의 자연과 생활을 다양한 예술 방식으로 표현하고 즐기는 경험을 통해 심미적 감성을 기른다.\n계절의 아름다움을 느끼고 창의적으로 표현하는 능력을 기른다.",
    knowledgeItems: ["봄·여름의 자연 표현", "계절 노래와 음악", "봄·여름 놀이", "자연물을 이용한 만들기"],
    processItems: ["노래 부르기", "자연 탐색하기", "만들기", "신체 표현하기", "놀이하기"],
    valueItems: ["자연에 대한 감수성", "창의적 표현", "즐거움", "심미적 감성"],
    achievements: [
      { code: "2즐02-01", content: "봄과 여름의 특징을 노래, 그림, 놀이 등 다양한 방법으로 표현한다." },
      { code: "2즐02-02", content: "봄·여름의 자연물을 활용하여 놀이하고 만들기를 한다." },
    ],
  },
  {
    subject: "즐거운 생활",
    gradeRange: "1-2",
    area: "가을·겨울",
    coreIdea:
      "가을과 겨울의 자연과 생활을 다양한 예술 방식으로 표현하고 즐기는 경험을 통해 심미적 감성을 기른다.\n자연의 변화 속에서 아름다움을 찾고 창의적으로 표현한다.",
    knowledgeItems: ["가을·겨울의 자연 표현", "계절 노래와 음악", "가을·겨울 놀이", "겨울 놀이 문화"],
    processItems: ["노래 부르기", "만들기", "신체 표현하기", "놀이하기"],
    valueItems: ["감사", "창의적 표현", "심미적 감성", "즐거움"],
    achievements: [
      { code: "2즐03-01", content: "가을과 겨울의 특징을 노래, 그림, 놀이 등 다양한 방법으로 표현한다." },
      { code: "2즐03-02", content: "겨울 놀이를 즐기고 계절의 아름다움을 다양하게 표현한다." },
    ],
  },
  {
    subject: "즐거운 생활",
    gradeRange: "1-2",
    area: "마을과 우리나라",
    coreIdea:
      "마을과 우리나라의 모습을 예술로 표현하며 공동체 의식과 심미적 감성을 기른다.\n전통문화와 놀이를 체험하며 우리 문화에 대한 자부심과 소속감을 기른다.",
    knowledgeItems: ["마을 표현하기", "우리나라 전통놀이", "우리 문화 예술", "지역 문화와 예술"],
    processItems: ["전통놀이 하기", "우리 문화 표현하기", "노래 부르기", "만들기"],
    valueItems: ["문화적 자부심", "공동체 감각", "심미적 감성", "즐거움"],
    achievements: [
      { code: "2즐04-01", content: "우리나라 전통놀이와 문화를 즐기며 다양하게 표현한다." },
      { code: "2즐04-02", content: "마을과 우리나라의 모습을 노래, 그림, 놀이로 표현한다." },
    ],
  },
];

async function main() {
  let inserted = 0;
  for (const area of AREAS) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO curriculum_areas
         (id, subject, grade_range, area, core_idea,
          knowledge_items, process_items, value_items, achievements)
       VALUES
         (gen_random_uuid()::text, $1, $2, $3, $4,
          $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb)
       ON CONFLICT DO NOTHING`,
      area.subject,
      area.gradeRange,
      area.area,
      area.coreIdea,
      JSON.stringify(area.knowledgeItems),
      JSON.stringify(area.processItems),
      JSON.stringify(area.valueItems),
      JSON.stringify(area.achievements)
    );
    console.log(`  ✓ ${area.subject} ${area.gradeRange}학년군 · ${area.area}`);
    inserted++;
  }
  console.log(`\n총 ${inserted}개 영역 삽입 완료`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

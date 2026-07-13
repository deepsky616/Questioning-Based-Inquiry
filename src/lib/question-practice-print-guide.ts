export interface PrintGuidePattern {
  title: string;
  terms: string[];
  formulas: string[];
  examples: string[];
}

export interface PrintGuideSection {
  title: string;
  summary: string;
  note: string;
  patterns: PrintGuidePattern[];
}

export interface PrintGuideWorksheet {
  title: string;
  directions: string;
  prompts: string[];
}

export interface QuestionPracticePrintGuide {
  eyebrow: string;
  title: string;
  subtitle: string;
  teacherNote: string;
  printButton: string;
  backButton: string;
  nameLabel: string;
  classLabel: string;
  termsLabel: string;
  formulasLabel: string;
  guideTitle: string;
  worksheetTitle: string;
  sections: PrintGuideSection[];
  worksheets: PrintGuideWorksheet[];
}

const koGuide: QuestionPracticePrintGuide = {
  eyebrow: "교사용 인쇄 학습지",
  title: "사실적·개념적·논쟁적 질문을 만드는 방법",
  subtitle: "학생들이 질문 유형을 이해하고 직접 질문을 만들 수 있도록 정리한 활동지입니다.",
  teacherNote: "인쇄하거나 PDF로 저장해 학생 학습 자료와 질문연습 활동지로 활용할 수 있습니다.",
  printButton: "인쇄 또는 PDF 저장",
  backButton: "질문연습으로 돌아가기",
  nameLabel: "이름",
  classLabel: "학년 반 번호",
  termsLabel: "단어",
  formulasLabel: "공식",
  guideTitle: "질문 유형 이해하기",
  worksheetTitle: "질문연습 활동",
  sections: [
    {
      title: "1. 사실적 질문",
      summary:
        "책이나 읽기 자료를 꼼꼼하게 읽으면 정답이 그대로 적혀 있는 질문입니다. 누구나 같은 근거를 찾아 같은 정답에 도달할 수 있습니다.",
      note: "교과서 속에서 숨은 정보를 찾는 질문",
      patterns: [
        {
          title: "대상과 인물 묻기",
          terms: ["누구", "무엇", "어떤 것", "이름"],
          formulas: ["~은/는 누구인가요?", "~의 이름은 무엇인가요?"],
          examples: [
            "조선을 건국한 왕은 누구인가요?",
            "글 속에서 주인공이 가장 아끼는 물건의 이름은 무엇인가요?",
          ],
        },
        {
          title: "시간과 공간 묻기",
          terms: ["언제", "어디", "어느 곳", "배경", "시대"],
          formulas: ["~이 일어난 때는 언제인가요?", "~이 있는 곳은 어디인가요?"],
          examples: [
            "임진왜란이 일어난 해는 언제인가요?",
            "경주에서 석굴암이 있는 산의 이름은 무엇인가요?",
          ],
        },
        {
          title: "수량과 방법 묻기",
          terms: ["몇 개", "몇 명", "어떤 방법", "어떻게"],
          formulas: ["~은 모두 몇 개인가요?", "~는 어떻게 작동하나요?"],
          examples: [
            "우리나라 영토의 영해는 기준선으로부터 몇 해리까지인가요?",
            "식물이 광합성을 할 때 필요한 기체는 무엇인가요?",
          ],
        },
      ],
    },
    {
      title: "2. 개념적 질문",
      summary:
        "정답이 한 단어로 바로 적혀 있지 않고, 여러 사실을 연결해 원리와 관계를 설명해야 하는 질문입니다.",
      note: "사실을 연결해 원리를 깨닫게 하는 질문",
      patterns: [
        {
          title: "이유와 원인 파헤치기",
          terms: ["왜", "어째서", "무엇 때문에", "까닭", "원인"],
          formulas: ["~은 왜 꼭 필요할까요?", "~이 일어난 원인은 무엇 때문일까요?"],
          examples: [
            "우리는 왜 쓰레기를 분리배출해야 할까요?",
            "식물이 자라는 데 햇빛이 꼭 필요한 까닭은 무엇인가요?",
          ],
        },
        {
          title: "관계와 비교 탐구하기",
          terms: ["차이점", "공통점", "어떤 관계", "어떻게 다를까"],
          formulas: ["~와/과 ~은 어떤 차이가 있나요?", "~은 ~에 어떤 영향을 주나요?"],
          examples: [
            "조선 시대의 신분 제도와 오늘날의 민주주의 사회는 어떤 차이가 있나요?",
            "생태계에서 생산자와 소비자는 서로 어떤 관계를 맺고 있나요?",
          ],
        },
        {
          title: "의미와 영향 넓히기",
          terms: ["어떤 영향", "무슨 의미", "어떤 역할", "만약 ~라면"],
          formulas: ["~은 우리에게 어떤 의미를 주나요?", "만약 ~이 없다면 어떻게 될까요?"],
          examples: [
            "단원 김홍도의 풍속화는 당시 서민들의 삶을 이해하는 데 어떤 역할을 하나요?",
            "만약 우리 주변에 미생물이 모두 사라진다면 생태계에는 어떤 일이 벌어질까요?",
          ],
        },
      ],
    },
    {
      title: "3. 논쟁적 질문",
      summary:
        "하나의 정답이 정해져 있지 않고, 가치관과 근거에 따라 찬반이나 여러 대안이 나올 수 있는 질문입니다.",
      note: "타당한 근거를 들어 토론하게 만드는 질문",
      patterns: [
        {
          title: "선택과 찬반 이끌기",
          terms: ["찬성", "반대", "~해야 할까", "허용해야 할까", "금지해야 할까"],
          formulas: ["~하는 것에 대해 찬성하나요, 반대하나요?", "~을 법으로 제한해야 할까요?"],
          examples: [
            "학교 운동장에서 스마트폰을 사용하는 것을 완전히 금지해야 할까요?",
            "인공지능이 그린 그림을 예술 작품으로 인정해야 할까요?",
          ],
        },
        {
          title: "가치와 공정함 묻기",
          terms: ["정당한가", "바람직한가", "공평한가", "정의로운가", "옳은 행동"],
          formulas: ["~의 행동은 과연 정의롭다고 할 수 있을까요?", "~은 공평한 방법인가요?"],
          examples: [
            "모두의 안전을 위해 개인의 자유를 제한하는 것은 정당한가요?",
            "학급 규칙을 어긴 친구에게 청소 벌을 주는 것은 바람직한 해결책인가요?",
          ],
        },
        {
          title: "책임과 대안 따지기",
          terms: ["누구의 책임", "어떤 가치가 더 중요", "우선해야 할 것"],
          formulas: ["~와/과 ~ 중 우리 사회가 더 우선해야 할 가치는 무엇일까요?"],
          examples: [
            "환경 보존과 과학 기술 개발 중 인류가 더 우선해야 할 가치는 무엇일까요?",
            "기후 변화로 일어나는 피해는 개발도상국과 선진국 중 누구에게 더 큰 책임이 있을까요?",
          ],
        },
      ],
    },
  ],
  worksheets: [
    {
      title: "활동 1. 질문 유형 분류하기",
      directions: "아래 질문을 읽고 사실적, 개념적, 논쟁적 질문 중 하나로 분류하세요.",
      prompts: [
        "글에서 주인공이 여행을 떠난 날짜는 언제인가요?",
        "주인공의 선택이 이야기의 결말에 어떤 영향을 주었나요?",
        "학급에서 휴대전화 사용을 허용해야 할까요?",
      ],
    },
    {
      title: "활동 2. 질문 바꾸기",
      directions: "하나의 사실적 질문을 개념적 질문과 논쟁적 질문으로 바꾸어 보세요.",
      prompts: ["사실적 질문", "개념적 질문으로 바꾸기", "논쟁적 질문으로 바꾸기"],
    },
    {
      title: "활동 3. 나만의 질문 만들기",
      directions: "오늘 배운 내용이나 읽은 글을 바탕으로 세 가지 질문을 직접 만드세요.",
      prompts: ["사실적 질문", "개념적 질문", "논쟁적 질문"],
    },
  ],
};

const enGuide: QuestionPracticePrintGuide = {
  eyebrow: "Teacher printable worksheet",
  title: "How to Make Factual, Conceptual, and Debatable Questions",
  subtitle: "A worksheet for helping students understand question types and practice writing their own questions.",
  teacherNote: "Print this page or save it as a PDF for class learning and question practice.",
  printButton: "Print or save PDF",
  backButton: "Back to practice",
  nameLabel: "Name",
  classLabel: "Grade, class, number",
  termsLabel: "Key words",
  formulasLabel: "Question frames",
  guideTitle: "Understanding Question Types",
  worksheetTitle: "Question Practice Activities",
  sections: [
    {
      title: "1. Factual Questions",
      summary:
        "A factual question has an answer that can be found directly in the text or learning material. Everyone can use the same evidence and reach the same answer.",
      note: "A question that finds information in the text",
      patterns: [
        {
          title: "Ask about people and things",
          terms: ["who", "what", "which thing", "name"],
          formulas: ["Who is ~?", "What is the name of ~?"],
          examples: [
            "Who was the king who founded Joseon?",
            "What is the name of the object the main character values most?",
          ],
        },
        {
          title: "Ask about time and place",
          terms: ["when", "where", "which place", "setting", "period"],
          formulas: ["When did ~ happen?", "Where is ~ located?"],
          examples: [
            "When did the Imjin War begin?",
            "What is the name of the mountain where Seokguram is located in Gyeongju?",
          ],
        },
        {
          title: "Ask about numbers and methods",
          terms: ["how many", "how much", "which method", "how"],
          formulas: ["How many ~ are there?", "How does ~ work?"],
          examples: [
            "How many nautical miles does Korea's territorial sea extend from the baseline?",
            "What gas do plants need for photosynthesis?",
          ],
        },
      ],
    },
    {
      title: "2. Conceptual Questions",
      summary:
        "A conceptual question is not answered by one word in the text. Students connect facts to explain principles, causes, relationships, and meanings.",
      note: "A question that connects facts to reveal a principle",
      patterns: [
        {
          title: "Explore reasons and causes",
          terms: ["why", "for what reason", "because of what", "cause"],
          formulas: ["Why is ~ necessary?", "What caused ~ to happen?"],
          examples: [
            "Why do we need to separate recyclable waste?",
            "Why do plants need sunlight to grow?",
          ],
        },
        {
          title: "Explore relationships and comparisons",
          terms: ["difference", "similarity", "relationship", "how are they different"],
          formulas: ["What is the difference between ~ and ~?", "How does ~ affect ~?"],
          examples: [
            "How was the Joseon class system different from today's democratic society?",
            "What relationship do producers and consumers have in an ecosystem?",
          ],
        },
        {
          title: "Expand meaning and impact",
          terms: ["impact", "meaning", "role", "what if"],
          formulas: ["What meaning does ~ have for us?", "What would happen if ~ did not exist?"],
          examples: [
            "What role do Kim Hong-do's genre paintings play in understanding ordinary people's lives at the time?",
            "What would happen to the ecosystem if all microorganisms disappeared?",
          ],
        },
      ],
    },
    {
      title: "3. Debatable Questions",
      summary:
        "A debatable question does not have one fixed answer. Different opinions, values, and alternatives can be supported with reasonable evidence.",
      note: "A question that invites discussion with valid reasons",
      patterns: [
        {
          title: "Lead a choice or pro-and-con discussion",
          terms: ["agree", "disagree", "should we", "allow", "ban"],
          formulas: ["Do you agree or disagree with ~?", "Should ~ be limited by law?"],
          examples: [
            "Should smartphones be completely banned on the school playground?",
            "Should artwork created by artificial intelligence be recognized as art?",
          ],
        },
        {
          title: "Ask about values and fairness",
          terms: ["justified", "desirable", "fair", "just", "right action"],
          formulas: ["Can ~ be called just?", "Is ~ a fair method?"],
          examples: [
            "Is it justified to limit personal freedom for everyone's safety?",
            "Is giving cleaning duty to a student who broke a class rule a desirable solution?",
          ],
        },
        {
          title: "Consider responsibility and alternatives",
          terms: ["whose responsibility", "which value is more important", "what should come first"],
          formulas: ["Between ~ and ~, which value should society prioritize?"],
          examples: [
            "Between environmental protection and scientific development, which value should humanity prioritize?",
            "Who has greater responsibility for climate-change damage, developing countries or developed countries?",
          ],
        },
      ],
    },
  ],
  worksheets: [
    {
      title: "Activity 1. Classify Question Types",
      directions: "Read each question and classify it as factual, conceptual, or debatable.",
      prompts: [
        "When did the main character leave for the trip?",
        "How did the main character's choice affect the ending of the story?",
        "Should students be allowed to use phones in class?",
      ],
    },
    {
      title: "Activity 2. Transform a Question",
      directions: "Change one factual question into a conceptual question and a debatable question.",
      prompts: ["Factual question", "Change it into a conceptual question", "Change it into a debatable question"],
    },
    {
      title: "Activity 3. Create Your Own Questions",
      directions: "Use today's lesson or reading text to create three types of questions.",
      prompts: ["Factual question", "Conceptual question", "Debatable question"],
    },
  ],
};

export function getQuestionPracticePrintGuide(locale: string): QuestionPracticePrintGuide {
  return locale === "en" ? enGuide : koGuide;
}

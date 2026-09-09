import type { TeachingExampleTopic, TeachingText } from "@/lib/question-teaching-examples-types";

const text = (ko: string, en: string): TeachingText => ({ ko, en });
type Topic = Omit<TeachingExampleTopic, "standards"> & { codes: string[] };

// 학년별 수업 예시이며 질문은 자체 작성했다. 성취기준 원문은 별도의 교육과정 자료에서 연결한다.
export const QUESTION_TEACHING_EXAMPLE_TOPICS: readonly Topic[] = [
  {
    id: "g1-counting", grade: "1", subject: text("수학", "Mathematics"), unit: text("수를 세고 비교하기", "Counting and comparing"), codes: ["[2수01-01]", "[2수01-05]"],
    setup: text("연필이나 바둑돌을 세고, 자리를 바꾸어 다시 세어 봅니다.", "Count pencils or counters, rearrange them, and count again."),
    questions: {
      closed: text("연필 3자루와 2자루를 한데 모으면 모두 몇 자루인가요?", "How many pencils are there when we put 3 pencils and 2 pencils together?"),
      open: text("교실에서 다섯 개씩 모아 셀 수 있는 물건 두 가지를 찾아볼까요?", "Which two kinds of classroom objects could we collect and count in groups of five?"),
      conceptual: text("물건의 자리를 바꾸어도 빠짐없이 한 번씩 세면 수가 같은 까닭은 무엇인가요?", "Why does the number stay the same after rearranging objects if we count each one exactly once?"),
      controversial: text("모둠 꾸미기 재료는 모두 같은 수로 나눌까요, 만드는 데 필요한 수만큼 나눌까요?", "Should groups receive the same number of craft materials, or as many as each design needs?"),
    },
  },
  {
    id: "g1-school", grade: "1", subject: text("바른 생활", "Right Living"), unit: text("안전한 학교생활", "A safe school day"), codes: ["[2바01-01]", "[2바04-01]"],
    setup: text("복도와 교실 그림을 보며 우리 반의 안전 약속을 정합니다.", "Use pictures of hallways and classrooms to discuss class safety rules."),
    questions: {
      closed: text("‘복도에서는 걷기’라는 약속에서 정한 이동 방법은 무엇인가요?", "What way of moving does the rule ‘Walk in the hallway’ require?"),
      open: text("우리 교실에서 안전을 위해 살펴볼 곳 두 군데를 찾아볼까요?", "Which two places in our classroom should we check for safety?"),
      conceptual: text("내가 복도에서 천천히 걷는 일이 다른 친구의 안전과 어떻게 연결되나요?", "How does walking slowly in the hallway help keep other children safe?"),
      controversial: text("쉬는 시간 교실 놀이를 정할 때 자유롭게 고르는 것과 모두의 안전 중 무엇을 어떻게 고려해야 할까요?", "How should we balance freedom to choose classroom games with everyone's safety at break time?"),
    },
  },
  {
    id: "g2-patterns", grade: "2", subject: text("수학", "Mathematics"), unit: text("규칙 찾기와 만들기", "Finding and making patterns"), codes: ["[2수02-01]", "[2수02-02]"],
    setup: text("색과 모양이 반복되는 카드로 규칙을 만들고 친구에게 설명합니다.", "Make repeating patterns with colored shape cards and explain them to a partner."),
    questions: {
      closed: text("빨강·파랑 두 색을 번갈아 놓는 규칙에서 빨강·파랑·빨강·파랑 다음 색은 무엇인가요?", "In a pattern that alternates red and blue, what follows red, blue, red, blue?"),
      open: text("생활 주변에서 같은 규칙이 반복되는 무늬 두 가지를 찾아볼까요?", "Which two repeating patterns can we find around us?"),
      conceptual: text("반복되는 한 묶음을 찾으면 다음에 올 모양을 알 수 있는 까닭은 무엇인가요?", "Why does finding the repeating unit help us predict the next shape?"),
      controversial: text("학급 안내 무늬는 색이 비슷해도 예쁜 규칙과 누구나 쉽게 구별하는 규칙 중 무엇을 먼저 고려할까요?", "For a class sign, should we prioritize an attractive color pattern or one that everyone can easily distinguish?"),
    },
  },
  {
    id: "g2-neighborhood", grade: "2", subject: text("슬기로운 생활", "Wise Living"), unit: text("우리 마을의 생활", "Life in our neighborhood"), codes: ["[2슬02-01]"],
    setup: text("마을 지도와 여러 시설의 사진을 살펴보고 사람들이 하는 일을 연결합니다.", "Look at a neighborhood map and photos of facilities, and connect them with people's activities."),
    questions: {
      closed: text("마을 지도에 ‘도서관’이라고 표시된 곳의 이름은 무엇인가요?", "What is the name of the place marked ‘Library’ on the neighborhood map?"),
      open: text("우리 마을에서 사람들의 생활을 돕는 시설 두 곳을 찾아볼까요?", "Which two local facilities help people in their daily lives?"),
      conceptual: text("마을의 여러 시설과 일하는 사람들은 서로 어떻게 도움을 주고받나요?", "How do local facilities and the people working there support one another?"),
      controversial: text("마을의 빈터에 놀이터와 조용히 쉴 정원 중 하나를 만든다면 누구의 필요를 살펴 결정할까요?", "Whose needs should we consider when choosing between a playground and a quiet garden for an empty lot?"),
    },
  },
  {
    id: "g3-fractions", grade: "3", subject: text("수학", "Mathematics"), unit: text("똑같이 나누기와 분수", "Equal parts and fractions"), codes: ["[4수01-09]"],
    setup: text("같은 크기의 종이를 여러 방법으로 똑같이 나누어 비교합니다.", "Divide equal-sized sheets into equal parts in different ways and compare them."),
    questions: {
      closed: text("종이 한 장을 똑같이 네 조각으로 나눈 것 중 한 조각은 전체의 얼마인가요?", "What fraction of a sheet is one piece when the sheet is divided into four equal parts?"),
      open: text("생활에서 전체를 똑같이 나누는 사례 두 가지를 찾아볼까요?", "What are two everyday examples of dividing a whole into equal parts?"),
      conceptual: text("조각의 개수만 같고 크기는 다를 때 같은 분수라고 말하기 어려운 까닭은 무엇인가요?", "Why is having the same number of pieces insufficient to represent the same fraction if the pieces differ in size?"),
      controversial: text("간식을 나눌 때 모두 같은 분량을 받는 것과 필요한 분량을 받는 것 중 어떤 기준이 더 공정할까요?", "When sharing snacks, is it fairer to give equal portions or portions based on need?"),
    },
  },
  {
    id: "g3-life-cycles", grade: "3", subject: text("과학", "Science"), unit: text("동물의 한살이", "Animal life cycles"), codes: ["[4과04-01]", "[4과04-03]"],
    setup: text("나비의 관찰 기록과 여러 동물의 한살이 그림 자료를 비교합니다.", "Compare butterfly observation records with diagrams of other animal life cycles."),
    questions: {
      closed: text("나비의 한살이 자료에서 번데기 다음 단계는 무엇인가요?", "Which stage follows the pupa in the butterfly life-cycle diagram?"),
      open: text("알·애벌레·번데기·어른벌레 단계를 거치는 곤충 두 가지를 자료에서 찾아볼까요?", "Which two insects in our sources pass through egg, larva, pupa, and adult stages?"),
      conceptual: text("동물의 몸과 먹이가 자라는 단계에 따라 달라지는 것은 생활 환경과 어떻게 연결되나요?", "How do changes in an animal's body and food across life stages relate to its environment?"),
      controversial: text("한살이를 배우기 위해 교실에서 동물을 직접 기를까요, 관찰 영상과 기록을 활용할까요?", "Should we raise animals in class to study their life cycles, or use observation videos and records?"),
    },
  },
  {
    id: "g4-angles", grade: "4", subject: text("수학", "Mathematics"), unit: text("각도 재기와 비교하기", "Measuring and comparing angles"), codes: ["[4수03-24]"],
    setup: text("각도기로 각을 재고, 교실과 생활 속에서 여러 각을 찾아봅니다.", "Measure angles with a protractor and look for angles in familiar places."),
    questions: {
      closed: text("직각의 크기를 도 단위로 나타내면 얼마인가요?", "How many degrees are in a right angle?"),
      open: text("생활 주변에서 직각을 찾을 수 있는 물건 두 가지는 무엇인가요?", "Which two everyday objects have right angles?"),
      conceptual: text("각을 이루는 두 변의 길이가 달라도 각의 크기가 같을 수 있는 까닭은 무엇인가요?", "Why can two angles be equal even when their drawn sides have different lengths?"),
      controversial: text("학교 경사로를 설계할 때 이동 거리를 줄이는 것과 경사를 완만하게 하는 것 중 무엇을 우선할까요?", "When designing a school ramp, should we prioritize a shorter route or a gentler slope?"),
    },
  },
  {
    id: "g4-water", grade: "4", subject: text("과학", "Science"), unit: text("물의 상태 변화", "Changes in the state of water"), codes: ["[4과10-01]", "[4과10-03]"],
    setup: text("얼음과 물, 차가운 컵 주변의 변화를 관찰하고 물을 모으는 장치를 생각합니다.", "Observe ice, water, and a cold cup, then consider ways to collect water."),
    questions: {
      closed: text("얼음이 녹아 물이 되면 물질의 상태는 무엇에서 무엇으로 바뀌나요?", "Which change of state occurs when ice melts into water?"),
      open: text("우리 주변에서 물의 상태가 변하는 사례 두 가지를 찾아볼까요?", "What are two examples of water changing state around us?"),
      conceptual: text("찬 컵의 겉에 생긴 물방울과 공기 중 수증기는 어떤 관계가 있나요?", "How are droplets on the outside of a cold cup related to water vapor in the air?"),
      controversial: text("물을 모으는 장치를 고를 때 모이는 물의 양과 사용하는 에너지 중 무엇을 더 중요하게 볼까요?", "When choosing a water-collection device, how should we weigh the amount collected against the energy used?"),
    },
  },
  {
    id: "g5-solutions", grade: "5", subject: text("과학", "Science"), unit: text("용해와 용액", "Dissolving and solutions"), codes: ["[6과03-01]", "[6과03-02]", "[6과03-03]"],
    setup: text("물의 양·온도와 설탕의 양을 기록하며 용해와 용액의 진하기를 비교합니다.", "Record water volume, temperature, and sugar mass when comparing dissolving and solution concentration."),
    questions: {
      closed: text("각각 물 100밀리리터에 설탕 5그램과 10그램을 모두 녹였다면 어느 용액이 더 진한가요?", "If 5 grams and 10 grams of sugar each dissolve completely in 100 milliliters of water, which solution is more concentrated?"),
      open: text("생활에서 사용하는 용액 두 가지를 찾아 무엇이 녹아 있는지 확인해 볼까요?", "Which two solutions do we use in daily life, and what is dissolved in each?"),
      conceptual: text("물의 온도에 따라 최대로 녹는 설탕의 양을 비교하려면 어떤 조건을 같게 해야 하며, 그 까닭은 무엇인가요?", "Which conditions should remain the same when comparing the maximum amount of sugar that dissolves at different temperatures, and why?"),
      controversial: text("실험 재료가 부족할 때 모둠별로 소량씩 실험할까요, 한 번의 시범 실험 자료를 함께 분석할까요?", "With limited materials, should each group run a small experiment, or should the class analyze one demonstration together?"),
    },
  },
  {
    id: "g5-mean", grade: "5", subject: text("수학", "Mathematics"), unit: text("평균으로 자료 비교하기", "Comparing data using the mean"), codes: ["[6수04-01]"],
    setup: text("모둠별 독서 기록처럼 실제 자료의 평균과 각각의 값을 함께 살펴봅니다.", "Examine both means and individual values in data such as group reading records."),
    questions: {
      closed: text("세 학생이 읽은 책이 2권, 4권, 6권이면 평균은 몇 권인가요?", "If three students read 2, 4, and 6 books, what is the mean?"),
      open: text("학교생활에서 평균을 활용하는 자료 두 가지를 찾아볼까요?", "What are two kinds of school-life data for which people use the mean?"),
      conceptual: text("평균이 같은 두 모둠도 학생들의 기록이 서로 다를 수 있는 까닭은 무엇인가요?", "Why can two groups with the same mean have different individual records?"),
      controversial: text("모둠의 독서 활동을 평균 독서량만으로 평가해도 공정할까요?", "Is it fair to evaluate a group's reading activity using only the mean number of books read?"),
    },
  },
  {
    id: "g6-ratios", grade: "6", subject: text("수학", "Mathematics"), unit: text("비율과 백분율", "Ratios and percentages"), codes: ["[6수02-03]"],
    setup: text("설문 응답 수와 전체 조사 인원을 함께 보고 비율을 여러 방법으로 나타냅니다.", "Compare response counts with sample sizes and express ratios in several forms."),
    questions: {
      closed: text("20명 중 10명이 찬성했다면 찬성 비율은 몇 퍼센트인가요?", "If 10 out of 20 people agree, what percentage agree?"),
      open: text("생활에서 백분율을 사용하는 사례 두 가지를 찾아 기준량이 무엇인지 확인해 볼까요?", "What are two everyday uses of percentages, and what is the reference quantity in each?"),
      conceptual: text("3명 중 2명과 6명 중 4명이 찬성한 경우 찬성 비율이 같은 까닭은 무엇인가요?", "Why are the approval ratios equal when 2 of 3 people and 4 of 6 people agree?"),
      controversial: text("10명 조사에서 만족도 90퍼센트인 활동과 100명 조사에서 80퍼센트인 활동 중 무엇을 추천할까요?", "Which activity would you recommend: one with 90 percent satisfaction among 10 respondents, or one with 80 percent among 100?"),
    },
  },
  {
    id: "g6-democracy", grade: "6", subject: text("사회", "Social Studies"), unit: text("민주주의와 시민 참여", "Democracy and civic participation"), codes: ["[6사08-01]"],
    setup: text("학급 의사결정 상황과 모의 투표 자료를 살펴보며 참여 방법을 비교합니다.", "Compare ways to participate using class decision-making scenarios and mock voting data."),
    questions: {
      closed: text("모의 투표에서 찬성 12표, 반대 8표라면 더 많은 표를 받은 의견은 무엇인가요?", "In a mock vote with 12 votes in favor and 8 against, which position received more votes?"),
      open: text("학교나 지역에서 구성원의 의견을 모아 결정한 사례 두 가지를 찾아볼까요?", "What are two examples of decisions made using members' views in a school or community?"),
      conceptual: text("다수결로 결정하기 전에 소수 의견을 듣는 일은 민주적인 의사결정과 어떻게 연결되나요?", "How does listening to minority views before a majority vote support democratic decision-making?"),
      controversial: text("학급 문제를 빨리 결정하는 것과 소수 의견을 더 듣는 것 중 무엇을 우선해야 할까요?", "When resolving a class issue, should we prioritize a quick decision or more time to hear minority views?"),
    },
  },
];

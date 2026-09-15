export type AiEthicsContext = "question" | "analysis" | "comment" | "game" | "growth";

interface PromiseItem { title: string; action: string; example: string; discuss: string }
interface Situation { title: string; story: string; options: { label: string; feedback: string; recommended: boolean }[] }
interface EthicsContent {
  title: string; intro: string; steps: string[]; promises: PromiseItem[]; situations: Situation[];
  practice: string; next: string; choose: string; confirm: string; retry: string; overview: string;
  choiceTitle: string; choiceHelp: string; doneTitle: string; doneHelp: string; goAsk: string;
  reason: string; reconsider: string; choiceLabel: string; exampleLabel: string;
  present: string; presentationTitle: string; previousPromise: string; nextPromise: string; discussLabel: string;
  close: string; view: string; reminderTitle: string; reminders: Record<AiEthicsContext, string>;
  reflection: string; reflectionHelp: string;
  lessonTitle: string; lessonIntro: string; lesson: { time: string; title: string; action: string }[];
  lessonCheck: string; lessonNote: string;
}

const ko: EthicsContent = {
  title: "질문 연구소에서 함께 지킬 약속",
  intro: "AI는 질문을 다듬는 도움을 줄 수 있어요. 무엇을 묻고 어떤 도움을 받아들일지는 내가 생각하고 결정해요.",
  steps: ["약속 알아보기", "상황 판단 연습", "나의 실천 약속"],
  promises: [
    { title: "내 질문은 내가 먼저 만들어요.", action: "궁금한 점을 내 말로 먼저 써요. AI가 만든 질문을 그대로 내 질문이라고 하지 않아요.", example: "먼저 ‘식물은 빛이 없으면 어떻게 될까?’라고 쓰고, 더 분명하게 묻는 방법을 살펴봐요.", discuss: "AI의 도움을 받기 전에 내가 먼저 할 일은 무엇일까요?" },
    { title: "인공지능의 말은 이유를 살펴봐요.", action: "AI의 분류와 수정 제안도 틀릴 수 있어요. 내 질문의 뜻과 비교하고, 사실은 교과서나 믿을 만한 자료로 확인해요.", example: "수정된 질문의 뜻이 달라졌다면 그대로 쓰지 않고 내 뜻에 맞게 고쳐요. 판단이 어려우면 선생님과 이야기해요.", discuss: "AI의 제안과 내 생각이 다를 때 무엇을 비교하면 좋을까요?" },
    { title: "질문과 댓글에 개인정보를 쓰지 않아요.", action: "나와 친구의 이름, 전화번호, 주소, 비밀번호, 얼굴 사진이나 개인적인 사정을 넣지 않아요.", example: "‘우리 반 친구의 집 주소는…’ 대신 ‘사람들이 사는 곳은 생활에 어떤 영향을 줄까?’처럼 바꿔요.", discuss: "이름을 지웠어도 누구인지 알아볼 수 있다면 어떻게 바꿀까요?" },
    { title: "친구의 생각을 존중해요.", action: "다른 질문 유형이나 생각을 낮춰 보지 않아요. 댓글에는 내 생각과 이유를 예의 있게 덧붙여요.", example: "‘그것도 몰라?’ 대신 ‘나는 이렇게 생각해. 너는 왜 그렇게 생각했어?’라고 물어요.", discuss: "의견이 달라도 친구가 안전하게 말할 수 있는 댓글은 어떤 모습일까요?" },
    { title: "도움받은 부분을 솔직히 밝혀요.", action: "AI나 친구에게 어떤 도움을 받았는지 성장 기록에 남겨요. 내가 받아들인 부분과 그 이유도 써요.", example: "‘AI가 비교할 대상을 정해 보라고 했어요. 뜻이 더 분명해져서 두 식물을 비교하도록 고쳤어요.’", discuss: "도움받은 부분과 내가 판단한 부분을 어떻게 나누어 설명할까요?" },
    { title: "문제가 생기면 멈추고 선생님께 알려요.", action: "불편한 말이나 개인정보, 이상한 판정을 발견하면 따라 하거나 퍼뜨리지 말고 선생님께 알려요.", example: "문제가 있는 내용을 다시 복사하지 않고, 어느 활동에서 무슨 문제가 있었는지 선생님께 말해요.", discuss: "어떤 화면에서 어떤 문제가 있었는지 안전하게 설명해 볼까요?" },
  ],
  situations: [
    { title: "질문에 친구의 정보가 들어 있어요", story: "친구가 겪은 일을 질문하려고 이름과 사는 곳을 적었어요. 질문을 보내기 전에 어떻게 할까요?", options: [
      { label: "친구의 정보를 자세히 입력한다.", feedback: "이름과 사는 곳은 친구를 알아볼 수 있는 정보예요. 질문에 꼭 필요한지 살피고, 사람을 알아볼 수 없게 바꿔 봐요.", recommended: false },
      { label: "개인정보를 빼고 일반적인 질문으로 바꾼다.", feedback: "좋아요. 이름만 지우는 데서 멈추지 않고, 남은 내용으로도 친구를 알아볼 수 없는지 확인해요.", recommended: true },
    ] },
    { title: "AI의 제안이 내 뜻과 달라요", story: "AI가 바꿔 준 질문은 그럴듯하지만, 내가 처음 궁금했던 내용과 달라졌어요. 어떻게 할까요?", options: [
      { label: "AI가 제안했으니 그대로 사용한다.", feedback: "AI도 질문의 뜻을 잘못 이해할 수 있어요. 처음 궁금했던 점과 비교하고, 필요한 부분만 골라 다시 써 봐요.", recommended: false },
      { label: "내 질문의 뜻과 비교하고 도움이 되는 부분을 고른다.", feedback: "좋아요. 질문을 결정하는 사람은 나예요. 제안을 받아들이지 않아도 되고, 그 이유를 설명할 수 있으면 좋아요.", recommended: true },
    ] },
    { title: "친구에게 댓글을 남기려고 해요", story: "친구가 사실을 확인하는 질문을 올렸어요. 나는 다른 점도 궁금해요. 어떤 댓글이 도움이 될까요?", options: [
      { label: "쉬운 질문이라고 놀린다.", feedback: "사실을 확인하는 질문도 탐구에 필요해요. 질문의 유형으로 친구를 평가하지 말고, 더 궁금한 점과 이유를 덧붙여 봐요.", recommended: false },
      { label: "친구의 질문에 내 생각과 이유를 덧붙인다.", feedback: "좋아요. ‘나는 이런 점도 궁금해. 왜냐하면…’처럼 이유와 새 질문을 덧붙이면 함께 탐구할 수 있어요.", recommended: true },
    ] },
  ],
  practice: "상황 판단 연습", next: "다음 상황", choose: "실천 약속 고르기", confirm: "내 약속 확인", retry: "다시 연습하기", overview: "약속 다시 보기",
  choiceTitle: "오늘 실천할 약속을 골라요", choiceHelp: "여섯 가지 중 오늘 특히 기억하고 싶은 약속 하나를 골라요.",
  doneTitle: "오늘 실천할 나의 약속", doneHelp: "질문 활동이 끝나면 이 약속을 어떻게 실천했는지 내 말로 돌아봐요.", goAsk: "질문하러 가기",
  reason: "판단 이유", reconsider: "다시 생각해 봐요", choiceLabel: "나라면 어떻게 할까요?", exampleLabel: "이렇게 실천해요",
  present: "약속 수업 화면으로 보기", presentationTitle: "함께 이야기하는 AI 사용 약속", previousPromise: "이전 약속", nextPromise: "다음 약속", discussLabel: "함께 이야기해요",
  close: "닫기", view: "사용 약속 보기", reminderTitle: "질문 연구소 사용 약속",
  reminders: {
    question: "내가 궁금한 점을 먼저 써요. 나와 친구를 알아볼 수 있는 개인정보는 빼요.",
    analysis: "AI의 분류와 제안도 틀릴 수 있어요. 내 질문의 뜻과 비교하고 필요한 도움을 골라요.",
    comment: "친구의 생각을 존중하며 이유를 덧붙여요. 개인정보나 불편한 내용을 발견하면 선생님께 알려요.",
    game: "점수보다 질문한 이유가 중요해요. 점수를 얻으려고 같은 말을 반복하지 않고, 이상한 판정은 선생님과 확인해요.",
    growth: "AI나 친구에게 도움받은 부분과 내가 판단한 이유를 솔직히 남겨요.",
  },
  reflection: "AI는 ______을 제안했어요. 나는 ______ 때문에 받아들였어요 / 받아들이지 않았어요.",
  reflectionHelp: "도움받았다면 이 문장을 참고해 내 말로 써요. 도움받지 않았다면 스스로 고친 과정과 이유를 써요.",
  lessonTitle: "AI 사용 약속 · 첫 사용 전 20분 수업",
  lessonIntro: "약속을 함께 읽고, 실제 웹앱에서 만날 상황을 판단한 뒤, 오늘 실천할 행동을 정합니다.",
  lesson: [
    { time: "3분", title: "내가 먼저 생각하기", action: "AI의 도움 없이 궁금한 점 하나를 적습니다. ‘AI의 도움을 받기 전에 내가 할 일은 무엇일까?’를 나눕니다." },
    { time: "5분", title: "여섯 가지 약속", action: "AI 사용 약속 탭의 수업 화면을 보여 줍니다. 개인정보를 지운 질문과 존중하는 댓글을 함께 만들어 봅니다." },
    { time: "7분", title: "세 가지 상황 판단", action: "학생이 상황별 행동을 고르고 이유를 설명합니다. 다른 선택을 한 학생도 이유를 말하고 다시 선택할 기회를 줍니다." },
    { time: "3분", title: "실천 약속 고르기", action: "오늘의 약속 하나를 고르고 질문 활동에서 실천할 방법을 짝과 나눕니다." },
    { time: "2분", title: "내 판단 돌아보기", action: "AI의 도움과 내 판단을 구별해 한 문장으로 말합니다. 다음 차시에는 시작과 끝에 1분씩 실천을 점검합니다." },
  ],
  lessonCheck: "관찰할 점: 개인정보를 스스로 고치는가 · AI 제안을 받아들이거나 거절한 이유를 말하는가 · 댓글에 존중과 이유가 있는가 · 도움받은 부분을 밝히는가",
  lessonNote: "선택 활동은 연습이며 윤리 점수나 학생별 이수 기록을 만들지 않습니다. 실제 실천은 질문·댓글·성장 기록과 수업 대화로 확인합니다. 초등 저학년은 교사가 읽어 주고 말로 답하게 합니다.",
};

const en: EthicsContent = {
  title: "Our promises for Question Lab",
  intro: "AI can help improve a question. I decide what to ask and which suggestions to use.",
  steps: ["Explore the promises", "Try the situations", "My action promise"],
  promises: [
    { title: "I write my own question first.", action: "I start with my own curiosity and words. I do not claim an AI-written question as entirely my own.", example: "I first ask, ‘What happens to plants without light?’ Then I look for ways to make my question clearer.", discuss: "What can I do before asking AI for help?" },
    { title: "I check the reasons behind AI suggestions.", action: "AI classifications and suggestions can be wrong. I compare them with my meaning and check facts in textbooks or reliable sources.", example: "If a suggestion changes my meaning, I rewrite it. If I am unsure, I talk with my teacher.", discuss: "What should I compare when AI and I disagree?" },
    { title: "I leave personal information out of questions and comments.", action: "I do not include my own or friends’ names, phone numbers, addresses, passwords, face photos, or private details.", example: "Instead of giving a friend’s address, I ask, ‘How does where people live affect their lives?’", discuss: "Could someone still recognize the person after I remove their name?" },
    { title: "I respect my friends’ thinking.", action: "I do not put down different ideas or question types. I add my ideas and reasons politely in comments.", example: "Instead of ‘You don’t know that?’, I ask, ‘I think this. What makes you think that?’", discuss: "How can a comment help a friend feel safe to disagree?" },
    { title: "I explain the help I used honestly.", action: "In my growth record, I explain help from AI or friends, what I chose, and why.", example: "‘AI suggested choosing things to compare. I chose two plants because that made my meaning clearer.’", discuss: "Which part was a suggestion, and which part was my decision?" },
    { title: "I stop and tell my teacher when something goes wrong.", action: "If I see hurtful content, personal information, or a strange judgment, I do not repeat or share it. I tell my teacher.", example: "I explain where the problem happened without copying private or hurtful content again.", discuss: "How can I safely explain where and what the problem was?" },
  ],
  situations: [
    { title: "A question includes a friend’s details", story: "You wrote a friend’s name and where they live in a question. What should you do before sending it?", options: [
      { label: "Enter my friend’s details in full.", feedback: "Names and locations can identify your friend. Check what the question needs and remove identifying details.", recommended: false },
      { label: "Remove personal details and ask a general question.", feedback: "Yes. After removing the name, also check whether the remaining details could identify your friend.", recommended: true },
    ] },
    { title: "AI changed my meaning", story: "An AI suggestion sounds good, but it asks something different from what you wanted to know. What should you do?", options: [
      { label: "Use it exactly as it is because AI suggested it.", feedback: "AI can misunderstand your meaning. Compare it with your original curiosity and choose only useful parts.", recommended: false },
      { label: "Compare it with my meaning and choose the helpful parts.", feedback: "Yes. You decide your question. You can reject a suggestion and explain why.", recommended: true },
    ] },
    { title: "I want to comment on a friend’s question", story: "Your friend asked a factual question. You are curious about another aspect too. Which comment would help?", options: [
      { label: "Make fun of the question for being easy.", feedback: "Factual questions also support inquiry. Do not judge a friend by the question type. Add your curiosity and reasons.", recommended: false },
      { label: "Add my thinking and reasons to my friend’s question.", feedback: "Yes. ‘I also wonder about this, because…’ helps you explore together.", recommended: true },
    ] },
  ],
  practice: "Try the situations", next: "Next situation", choose: "Choose an action promise", confirm: "Confirm my promise", retry: "Practice again", overview: "Review the promises",
  choiceTitle: "Choose a promise for today", choiceHelp: "Choose one of the six promises to pay special attention to today.", doneTitle: "My promise for today", doneHelp: "After the activity, explain in your own words how you put this promise into practice.", goAsk: "Go ask a question",
  reason: "Reason for this choice", reconsider: "Think again", choiceLabel: "What would I do?", exampleLabel: "Put it into practice",
  present: "Show promises to the class", presentationTitle: "Discuss our AI use promises", previousPromise: "Previous promise", nextPromise: "Next promise", discussLabel: "Talk together",
  close: "Close", view: "View use promises", reminderTitle: "Question Lab use promises",
  reminders: {
    question: "Start with your own curiosity. Leave out details that could identify you or your friends.",
    analysis: "AI classifications and suggestions can be wrong. Compare them with your meaning and choose useful help.",
    comment: "Respect your friends and give reasons. Tell your teacher about personal details or hurtful content.",
    game: "Your reasons matter more than points. Do not repeat text just to earn points. Check strange judgments with your teacher.",
    growth: "Explain help from AI or friends honestly, along with your own decisions and reasons.",
  },
  reflection: "AI suggested ______. I accepted / rejected it because ______.", reflectionHelp: "If you used help, use this sentence as a guide in your own words. If not, explain your own changes and reasons.",
  lessonTitle: "AI use promises · A 20-minute first-use lesson", lessonIntro: "Explore the promises, discuss situations from the app, and choose an action to practice today.",
  lesson: [
    { time: "3 min", title: "Think first", action: "Write a question without AI. Discuss what learners can do before asking AI for help." },
    { time: "5 min", title: "Six promises", action: "Show the class presentation in the AI use promises tab. Rewrite a question without personal information and practice a respectful comment." },
    { time: "7 min", title: "Three situations", action: "Learners choose actions and explain their reasons. Give them time to reconsider and choose again." },
    { time: "3 min", title: "Choose an action", action: "Choose a promise for today and discuss how to practice it with a partner." },
    { time: "2 min", title: "Reflect on decisions", action: "Distinguish AI help from personal judgment in one sentence. Spend a minute checking actions at the start and end of later lessons." },
  ],
  lessonCheck: "Observe: removing personal information · explaining acceptance or rejection of AI suggestions · respectful comments with reasons · acknowledging help",
  lessonNote: "The choices are practice, without ethics scores or student completion records. Observe actions through questions, comments, growth records, and discussion. Read aloud and accept spoken responses from younger learners.",
};

export function aiEthicsContentForLocale(locale: string): EthicsContent {
  return locale.toLowerCase().startsWith("en") ? en : ko;
}

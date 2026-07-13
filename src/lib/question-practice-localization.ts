import {
  type PracticeCreateTopic,
  type PracticeQuizItem,
  type PracticeTransformItem,
} from "@/lib/question-practice-data";

type QuizText = Pick<PracticeQuizItem, "content" | "explanation">;
type TransformText = Pick<PracticeTransformItem, "source" | "hint" | "example">;
type CreateText = Pick<PracticeCreateTopic, "title" | "passage">;

const QUIZ_EN: Record<string, QuizText> = {
  q01: { content: "What does 'cultural heritage' mean?", explanation: "This checks the meaning of an important term. It has a fixed answer, so it is a closed factual question." },
  q02: { content: "What cultural heritage sites are in our region?", explanation: "This asks for information you can research and list, so it is a factual question." },
  q03: { content: "What animals live in forests?", explanation: "This asks for examples that can be researched and listed." },
  q04: { content: "How many right angles does a right triangle have?", explanation: "You can count and find one fixed answer." },
  q05: { content: "In what order should a cultural heritage field report be written?", explanation: "This asks about a known procedure, so it is factual." },
  q06: { content: "Why did the French Revolution happen?", explanation: "It begins with why, but the expected answer can be checked in a textbook." },
  q07: { content: "What three things are needed for photosynthesis?", explanation: "This checks remembered information with a fixed answer." },
  q08: { content: "What title is written on the movie poster?", explanation: "This checks visible information directly." },
  q09: { content: "What animal group did Noden grow up with?", explanation: "The answer can be found directly in the book." },
  q10: { content: "What relationship do rectangles and squares have?", explanation: "This asks about the relationship between two concepts. The answer is mathematically fixed." },
  q11: { content: "Why do animals have different traits depending on their environment?", explanation: "This connects facts to think about causes and principles." },
  q12: { content: "What does biodiversity mean for an ecosystem?", explanation: "This asks you to interpret meaning and importance." },
  q13: { content: "How might cultural heritage affect the future?", explanation: "This applies a learned concept to a new situation." },
  q14: { content: "What value can be found across many cultural heritage sites?", explanation: "This generalizes from several examples, so it is conceptual." },
  q15: { content: "Why might Noden have called the horizon his sea?", explanation: "You must infer the character's feelings, and more than one answer is possible." },
  q16: { content: "What story might the two people in the poster be sharing?", explanation: "This uses visible evidence to infer a situation, so many answers are possible." },
  q17: { content: "Why might the number of consumers have increased?", explanation: "This changes a yes/no check into a question about causes." },
  q18: { content: "What do you think it means when the young penguin says, 'I will live as a rhinoceros'?", explanation: "This asks you to interpret hidden meaning, so answers may differ." },
  q19: { content: "Is it fair to limit public access to protect cultural heritage?", explanation: "Both sides are possible, so you must judge with your own criteria." },
  q20: { content: "Which should come first: biodiversity or human convenience?", explanation: "This asks you to judge between conflicting values." },
  q21: { content: "What is the best way to use cultural heritage to support the local economy?", explanation: "You must choose the best solution and support it with reasons." },
  q22: { content: "What should we do if a new building is planned where cultural heritage already exists?", explanation: "This asks you to compare viewpoints in an imagined conflict." },
  q23: { content: "Which plane shape do you think is most useful in daily life?", explanation: "There is no single fixed answer; your criteria and reasons matter." },
  q24: { content: "What difficulties might future generations face if biodiversity is destroyed?", explanation: "This asks you to predict the future and consider responsibility." },
  q25: { content: "At what temperature does water begin to boil?", explanation: "This has one answer that can be measured or looked up." },
  q26: { content: "What is the capital of Korea?", explanation: "This asks for a fixed place name." },
  q27: { content: "Where did the event in this story happen?", explanation: "The answer can be found directly in the text." },
  q28: { content: "How many sides does a triangle have?", explanation: "Counting gives one fixed factual answer." },
  q29: { content: "When does a shadow form?", explanation: "This checks a fixed fact about light being blocked." },
  q30: { content: "Who created Hangeul?", explanation: "This checks a historical fact about a person." },
  q31: { content: "What does a tadpole grow into?", explanation: "This checks a fixed fact in a life cycle." },
  q32: { content: "How should recyclable waste be sorted?", explanation: "Although it starts with how, it asks for a known rule or procedure." },
  q33: { content: "On a map without a compass rose, which direction is usually at the top?", explanation: "This checks a map convention with a fixed answer." },
  q34: { content: "What materials come out when a volcano erupts?", explanation: "This asks for a list of related things that can be researched." },
  q35: { content: "Why are reasons needed in persuasive writing?", explanation: "This starts with why, but it checks a textbook idea." },
  q36: { content: "How do people's lives change when the seasons change?", explanation: "This connects the concept of seasons to daily life." },
  q37: { content: "What relationship do fractions and decimals have?", explanation: "This asks about the relationship between two mathematical concepts." },
  q38: { content: "How do rural villages and cities help each other?", explanation: "This connects relationships and interactions between places." },
  q39: { content: "How are changes in the state of water related to drying laundry?", explanation: "This connects a science concept to everyday life." },
  q40: { content: "Why did the main character make that choice?", explanation: "You must infer the character's mind because the answer is not stated directly." },
  q41: { content: "How have changes in communication tools changed people's lives?", explanation: "This connects causes and effects over time." },
  q42: { content: "What might happen to an ecosystem if a food chain is broken?", explanation: "This predicts results based on a concept." },
  q43: { content: "What changes might happen in our class if we act honestly?", explanation: "This applies the value of honesty to a class situation." },
  q44: { content: "When are bar graphs and line graphs each more useful?", explanation: "This compares two concepts and applies them to situations." },
  q45: { content: "Why is voting important in democracy?", explanation: "This interprets the meaning and value of a system." },
  q46: { content: "Why are buildings in earthquake-prone areas built in special ways?", explanation: "This connects a natural phenomenon with human preparation." },
  q47: { content: "What feeling can mimetic words create in a poem?", explanation: "This interprets the effect of a writing technique." },
  q48: { content: "What relationship is there between disposable products and pollution?", explanation: "This connects cause and effect between two phenomena." },
  q49: { content: "Should smartphones be allowed at school?", explanation: "This is a debatable issue with possible arguments on both sides." },
  q50: { content: "What is the best way to reduce leftover food at school lunch?", explanation: "You must choose the best solution and support it with reasons." },
  q51: { content: "Are zoos places that protect animals or places that confine them?", explanation: "This asks you to judge one topic from different viewpoints." },
  q52: { content: "Which does our neighborhood need more, development or environmental protection?", explanation: "This asks you to choose a priority between conflicting values." },
  q53: { content: "If we could not use electricity for a day, what should we prepare first?", explanation: "This asks you to set priorities in an imagined situation." },
  q54: { content: "If you see a friend's mistake, is it right to speak up or stay silent?", explanation: "This asks you to judge right and wrong in a value conflict." },
  q55: { content: "What is the best way to bring more people to our local festival?", explanation: "This asks for a proposal and persuasive reasons." },
  q56: { content: "Is it good for robots to replace human work?", explanation: "This asks you to compare advantages and disadvantages from several viewpoints." },
  q57: { content: "Which should come first, preserving old buildings or building new facilities?", explanation: "This asks you to compare reasons and decide a priority." },
  q58: { content: "Do you agree or disagree with keeping a class pet?", explanation: "This asks you to take a position and give reasons." },
  q59: { content: "If water becomes scarce, how should people share it fairly?", explanation: "This asks you to define fairness in a future situation." },
  q60: { content: "Do you think homework is necessary?", explanation: "There is no fixed answer; you need to use your own experience and criteria." },
};

const TRANSFORM_EN: Record<string, TransformText> = {
  t01: { source: "What is the name of the picture book's main character?", hint: "Instead of checking the name, ask about the character's action or feelings.", example: "What result might the main character's action bring?" },
  t02: { source: "Did the number of consumers increase?", hint: "Do not make it end with yes or no. Ask about causes or effects.", example: "Why might the number of consumers have increased?" },
  t03: { source: "What cultural heritage sites are in our region?", hint: "Instead of asking for a list, ask what cultural heritage shows us.", example: "How does cultural heritage show the thoughts and lives of people from the past?" },
  t04: { source: "What animals live in forests?", hint: "Change what into why or how to ask about causes or principles.", example: "Why do animals have traits that fit forest environments?" },
  t05: { source: "How many angles does a rectangle have?", hint: "Instead of counting, ask about relationships or properties.", example: "What relationship do rectangles and squares have?" },
  t06: { source: "What three things are needed for photosynthesis?", hint: "Instead of listing what is needed, connect what each thing does.", example: "How does the strength of light change photosynthesis?" },
  t07: { source: "What endangered animals live in Korea?", hint: "Make a situation where different positions can conflict instead of stopping at research.", example: "Which should come first, protecting endangered animals or development?" },
  t08: { source: "What does 'cultural heritage' mean?", hint: "Instead of defining the word, imagine a situation where people may disagree.", example: "Is it fair to charge an entrance fee for viewing cultural heritage?" },
  t09: { source: "What are some ways to save energy?", hint: "Ask which method is best and what criteria should be used.", example: "How much inconvenience should we accept to save energy?" },
  t10: { source: "How do trees change when the seasons change?", hint: "Change a fact you can observe into a question that needs inference or imagination.", example: "What might happen to trees and forests if the seasons never changed?" },
};

const CREATE_EN: Record<string, CreateText> = {
  c01: { title: "Cultural heritage", passage: "Our region has old fortress walls and a traditional village. Many tourists visit every year, but some parts are damaged as more people walk through the area." },
  c02: { title: "Biodiversity", passage: "Forests, rivers, deserts, and polar regions are home to different animals and plants. Recently, more living things are disappearing as habitats vanish and the climate changes." },
  c03: { title: "Plane shapes", passage: "The classroom door is a rectangle, colored paper is a square, and a set square has a right triangle shape. Many plane shapes are hidden in objects around us." },
  c04: { title: "The Long Long Night", passage: "Noden the rhinoceros grew up with elephants, and a young penguin was born from an abandoned egg. Two different beings become 'us' and travel together to find the sea." },
  c05: { title: "Our neighborhood", passage: "Our neighborhood has a market, a park, and a library. Residents have different opinions after hearing that old alleys may disappear through redevelopment." },
  c06: { title: "Energy and environment", passage: "Making electricity can produce greenhouse gases. Solar and wind power are alternatives, but they cost a lot and need large spaces." },
  c07: { title: "Photosynthesis", passage: "Plants use light, water, and carbon dioxide to make their own food. This process is called photosynthesis, and it mostly happens in leaves." },
  c08: { title: "School lunch", passage: "Our school lunch menu is planned for balanced nutrition. However, much food is left over, so food waste has become a concern." },
};

export function localizePracticeQuizItem(item: PracticeQuizItem, locale: string): PracticeQuizItem {
  return locale === "en" && QUIZ_EN[item.id] ? { ...item, ...QUIZ_EN[item.id] } : item;
}

export function localizePracticeTransformItem(item: PracticeTransformItem, locale: string): PracticeTransformItem {
  return locale === "en" && TRANSFORM_EN[item.id] ? { ...item, ...TRANSFORM_EN[item.id] } : item;
}

export function localizePracticeCreateTopic(item: PracticeCreateTopic, locale: string): PracticeCreateTopic {
  return locale === "en" && CREATE_EN[item.id] ? { ...item, ...CREATE_EN[item.id] } : item;
}

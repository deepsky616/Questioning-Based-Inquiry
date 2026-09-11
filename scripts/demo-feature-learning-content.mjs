import { GRADE_FIVE_LESSONS, buildGradeFiveDesign } from './demo-grade-five-content.mjs';
import { VARIETY_STUDENT_IDS, canonical } from './demo-learning-variety.mjs';

export const FEATURE_PREFIX = 'usb-demo-feature-v1-';
export const FEATURE_TEACHER = 'usb-demo-teacher';
export const FEATURE_STUDENTS = VARIETY_STUDENT_IDS;
const student = number => FEATURE_STUDENTS[number - 1];
export const dayKey = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date);

// 기존 5학년 성취기준 자료에 연결한 추가 활동이다. 직접 작성한 기존 자료는 갱신하지 않는다.
export const FEATURE_LESSONS = [
  {
    key: 'pastKorean', slug: 'evidence', participants: [2, 3, 5, 7, 9, 12, 16],
    questions: [
      ['설문 결과는 믿어도 될까요?', '우리 반 5명에게 물은 설문으로 학교 학생 모두가 독서 시간을 늘리고 싶다고 말해도 될까요?', 'open', 'controversial',
        '누구에게 몇 명이나 물었는지를 질문에 넣었어요. 조사 결과로 말할 수 있는 범위가 알맞은지 따져 보고 싶었어요.',
        '우리 반 몇 명의 생각만으로 학교 전체의 생각을 정할 수 없다는 것을 알았어요. 다른 반과 학년도 같은 방법으로 조사해 보고 싶어요.',
        ['다른 학년은 생각이 다를 수 있어요. 학년별로 골고루 물어본 뒤 결과를 비교하면 좋겠어요.', '독서를 좋아하는 친구에게만 물었는지도 확인해야 해요. 조사한 사람을 고르는 방법도 결과에 영향을 줄 것 같아요.', '질문에 응답한 5명과 학교 전체 학생 수를 함께 적으면 자료의 범위를 알기 쉬울 것 같아요.']],
      ['광고는 왜 과장할까요?', '광고에 적힌 모두가 좋아한다는 표현을 확인하려면 어떤 조사 자료가 필요할까요?', 'open', 'factual',
        '광고를 믿는지 묻는 대신 확인해야 할 자료가 무엇인지 물었어요. 출처와 응답 수를 직접 찾아볼 수 있게 바꿨어요.', '',
        ['누가 조사했는지와 몇 명이 답했는지가 필요해요. 찬성한 사람뿐 아니라 반대한 사람의 수도 확인하고 싶어요.', '자료를 조사한 날짜도 찾아보면 좋겠어요. 오래전 결과를 지금 사람들의 생각처럼 표현했을 수 있어요.']],
    ],
    peerNotes: [
      ['친구 한 명의 경험과 우리 반 전체의 생각을 구분해서 질문했어요.', '한 사람의 경험만으로 모두의 생각을 설명하기는 어려워요. 여러 친구의 의견을 같은 방법으로 조사해야 해요.'],
      ['자료를 만든 사람과 조사 시기를 함께 확인하도록 질문을 만들었어요.', ''],
      ['같은 설문 결과로 만든 두 주장의 근거를 비교하는 질문을 썼어요.', '자기 생각에 유리한 응답만 골라 소개하지 않았는지도 확인해야 해요.'],
    ],
  },
  {
    key: 'pastMath', slug: 'average', participants: [2, 4, 6, 8, 10, 13, 17, 20, 24],
    questions: [
      ['평균이 같으면 똑같나요?', '읽은 책이 1권·4권·7권인 모둠과 모두 4권인 모둠은 평균이 같은데 독서 모습도 같다고 할 수 있을까요?', 'open', 'conceptual',
        '평균이 같은 두 모둠의 실제 자료를 넣었어요. 계산한 값과 친구들의 독서 모습이 어떻게 다른지 비교하고 싶었어요.',
        '두 모둠 모두 평균은 4권이지만 개인별로 읽은 권수는 달라요. 평균만 보지 않고 각각의 값도 확인해야 해요.',
        ['첫 모둠은 읽은 권수의 차이가 크고 둘째 모둠은 모두 같아요. 평균과 개인별 기록을 함께 표로 보면 차이가 잘 보여요.', '두 모둠 모두 합계가 12권이라 평균은 4권이에요. 그렇다고 첫 모둠 친구들이 실제로 4권씩 읽은 것은 아니에요.', '책의 권수 외에도 조사 기간이 같았는지 확인해야 비교가 공정할 것 같아요.']],
      ['평균은 어떻게 구하나요?', '세 친구가 걸은 거리가 2킬로미터·3킬로미터·7킬로미터일 때 평균 거리는 몇 킬로미터일까요?', 'closed', 'factual',
        '', '',
        ['합계 12킬로미터를 세 사람에게 고르게 나누면 평균은 4킬로미터예요. 단위도 함께 적어야 해요.', '세 친구가 모두 4킬로미터를 걸었다는 뜻은 아니에요. 실제로 걸은 거리는 2·3·7킬로미터예요.']],
    ],
    peerNotes: [
      ['2권·4권·6권이라는 실제 자료와 평균 4권의 뜻을 연결해서 물었어요.', '평균 4권은 고르게 나눈 값이에요. 모두가 실제로 4권씩 읽었다는 뜻은 아니에요.'],
      ['합계뿐 아니라 모둠 인원수도 생각해서 질문했어요.', '인원수가 다른 모둠을 비교할 때 한 사람당 평균을 구하면 도움이 돼요.'],
      ['네 자료를 모두 더한 뒤 자료 수로 나누도록 계산 순서를 생각하며 질문했어요.', ''],
    ],
  },
  {
    key: 'today', slug: 'insulation', participants: [3, 5, 7, 11, 14, 18],
    questions: [
      ['어떤 컵이 따뜻할까요?', '물의 양과 처음 온도가 같은 컵을 천으로 감싼 경우와 감싸지 않은 경우에 10분 뒤 온도 변화는 어떻게 다를까요?', 'open', 'conceptual',
        '무엇을 같게 하고 무엇을 바꿀지 적었어요. 따뜻하다는 느낌 대신 정해진 시간 뒤 온도 변화를 비교하도록 고쳤어요.',
        '보온 재료를 비교하려면 물의 양과 처음 온도, 컵의 종류를 같게 해야 해요. 한 번의 결과만으로 정하지 않고 다시 측정해 보고 싶어요.',
        ['같은 종류의 컵을 같은 장소에 두어야 할 것 같아요. 바람이 드는 정도가 다르면 온도 변화에도 영향을 줄 수 있어요.', '천의 두께와 감싼 횟수도 기록해 두면 다른 모둠이 같은 방법으로 확인할 수 있어요.', '뜨거운 물을 직접 만지지 않고 선생님 안내에 따라 온도계를 사용해서 비교하겠어요.']],
      ['단열 장치는 무엇이 좋나요?', '우리 반에서 쓸 보온 덮개를 고를 때 온도 변화·재사용·만들기 쉬운 정도 중 어떤 기준을 더 중요하게 생각해야 할까요?', 'open', 'controversial',
        '좋다는 말 대신 비교할 기준 세 가지를 정했어요. 친구마다 선택이 다를 수 있어서 그 까닭도 듣고 싶어요.', '',
        ['오랫동안 여러 번 쓸 물건이라면 재사용을 중요하게 보고 싶어요. 그래도 보온이 되는지는 먼저 측정해야 해요.', '우리 손으로 만드는 활동이라면 만들기 쉬운지도 필요해요. 각 기준에 점수를 주되 이유를 함께 적어 보면 어떨까요?']],
    ],
    peerNotes: [
      ['손으로 느낀 따뜻함 대신 온도계로 확인할 수 있게 질문을 만들었어요.', '온도가 높은 곳에서 낮은 곳으로 열이 이동한다는 설명을 측정 결과와 연결할 수 있었어요.'],
      ['다른 모둠도 따라 할 수 있도록 물의 양과 기다린 시간을 적었어요.', '같게 할 조건을 빠뜨리면 재료 때문에 결과가 달라졌는지 판단하기 어려워요.'],
      ['보온 성능과 재사용을 함께 비교하는 질문으로 바꾸었어요.', ''],
    ],
  },
  {
    key: 'future', slug: 'relics', participants: [2, 4, 6, 9, 15, 19, 21, 22, 25, 26, 28],
    questions: [
      ['옛사람은 어떻게 살았나요?', '토기의 그을음과 집터의 화덕 흔적을 함께 보면 옛사람들의 음식 조리 모습을 어떤 근거로 추측할 수 있을까요?', 'open', 'conceptual',
        '옛 생활 전체를 묻던 질문에 살펴볼 자료와 음식 조리라는 범위를 넣었어요. 사진에서 보이는 사실과 내 추측도 나누어 적었어요.',
        '그을음과 화덕은 불을 사용한 생활을 생각해 볼 단서예요. 어떤 음식을 먹었는지까지 단정하려면 다른 자료도 필요해요.',
        ['토기 표면에 실제로 보이는 부분을 먼저 표시한 뒤 추측을 적으면 근거가 분명해질 것 같아요.', '같은 시기의 자료인지도 확인해야 해요. 서로 다른 시대의 물건을 한 집에서 쓴 것처럼 설명하면 안 될 것 같아요.', '음식 종류를 더 알아보려면 곡식 흔적이나 동물 뼈 같은 자료도 함께 살펴보고 싶어요.']],
      ['유물은 무엇을 알려 주나요?', '청동 도구 한 점을 발견했다고 그 시대 사람들이 모두 청동 도구를 썼다고 설명해도 될까요?', 'open', 'controversial',
        null, null,
        ['한 점만으로 모두가 썼다고 말하기는 어려워요. 돌도구가 함께 발견되었는지도 알아보면 좋겠어요.', '발견된 장소와 물건의 수를 비교해 보고 싶어요. 어떤 사람이 사용했는지는 자료가 더 있어야 판단할 수 있어요.']],
    ],
    peerNotes: [
      ['사진에서 본 사실 뒤에 그 사실로 생각한 생활 모습을 이어 썼어요.', '추측도 근거를 밝히고 다른 가능성을 살피면 더 설득력 있게 설명할 수 있어요.'],
      ['유물의 모양뿐 아니라 발견된 장소도 확인하도록 질문했어요.', ''],
      ['토기만 보는 경우와 농사 도구·곡식 흔적도 함께 보는 경우를 비교했어요.', '여러 자료가 알려 주는 내용을 연결하면 옛사람의 먹거리에 대한 추측을 더 잘 뒷받침할 수 있어요.'],
    ],
  },
];

export const FEATURE_BANK = [
  {mode:'quiz',content:'5명이 찬성 또는 반대 중 하나를 고른 설문에서 찬성이 3명이면 반대는 몇 명인가요?',closure:'closed',cognitive:'factual',explanation:'모두 찬성 또는 반대로 답했다는 조건에서 반대는 2명으로 정해져 있어요. 제시된 수로 확인하는 닫힌 사실적 질문이에요.'},
  {mode:'quiz',content:'읽은 책이 2권·4권·6권일 때 평균은 몇 권인가요?',closure:'closed',cognitive:'factual',explanation:'합계 12권을 3명으로 나눈 평균은 4권이에요. 하나의 계산 결과를 확인하는 닫힌 사실적 질문이에요.'},
  {mode:'quiz',content:'평균이 같은 두 모둠의 개인별 기록을 함께 살펴야 하는 까닭은 무엇인가요?',closure:'open',cognitive:'conceptual',explanation:'평균과 개별 자료의 관계를 설명하는 질문이에요. 서로 다른 자료나 예를 들어 설명할 수 있어 열린 개념적 질문이에요.'},
  {mode:'quiz',content:'단열 재료를 비교할 때 물의 양과 처음 온도를 같게 해야 하는 까닭은 무엇인가요?',closure:'open',cognitive:'conceptual',explanation:'실험 조건과 공정한 비교의 관계를 묻고 있어요. 조건이 다른 여러 사례로 설명할 수 있는 열린 개념적 질문이에요.'},
  {mode:'quiz',content:'학급 신문에 설문 결과를 소개할 때 적은 수의 반대 의견도 함께 실어야 할까요?',closure:'open',cognitive:'controversial',explanation:'찬반 선택과 함께 어떤 기준을 중요하게 보는지 설명해야 해요. 여러 입장을 근거로 비교하는 열린 논쟁적 질문이에요.'},
  {mode:'quiz',content:'옛 생활을 살펴볼 수 있는 유적과 유물에는 어떤 것들이 있나요?',closure:'open',cognitive:'factual',explanation:'집터·토기·돌도구처럼 확인 가능한 여러 사례를 답할 수 있어요. 사실을 묻는 질문도 답의 범위가 넓으면 열린 질문이에요.'},
  {mode:'transform',source:'이 설문 자료는 믿을 만한가요?',target:'open',hint:'예 또는 아니요로 끝나지 않도록 자료에서 무엇을 확인할지 물어보세요.',example:'이 설문 자료를 믿을 만한지 판단하려면 조사 대상과 방법에서 무엇을 확인해야 할까요?'},
  {mode:'transform',source:'이 모둠의 평균은 몇 권인가요?',target:'conceptual',hint:'계산한 값과 각각의 자료가 어떤 관계인지 생각해 보세요.',example:'두 모둠의 평균이 같아도 개인별 독서량이 다를 수 있는 까닭은 무엇일까요?'},
  {mode:'transform',source:'컵을 감싼 재료는 무엇인가요?',target:'controversial',hint:'재료를 고르는 기준을 정하고 서로 다른 선택의 이유를 비교해 보세요.',example:'보온 덮개를 고를 때 보온 성능과 재사용 중 어느 기준을 더 중요하게 생각해야 할까요?'},
  {mode:'create',title:'두 모둠의 같은 평균',passage:'가 모둠의 세 친구는 책을 1권, 4권, 7권 읽었고, 나 모둠은 모두 4권씩 읽었습니다. 두 모둠의 조사 기간과 책을 센 기준은 같습니다. 평균과 개인별 기록을 함께 살펴보고 비교할 질문을 만들어 보세요.'},
  {mode:'create',title:'우리 반 보온 덮개 고르기',passage:'같은 양과 처음 온도의 물을 같은 컵에 담았습니다. 한 컵은 천으로 감싸고 다른 컵은 감싸지 않았습니다. 같은 장소에서 정해진 시간 뒤 온도를 비교하려고 합니다. 같게 할 조건과 알아보고 싶은 점을 생각하며 질문을 만들어 보세요.'},
  {mode:'create',title:'유물 사진에서 찾은 단서',passage:'박물관 자료에는 같은 시기의 토기 사진과 집터 그림이 있습니다. 토기에는 그을음이, 집터에는 화덕 흔적이 보입니다. 사진에서 확인한 사실과 생활 모습에 대한 추측을 구분하며 더 알아보고 싶은 질문을 만들어 보세요.'},
];

function schoolDays(anchor) {
  const cursor = new Date(`${dayKey(anchor)}T09:00:00+09:00`);
  const result = [];
  while (result.length < 4) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (![0, 6].includes(new Date(cursor.getTime() + 9 * 3600000).getUTCDay())) result.unshift(new Date(cursor));
  }
  return result;
}

export function buildFeatureLearningPlan(before, anchor = new Date()) {
  const teacher = before.teachers?.[0];
  if (before.teachers?.length !== 1 || teacher.id !== FEATURE_TEACHER || !teacher.isDemo || teacher.role !== 'TEACHER' || teacher.school !== '질문초등학교' || teacher.name !== '김탐구') throw new Error('지정된 시연 교사 신원이 일치하지 않습니다.');
  if (!before.classes?.some(row => row.teacherId === FEATURE_TEACHER && row.grade === '5' && row.className === '1')) throw new Error('시연 교사의 담당 학급이 일치하지 않습니다.');
  if (before.users.length !== 28 || before.users.some((user, index) => user.id !== FEATURE_STUDENTS[index] || !user.isDemo || user.role !== 'STUDENT' || user.school !== teacher.school || user.grade !== '5' || user.className !== '1') || before.users[0].name !== '김질문') throw new Error('지정된 5학년 1반 시연 학생 범위가 일치하지 않습니다.');
  if (!Number.isFinite(anchor.getTime())) throw new Error('시연 자료 기준 날짜가 올바르지 않습니다.');
  if (Object.values(before).some(rows => rows.some(row => (row.id ?? row.questionId)?.startsWith(FEATURE_PREFIX)))) throw new Error('이미 추가한 시연 자료가 있어 중복 적용하지 않았습니다.');
  if (before.bank.length + FEATURE_BANK.length > 200) throw new Error('교사 문항 수가 허용 범위를 넘습니다.');
  for (const user of before.users) {
    const sum = before.pointLogs.filter(log => log.studentId === user.id && log.status === 'APPROVED').reduce((total, log) => total + log.points, 0);
    if (sum !== user.totalPoints) throw new Error('기존 포인트가 실제 지급 합계와 일치하지 않습니다.');
  }
  const dates = schoolDays(anchor);
  const creates = Object.fromEntries(['sessions', 'designs', 'questions', 'growth', 'reviews', 'comments', 'likes', 'bank', 'practices', 'pointLogs'].map(key => [key, []]));
  const updates = { users: [], growth: [] };
  // 사용자가 함께 수정하도록 지정한 두 메모만 구체화한다. 질문 원문과 수정 문장은 유지한다.
  const previousGrowth = [
    {
      originalContent: '같은 따뜻한 물을 담은 컵을 천으로 감싸면 식는 속도가 달라지는 까닭은 무엇일까요?',
      revisedContent: '같은 따뜻한 물을 담은 컵을 천으로 감싸면 식는 속도가 달라지는 까닭은 무엇일까요?',
      changeNote: '질문을 고쳤어요', reflection: '잘 알았어요',
      nextNote: '천으로 감싼 컵과 감싸지 않은 컵을 비교하는 질문을 만들었어요. 물이 식는 속도가 다른 까닭을 알아보고 싶었어요.',
      nextReflection: '천으로 감싸면 주변으로 열이 전달되는 것을 줄이는 데 도움이 돼요. 두 컵을 비교할 때 물의 양과 처음 온도, 컵의 종류도 같게 해야 한다는 점을 알았어요.',
    },
    {
      originalContent: '유물이 뭐니?', revisedContent: '유물을 무엇이라고 하니?',
      changeNote: '더 자세히 바꿨다.', reflection: '자세히 써야 한다.',
      nextNote: '유물의 뜻을 물어보는 짧은 문장을 다른 말로 고쳐 보았어요. 다음에는 토기나 돌도구처럼 궁금한 예를 넣어 무엇을 알아볼지 더 분명하게 묻고 싶어요.',
      nextReflection: '유물은 옛사람들이 만들어 사용하고 남긴 물건이라는 것을 알았어요. 물건의 모습에서 확인한 사실과 옛 생활에 대한 내 추측을 구분해야 해요.',
    },
  ];
  for (const expected of previousGrowth) {
    const matches = before.growth.filter(row => before.questions.some(q => q.id === row.questionId && q.authorId === student(1)) && ['originalContent', 'revisedContent', 'changeNote', 'reflection'].every(key => row[key] === expected[key]));
    if (matches.length !== 1) throw new Error('수정 대상으로 지정된 기존 성장 기록이 달라 적용하지 않았습니다.');
    const current = matches[0];
    updates.growth.push({ id: current.questionId, data: { changeNote: expected.nextNote, reflection: expected.nextReflection, revision: current.revision + 1, updatedAt: anchor } });
  }
  const minute = (date, n) => new Date(date.getTime() + n * 60000);
  for (const [index, activity] of FEATURE_LESSONS.entries()) {
    const lesson = GRADE_FIVE_LESSONS[activity.key];
    const date = dates[index];
    const sessionId = `${FEATURE_PREFIX}session-${activity.slug}`;
    const id = `${FEATURE_PREFIX}design-${activity.slug}`;
    const { key: _key, ...design } = buildGradeFiveDesign({ key: activity.key, unitDesignId: id });
    const createdAt = minute(date, -24 * 60);
    creates.designs.push({ ...design, teacherId: FEATURE_TEACHER, sessionDate: dayKey(date), targetClassValue: '5-1', targetStudentIds: FEATURE_STUDENTS, createdAt, updatedAt: createdAt });
    // 세 수업은 배포 완료, 사회 수업은 아직 배포하지 않은 설계로 두어 두 흐름을 모두 보여 준다.
    const shared = index === 3 ? [] : design.inquiryQuestions.map((q, qi) => ({
      ...q, id: `${FEATURE_PREFIX}shared-${activity.slug}-${qi + 1}`, publishedAt: date.toISOString(), priority: qi + 1,
      source: 'teacher', contentGroup: q.type === 'factual' ? '자료에서 확인하기' : q.type === 'conceptual' ? '관계와 까닭 찾기' : '근거로 판단하기',
      lessonPhase: q.type === 'factual' ? '탐구 시작' : q.type === 'conceptual' ? '탐구 전개' : '생각 나누기',
    }));
    creates.sessions.push({ id: sessionId, teacherId: FEATURE_TEACHER, date: dayKey(date), subject: lesson.subject, topic: lesson.topic, targetType: 'CLASS', targetGrade: '5', targetClassName: '1', targetStudentIds: FEATURE_STUDENTS, unitDesignId: id, sharedQuestions: shared, isActive: true, defaultQuestionPublic: true, likesVisibleToPeers: true, commentsVisibleToPeers: true, createdAt });
    for (const q of shared) creates.questions.push({ id: q.id, sessionId, authorId: FEATURE_TEACHER, content: q.content, closure: q.closure, cognitive: q.type, context: lesson.topic, source: 'TEACHER_SHARED', inquiryType: q.type, isPublic: true, createdAt: date, updatedAt: date });
    const ownQuestions = [];
    for (const [qi, [original, content, closure, cognitive, changeNote, reflection, replies]] of activity.questions.entries()) {
      const questionId = `${FEATURE_PREFIX}question-${activity.slug}-01-${qi + 1}`;
      const questionTime = minute(date, 10 + qi * 8);
      creates.questions.push({ id: questionId, sessionId, authorId: student(1), content, closure, cognitive, context: lesson.topic, source: 'STUDENT', inquiryType: cognitive, isPublic: true, createdAt: questionTime, updatedAt: questionTime });
      ownQuestions.push(questionId);
      if (changeNote !== null) creates.growth.push({ questionId, originalContent: original, revisedContent: content, changeNote, reflection, revision: 1, createdAt: questionTime, updatedAt: minute(date, 50 + qi) });
      for (const [ri, text] of replies.entries()) creates.comments.push({ id: `${FEATURE_PREFIX}comment-${activity.slug}-01-${qi + 1}-${ri + 1}`, questionId, authorId: student(activity.participants[(ri + qi) % activity.participants.length]), content: text, createdAt: minute(date, 32 + qi * 5 + ri) });
    }
    for (const [pi, number] of activity.participants.entries()) {
      const q = lesson.questions[pi % lesson.questions.length];
      const questionId = `${FEATURE_PREFIX}question-${activity.slug}-${number}-1`;
      const questionTime = minute(date, 12 + pi * 2);
      creates.questions.push({ id: questionId, sessionId, authorId: student(number), content: q.content, closure: q.closure, cognitive: q.type, context: lesson.topic, source: 'STUDENT', inquiryType: q.type, isPublic: pi !== activity.participants.length - 1, createdAt: questionTime, updatedAt: questionTime });
      if (pi < 3) {
        const [changeNote, reflection] = activity.peerNotes[pi];
        creates.growth.push({ questionId, originalContent: q.content, revisedContent: q.content, changeNote, reflection, revision: 1, createdAt: questionTime, updatedAt: minute(date, 55 + pi) });
      }
      // 댓글은 해당 질문의 예상 답변과 후속 탐구 제안으로 구성하고, 질문별로 한 번씩만 사용한다.
      if (pi < lesson.questions.length) creates.comments.push({ id: `${FEATURE_PREFIX}comment-${activity.slug}-peer-${number}`, questionId, authorId: student(1), content: q.answer, createdAt: minute(date, 40 + pi) });
    }
    const sessionQuestions = creates.questions.filter(q => q.sessionId === sessionId && q.source === 'STUDENT' && q.isPublic);
    for (const [qi, q] of sessionQuestions.entries()) {
      const count = (qi * 3 + index + 2) % 6;
      const candidates = FEATURE_STUDENTS.filter(id => id !== q.authorId);
      for (let li = 0; li < count; li++) creates.likes.push({ id: `${FEATURE_PREFIX}like-${activity.slug}-${qi}-${li}`, questionId: q.id, userId: candidates[(qi * 2 + li) % candidates.length], createdAt: minute(date, 60 + qi + li) });
    }
    const own = creates.questions.find(q => q.id === ownQuestions[0]);
    const reasons = [
      '학교 전체로 결론을 넓혀도 되는지 판단 기준과 근거를 비교하므로 논쟁적 질문으로 확인했습니다. 조사 대상의 범위를 넣어 논의할 쟁점이 분명해졌습니다.',
      '평균 계산만 요구하지 않고 평균과 개인별 자료의 관계를 설명하므로 개념적 질문입니다. 두 모둠의 구체적인 수치를 넣어 비교하기 좋습니다.',
      '단열 조건과 온도 변화의 관계를 설명하는 개념적 질문입니다. 물의 양·처음 온도·측정 시간을 적어 공정한 비교가 가능하도록 다듬었습니다.',
      '여러 유적·유물의 단서를 연결해 생활 모습을 추론하는 개념적 질문입니다. 관찰한 사실과 추측을 구분하고 추가로 필요한 자료도 생각해 보세요.',
    ];
    creates.reviews.push({ id: `${FEATURE_PREFIX}review-${activity.slug}-01`, questionId: own.id, reviewerId: FEATURE_TEACHER, previousClosure: own.closure, previousCognitive: own.cognitive, closure: own.closure, cognitive: own.cognitive, reason: reasons[index], createdAt: anchor });
  }
  creates.sessions.push({ id: `${FEATURE_PREFIX}session-quick`, teacherId: FEATURE_TEACHER, date: dayKey(anchor), subject: '과학', topic: '열의 이동과 단열 · 우리 생활 속 궁금증', targetType: 'CLASS', targetGrade: '5', targetClassName: '1', targetStudentIds: FEATURE_STUDENTS, sharedQuestions: [], isActive: true, defaultQuestionPublic: true, likesVisibleToPeers: true, commentsVisibleToPeers: true, createdAt: new Date(anchor.getTime() - 60000) });
  FEATURE_BANK.forEach((item, index) => creates.bank.push({ ...item, id: `${FEATURE_PREFIX}practice-item-${index + 1}`, teacherId: FEATURE_TEACHER, isActive: true, createdAt: minute(dates[0], -120 - index), updatedAt: minute(dates[0], -120 - index) }));
  // 학생별 빈도·성공률·질문 유형을 다르게 구성한다. 기존 시도와 포인트는 그대로 보존한다.
  const profiles = [[1,18,7],[2,10,9],[3,13,6],[4,5,4],[5,12,8],[6,7,5],[7,15,9],[9,9,6],[11,6,4],[14,11,7],[20,8,5],[24,14,8]];
  for (const [number, count, success] of profiles) {
    for (let turn = 0; turn < count; turn++) {
      const itemIndex = (turn + number - 1) % FEATURE_BANK.length;
      const item = creates.bank[itemIndex];
      const quizType = item.mode === 'quiz' ? (turn % 2 === 0 ? 'closure' : 'cognitive') : null;
      const correct = (turn * 7 + number * 3) % 10 < success;
      const createdAt = minute(dates[Math.min(3, Math.floor(turn * 4 / count))], 110 + number + turn);
      creates.practices.push({ id: `${FEATURE_PREFIX}practice-${number}-${turn + 1}`, studentId: student(number), mode: item.mode, itemId: item.id, quizType, correct, createdAt });
      if (!correct) continue;
      const roomCode = `${item.mode}:${item.id}${quizType ? ':' + quizType : ''}:${dayKey(createdAt)}`;
      const ledger = [...before.pointLogs, ...creates.pointLogs].filter(log => log.studentId === student(number) && log.gameId === 'PRACTICE' && log.status === 'APPROVED');
      if (ledger.some(log => log.roomCode === roomCode)) continue;
      const earned = ledger.filter(log => dayKey(new Date(log.createdAt)) === dayKey(createdAt)).reduce((sum, log) => sum + log.points, 0);
      const points = Math.max(0, Math.min(item.mode === 'quiz' ? 1 : 3, 15 - earned));
      if (points) creates.pointLogs.push({ id: `${FEATURE_PREFIX}practice-points-${number}-${turn + 1}`, studentId: student(number), gameId: 'PRACTICE', roomCode, bonusType: `PRACTICE_${item.mode.toUpperCase()}`, points, status: 'APPROVED', reason: item.mode === 'quiz' ? '질문 분류 연습 정답' : item.mode === 'transform' ? '질문 바꾸기 목표 달성' : '질문 만들기 목표 달성', createdAt });
    }
  }
  for (const user of before.users) {
    const added = creates.pointLogs.filter(log => log.studentId === user.id).reduce((sum, log) => sum + log.points, 0);
    if (added) updates.users.push({ id: user.id, data: { totalPoints: user.totalPoints + added } });
  }
  return { anchor, creates, updates };
}

export function verifyFeatureLearning(before, after, plan) {
  for (const [kind, originalRows] of Object.entries(before)) {
    const created = plan.creates[kind] ?? [];
    if (after[kind].length !== originalRows.length + created.length) throw new Error(`${kind} 자료 수가 예상과 다릅니다.`);
    const keyOf = row => row.id ?? row.questionId;
    const actual = new Map(after[kind].map(row => [keyOf(row), row]));
    const changes = new Map((plan.updates[kind] ?? []).map(row => [row.id, row.data]));
    for (const row of originalRows) {
      const expected = { ...row, ...changes.get(keyOf(row)) };
      const saved = { ...actual.get(keyOf(row)) };
      if (kind === 'users' && changes.has(row.id)) { delete expected.updatedAt; delete saved.updatedAt; }
      if (canonical(expected) !== canonical(saved)) throw new Error(`${kind}의 기존 자료가 허용 범위 밖에서 변경됐습니다.`);
    }
    for (const row of created) {
      const saved = actual.get(keyOf(row));
      if (!saved) throw new Error(`${kind}의 추가 자료가 없습니다.`);
      const differentFields = Object.entries(row).filter(([key, value]) => canonical(saved[key]) !== canonical(value)).map(([key]) => key);
      if (differentFields.length) throw new Error(`${kind}의 추가 자료가 계획과 다릅니다: ${differentFields.join(', ')}`);
    }
  }
  for (const user of after.users) {
    const sum = after.pointLogs.filter(log => log.studentId === user.id && log.status === 'APPROVED').reduce((total, log) => total + log.points, 0);
    if (sum !== user.totalPoints) throw new Error('학생 포인트가 실제 지급 합계와 일치하지 않습니다.');
  }
}

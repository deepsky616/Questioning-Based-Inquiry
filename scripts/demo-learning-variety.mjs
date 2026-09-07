import { GRADE_FIVE_LESSONS, gradeFiveComment } from './demo-grade-five-content.mjs';

export const VARIETY_PREFIX = 'usb-demo-variety-v1-';
export const VARIETY_STUDENT_IDS = Array.from({length:28},(_,i)=>`usb-demo-student-${String(i+1).padStart(2,'0')}`);
export const GAME_CAPS = {dice:3,relay:3,'mystery-box':24,kaba:3,memory:0,'story-dice':3,ladder:3};
const gameCounts = [7,4,9,1,6,3,8,0,5,2,7,0,4,6,1,9,3,5,0,8,2,6,1,7,2,5,0,4];
const practiceCounts = [18,9,25,3,15,7,21,0,13,5,19,1,11,16,4,24,8,14,0,22,6,17,2,20,5,12,0,10];
const todayPracticeStudents = new Set([2,3,5,6,8,9,11,14,15,17,20,21,23,24]);
const questionCounts = [0,2,6,0,3,1,5,0,3,1,4,0,2,4,0,6,1,3,0,5,1,3,0,4,1,2,0,2];
const preferences = [
  ['dice','relay','dice','story-dice'], ['relay','mystery-box','relay'],
  ['memory','dice','memory','ladder'], ['kaba','relay'],
  ['mystery-box','story-dice','dice'], ['ladder','memory','relay'],
];
const friendGroups = [
  ['relay',[0,1,4,8],2], ['dice',[0,6,10,13,15],5], ['memory',[2,4,8,21],8],
  ['story-dice',[1,5,12],11], ['kaba',[3,9,14,24],9],
  ['mystery-box',[0,2,6,15,19,23],4], ['ladder',[12,17,25],18], ['relay',[4,10,13,21],22],
];
const quizIds = ['q01','q05','q08','q10','q13','q14','q16','q19','q20','q22','q25'];
const transformIds = ['t01','t03','t05','t08','t09'];
const createIds = ['c01','c03','c05','c06','c08'];
const dayKey = date => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date(date));
const canonical = value => JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)&&!(item instanceof Date)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
export { canonical };

export function buildDemoVarietyPlan(before, anchor = new Date()) {
  if(before.users.length!==28||before.users.some((u,i)=>u.id!==VARIETY_STUDENT_IDS[i]||!u.isDemo||u.role!=='STUDENT'||u.school!=='질문초등학교'||u.grade!=='5'||u.className!=='1'))throw new Error('5학년 1반 시연 학생 범위가 일치하지 않습니다.');
  if(before.sessions.length!==8||before.sessions.some(s=>s.teacherId!=='usb-demo-teacher'||s.targetGrade!=='5'))throw new Error('연결된 시연 수업을 확인하지 못했습니다.');
  if(Object.values(before).some(rows=>rows.some(row=>row.id?.startsWith(VARIETY_PREFIX))))throw new Error('이미 다양화한 자료가 있어 중복 적용하지 않았습니다.');
  for(const user of before.users){
    const ledger=before.pointLogs.filter(l=>l.studentId===user.id&&l.status==='APPROVED').reduce((n,l)=>n+l.points,0);
    if(ledger!==user.totalPoints)throw new Error('기존 포인트 합계가 지급 기록과 일치하지 않습니다.');
  }
  const includeToday = anchor.getTime() >= new Date(`${dayKey(anchor)}T14:00:00+09:00`).getTime();
  const at = (days, minute=0) => {
    const date=new Date(`${dayKey(anchor)}T10:00:00+09:00`);
    date.setUTCDate(date.getUTCDate()-days);
    // 최근 학습은 수업이 있는 평일에 배치한다.
    while([0,6].includes(new Date(date.getTime()+9*3600000).getUTCDay()))date.setUTCDate(date.getUTCDate()-1);
    return new Date(date.getTime()+minute*60000);
  };
  /** @type {{creates:{
   * runs:Array<import('@prisma/client').Prisma.GameRunCreateManyInput & {createdAt:Date,completedAt:Date}>,
   * activities:Array<import('@prisma/client').Prisma.GameActivityCreateManyInput>,
   * pointLogs:Array<import('@prisma/client').Prisma.PointLogCreateManyInput>,
   * practices:Array<import('@prisma/client').Prisma.PracticeAttemptCreateManyInput>,
   * questions:Array<import('@prisma/client').Prisma.QuestionCreateManyInput>,
   * comments:Array<import('@prisma/client').Prisma.CommentCreateManyInput>,
   * likes:Array<import('@prisma/client').Prisma.QuestionLikeCreateManyInput>
   * },updates:{users:Array<{id:string,data:{totalPoints:number}}>,analyses:Array<{id:string,data:{result:import('@prisma/client').Prisma.InputJsonValue}}>}}} */
  const plan={creates:{runs:[],activities:[],pointLogs:[],practices:[],questions:[],comments:[],likes:[]},updates:{users:[],analyses:[]}};
  const c=plan.creates;
  const point=(id,studentId,data)=>c.pointLogs.push({id:VARIETY_PREFIX+id,studentId,status:'APPROVED',...data});
  const lessons=Object.values(GRADE_FIVE_LESSONS);
  for(const [i,user] of before.users.entries()){
    const preferred=preferences[i%preferences.length];
    for(let turn=0;turn<gameCounts[i];turn++){
      const gameId=preferred[(turn+Math.floor(i/6))%preferred.length];
      const mode=(i%4===0?turn%4===1:i%4===1?turn%3!==0:(turn+i)%3===0)?'AI':'SOLO';
      const recognized=gameId==='memory'?0:gameId==='mystery-box'?3+(i+turn)%7:1+(i+turn)%3;
      const points=recognized*(mode==='AI'?2:1)+(mode==='AI'?3:2);
      const completedAt=at(includeToday&&turn===0&&i%3===0?0:1+turn*3+i%3,20+i*3+turn);
      const runId=`${VARIETY_PREFIX}run-${i+1}-${turn+1}`;
      const dailyLimit=mode==='AI'?50:30;
      const lesson=lessons[(i+turn)%lessons.length];
      c.runs.push({id:runId,gameId,mode,ownerId:user.id,creationRequestId:runId,creationRequestFingerprint:runId,participants:[user.id],status:'SETTLED',state:{demo:true,topic:lesson.topic,result:{awarded:points,dailyLimit,dailyRemaining:dailyLimit-points,cappedByLimit:false,preview:false}},version:2,scoreDate:dayKey(completedAt),completedAt,settledAt:completedAt,expiresAt:new Date(completedAt.getTime()+3600000),createdAt:new Date(completedAt.getTime()-(6+(i+turn)%12)*60000)});
      c.activities.push({id:`${VARIETY_PREFIX}activity-${i+1}-${turn+1}`,runId,actorId:user.id,requestId:runId,requestFingerprint:runId,sequence:1,type:'QUESTION',payload:{demo:true,topic:lesson.topic,question:lesson.questions[turn%5].content},validQuestionCount:recognized,scoreValue:recognized,responseSnapshot:{completed:true},createdAt:completedAt});
      point(`game-${i+1}-${turn+1}`,user.id,{gameId:`ACTIVITY_${mode}`,gameRunId:runId,roomCode:`run:${runId}`,bonusType:`ACTIVITY_${mode}_${gameId}`,points,reason:'서버 확인 질문놀이 완료',createdAt:completedAt});
    }
    for(let turn=0;turn<practiceCounts[i];turn++){
      const mode=['quiz','quiz','transform','quiz','create'][(turn+i)%5];
      const itemId=(mode==='quiz'?quizIds:mode==='transform'?transformIds:createIds)[(i+turn)% (mode==='quiz'?quizIds.length:5)];
      const quizType=mode==='quiz'?((turn+i)%2===0?'closure':'cognitive'):null;
      // 학생마다 성공 비율이 다르고 최근 시도에서 조금 더 나아지는 흐름을 만든다.
      const correct=(turn*7+i*3)%10 < Math.min(9,4+i%5+(turn<6?2:0));
      const createdAt=at(includeToday&&turn===0&&todayPracticeStudents.has(i)?0:1+Math.floor(turn/2)+i%3,95+i+turn*2);
      const id=`${VARIETY_PREFIX}practice-${i+1}-${turn+1}`;
      c.practices.push({id,studentId:user.id,mode,itemId,quizType,correct,createdAt});
      if(correct){
        const roomCode=`${mode}:${itemId}${quizType?':'+quizType:''}:${dayKey(createdAt)}`;
        if(![...before.pointLogs,...c.pointLogs].some(l=>l.studentId===user.id&&l.gameId==='PRACTICE'&&l.roomCode===roomCode))point(`practice-${i+1}-${turn+1}`,user.id,{gameId:'PRACTICE',roomCode,bonusType:`PRACTICE_${mode.toUpperCase()}`,points:mode==='quiz'?1:3,reason:mode==='quiz'?'질문 분류 연습 정답':mode==='transform'?'질문 바꾸기 목표 달성':'질문 만들기 목표 달성',createdAt});
      }
    }
    const candidates=before.sessions.filter(s=>s.status!=='SCHEDULED').flatMap(s=>{
      const lesson=lessons.find(l=>l.topic===s.topic);return lesson?lesson.questions.map(q=>({session:s,question:q})):[];
    });
    let added=0;
    for(let step=0;step<candidates.length&&added<questionCounts[i];step++){
      const {session,question}=candidates[(i*7+step*11)%candidates.length];
      if([...before.questions,...c.questions].some(q=>q.authorId===user.id&&q.sessionId===session.id&&q.content.includes(question.content)))continue;
      const oldest=before.questions.filter(q=>q.sessionId===session.id).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt))[0];
      if(!oldest)continue;
      const createdAt=new Date(new Date(oldest.createdAt).getTime()+(12+i*2+added*8)*60000);
      c.questions.push({id:`${VARIETY_PREFIX}question-${i+1}-${++added}`,authorId:user.id,sessionId:session.id,content:question.content,normalizedContent:question.content,context:session.topic,closure:question.closure,cognitive:question.type,inquiryType:question.type,createdAt});
    }
    if(added!==questionCounts[i])throw new Error('중복되지 않는 5학년 질문이 부족합니다.');
  }
  // 기존 친구 시연 기록은 완료했다고 작성되었지만 완료 표시가 빠져 있었다. 점수는 그대로 둔다.
  for(const log of before.pointLogs.filter(l=>l.id.startsWith('usb-demo-point-friend-participation-'))){
    if(!before.pointLogs.some(l=>l.studentId===log.studentId&&l.roomCode===log.roomCode&&l.bonusType==='COMPLETION'))point(`legacy-completion-${log.studentId}`,log.studentId,{gameId:log.gameId,roomCode:log.roomCode,bonusType:'COMPLETION',points:0,reason:'기존 시연의 놀이 완료 기록 보완',createdAt:log.createdAt});
  }
  for(const [groupIndex,[gameId,members,days]] of friendGroups.entries()){
    const completedAt=at(days,150+groupIndex*7);const roomCode=`room:${VARIETY_PREFIX}group-${groupIndex+1}`;
    for(const [memberIndex,i] of members.entries()){
      const good=gameId==='memory'?0:gameId==='mystery-box'?2+memberIndex%3:(i+groupIndex)%4;
      const data={gameId,roomCode,createdAt:completedAt};const prefix=`friend-${groupIndex+1}-${i+1}`;
      point(prefix+'-participation',VARIETY_STUDENT_IDS[i],{...data,bonusType:'PARTICIPATION',points:1,reason:'친구와 질문놀이 참여'});
      point(prefix+'-completion',VARIETY_STUDENT_IDS[i],{...data,bonusType:'COMPLETION',points:5,reason:'친구와 질문놀이 완료'});
      if(good)point(prefix+'-questions',VARIETY_STUDENT_IDS[i],{...data,bonusType:'VALID_QUESTIONS',points:good*3,reason:`유효 질문 ${good}개`});
    }
  }
  const questions=[...before.questions,...c.questions];
  for(const [i,user] of before.users.entries()){
    const count=i===0?4:questionCounts[i];
    const targets=questions.filter(q=>q.authorId!==user.id&&lessons.some(l=>l.topic===q.context));
    let added=0;
    for(let step=0;step<targets.length&&added<count;step++){
      const target=targets[(i*11+step*7)%targets.length];
      if([...before.comments,...c.comments].some(c=>c.authorId===user.id&&c.questionId===target.id))continue;
      c.comments.push({id:`${VARIETY_PREFIX}comment-${i+1}-${++added}`,authorId:user.id,questionId:target.id,content:gradeFiveComment(target,i+added),normalizedContent:gradeFiveComment(target,i+added),createdAt:new Date(new Date(target.createdAt).getTime()+(30+i+added*9)*60000)});
    }
    if(added!==count)throw new Error('답변을 연결할 질문이 부족합니다.');
    const likeCount=gameCounts[i]+(i===0?3:i%3);added=0;
    for(let step=0;step<targets.length&&added<likeCount;step++){
      const target=targets[(i*5+step*13)%targets.length];
      if([...before.likes,...c.likes].some(l=>l.userId===user.id&&l.questionId===target.id))continue;
      c.likes.push({id:`${VARIETY_PREFIX}like-${i+1}-${++added}`,userId:user.id,questionId:target.id,createdAt:new Date(new Date(target.createdAt).getTime()+(70+i+added*5)*60000)});
    }
    if(added!==likeCount)throw new Error('좋아요를 연결할 질문이 부족합니다.');
    const increment=c.pointLogs.filter(l=>l.studentId===user.id).reduce((sum,l)=>sum+l.points,0);
    plan.updates.users.push({id:user.id,data:{totalPoints:user.totalPoints+increment}});
  }
  const allComments=[...before.comments,...c.comments];const allLikes=[...before.likes,...c.likes];
  for(const analysis of before.analyses){
    const ids=new Set(questions.filter(q=>q.sessionId===analysis.sessionId).map(q=>q.id));
    plan.updates.analyses.push({id:analysis.id,data:{result:{...analysis.result,totalQuestions:questions.filter(q=>q.sessionId===analysis.sessionId&&q.authorId===analysis.studentId).length,totalComments:allComments.filter(c=>c.authorId===analysis.studentId&&ids.has(c.questionId)).length,totalLikes:allLikes.filter(l=>l.userId===analysis.studentId&&ids.has(l.questionId)).length}}});
  }
  // 기존 및 추가 지급을 함께 검사한다. 학습 기록이 점수 규칙과 어긋나면 적용하지 않는다.
  const daily=new Map();
  for(const log of [...before.pointLogs,...c.pointLogs].filter(l=>l.status==='APPROVED')){
    const mode=log.gameId==='ACTIVITY_SOLO'?'SOLO':log.gameId==='ACTIVITY_AI'?'AI':log.gameId==='PRACTICE'?'PRACTICE':log.roomCode?.startsWith('room:')?'FRIEND':null;
    if(!mode)continue;const key=`${log.studentId}:${mode}:${dayKey(log.createdAt)}`;
    daily.set(key,(daily.get(key)||0)+log.points);
    if(daily.get(key)>({SOLO:30,AI:50,PRACTICE:15,FRIEND:120})[mode])throw new Error('하루 포인트 상한을 초과합니다.');
  }
  return plan;
}

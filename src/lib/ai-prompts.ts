interface QuestionSummary {
  content: string;
  closure: string;
  cognitive: string;
  comments?: CommentSummary[];
  // 좋아요 수(공감 신호)와 질문 종류(학생 질문 / 교사가 배포한 탐구설계 질문)
  likeCount?: number;
  kind?: "student" | "deployed";
}

interface CommentSummary {
  content: string;
  authorRole?: string | null;
  authorName?: string | null;
}

// 폐쇄형/개방형 × 인지적 수준의 2차원 조합별 답변 지침
const ANSWER_GUIDE: Record<string, Record<string, string>> = {
  factual: {
    closed:
      "사실적·폐쇄형: 핵심 사실을 간결하게 확인해 주세요. 마지막에 관련 원리나 비슷한 예시를 하나 덧붙여 이해를 자연스럽게 확장하세요.",
    open:
      "사실적·개방형: 여러 측면의 사실을 함께 제시하고, 어떤 부분이 더 궁금한지 생각해보도록 유도하는 문장으로 마무리하세요.",
  },
  conceptual: {
    closed:
      "개념적·폐쇄형: 이유나 원리를 단계적으로 설명하세요. '그렇다면 다른 상황에서는 어떨까요?'처럼 사고를 확장하는 질문으로 마무리하세요.",
    open:
      "개념적·개방형: 여러 가지 설명 가능성을 열어두고, 개념 사이의 관계를 스스로 생각해보도록 격려하세요.",
  },
  controversial: {
    closed:
      "논쟁적·폐쇄형: 판단의 기준을 명확히 제시하되, 기준이 달라지면 답도 달라질 수 있음을 보여주세요. 학생 스스로 자신의 기준을 세워보도록 돕는 마무리를 포함하세요.",
    open:
      "논쟁적·개방형: 다양한 관점이 모두 가능함을 인정하고, 좋은 판단을 위해 어떤 기준을 고려해야 하는지 생각해보도록 유도하세요. 정답을 단정하지 마세요.",
  },
};

export function buildAnswerPrompt(
  question: string,
  closure?: string,
  cognitive?: string,
  context?: string
): string {
  const contextPart = context ? `\n[수업 맥락] ${context}` : "";

  const cogKey = cognitive && ANSWER_GUIDE[cognitive] ? cognitive : null;
  const closureKey = closure === "closed" || closure === "open" ? closure : null;
  const combinedGuide =
    cogKey && closureKey ? ANSWER_GUIDE[cogKey][closureKey] : null;

  const guidePart = combinedGuide
    ? `\n[질문 유형 안내]\n${combinedGuide}`
    : "";

  return `당신은 초·중·고 교사를 돕는 교육 AI입니다. 학생이 수업 중에 제출한 질문에 대해 교사가 학생에게 댓글로 달아줄 답변을 작성해 주세요.

[공통 원칙]
- 학생 수준에 맞는 친절하고 명확한 언어 사용
- 150자 이내로 핵심만 간결하게
- 학생의 질문 유형에 맞는 방식으로 답변${guidePart}

[학생 질문]
${question}${contextPart}

답변:`;
}

export function buildSessionAnalysisPrompt(
  questions: QuestionSummary[],
  subject: string,
  topic: string
): string {
  const total = questions.length;
  const closedCount = questions.filter((q) => q.closure === "closed").length;
  const openCount = questions.filter((q) => q.closure === "open").length;
  const factualCount = questions.filter((q) => q.cognitive === "factual").length;
  const conceptualCount = questions.filter((q) => q.cognitive === "conceptual").length;
  const controversialCount = questions.filter((q) => q.cognitive === "controversial").length;
  const comments = questions.flatMap((q) => q.comments ?? []);
  const totalComments = comments.length;
  const studentCommentCount = comments.filter((comment) => comment.authorRole === "STUDENT").length;
  const teacherCommentCount = comments.filter((comment) => comment.authorRole === "TEACHER").length;
  const totalLikes = questions.reduce((sum, q) => sum + (q.likeCount ?? 0), 0);
  // 공감을 많이 받은 질문 상위 3개(좋아요 1개 이상)
  const topLiked = [...questions]
    .filter((q) => (q.likeCount ?? 0) > 0)
    .sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0))
    .slice(0, 3);
  const topLikedText =
    topLiked.length > 0
      ? topLiked.map((q) => `  - (❤️ ${q.likeCount}) ${q.content}`).join("\n")
      : "  (좋아요를 받은 질문 없음)";

  const formatComment = (comment: CommentSummary, index: number) => {
    const roleLabel = comment.authorRole === "STUDENT" ? "학생" : "교사/AI";
    const authorLabel = comment.authorName?.trim() || "작성자";
    return `  [댓글 ${index + 1} · ${roleLabel} · ${authorLabel}] ${comment.content.trim()}`;
  };

  const questionList =
    questions.length > 0
      ? questions.map((q, i) => {
          const commentLines = (q.comments ?? [])
            .filter((comment) => comment.content.trim())
            .slice(0, 8)
            .map(formatComment)
            .join("\n");
          const kindLabel = q.kind === "deployed" ? "배포" : "학생";
          return `${i + 1}. [${kindLabel}·${q.closure === "closed" ? "폐쇄" : "개방"}·${
            q.cognitive === "factual" ? "사실" :
            q.cognitive === "conceptual" ? "개념" : "논쟁"
          }·❤️${q.likeCount ?? 0}] ${q.content}${commentLines ? `\n${commentLines}` : "\n  (댓글 없음)"}`;
        }).join("\n")
      : "(질문 없음)";

  return `당신은 교사의 수업 분석을 도와주는 교육 전문 AI입니다. 아래 수업 세션에서 학생들이 제출한 질문과, 교사가 배포한 탐구설계 질문, 그리고 학생들이 누른 좋아요와 작성한 댓글 대화를 함께 분석해 주세요.

[수업 정보]
- 교과: ${subject}
- 주제: ${topic || "미지정"}
- 총 질문 수: ${total}개 (학생 질문 + 교사가 배포한 탐구설계 질문)
- 총 좋아요 수: ${totalLikes}개
- 총 댓글 수: ${totalComments}개
- 학생 댓글 / 교사·AI 댓글: ${studentCommentCount} / ${teacherCommentCount}
- 폐쇄형 / 개방형: ${closedCount} / ${openCount}
- 사실적 / 개념적 / 논쟁적: ${factualCount} / ${conceptualCount} / ${controversialCount}

[질문 유형 기준]
- 폐쇄형: 정답이 하나인 확인형 질문
- 개방형: 다양한 답이 나올 수 있는 탐구형 질문
- 사실적: 사실·정보 확인
- 개념적: 추론·분석·비교를 통해 개념과 원리의 관계를 탐색
- 논쟁적: 판단·의견·가치 기준을 세워 여러 관점을 비교

[표기 안내]
- 각 질문 앞 [ ] 안: 질문 종류(학생/배포)·폐쇄·개방·인지수준·좋아요 수(❤️)
- "배포"는 교사가 탐구설계로 학생에게 배포한 질문, "학생"은 학생이 직접 만든 질문입니다.

[공감(좋아요)을 많이 받은 질문]
${topLikedText}

[질문·좋아요·댓글 흐름]
${questionList}

분석 관점:
- 질문 자체의 수준과 분포를 해석하세요.
- 좋아요(공감)가 어떤 질문에 몰렸는지로 학생들이 무엇에 흥미·공감했는지 해석하세요.
- 학생 댓글에서 드러난 이해, 오개념, 추가 궁금증, 상호작용의 깊이를 해석하세요.
- 교사·AI 댓글이 학생 사고를 확장하는 데 충분했는지도 간단히 판단하세요.
- 좋아요나 댓글 참여가 저조하면 다음 수업에서 참여를 높일 방법을 제안하세요.
- 교과(${subject})·주제(${topic || "미지정"})와 관련이 없거나 의미 없이 성의 없게 작성한 질문(예: "질문", "궁금함", "왜")·댓글(예: "ㅎㅎ", "ㅇㅇ", "...")이 있는지 살펴보세요. 있다면 어떤 내용이 그러한지 구체적으로 짚고, 주제와 연결해 성의 있게 작성하도록 지도하는 방법을 제안하세요.

아래 JSON 형식으로만 응답하세요:
{
  "summary": "학생들이 어떤 내용에 관심을 가졌는지, 질문·좋아요·댓글 흐름이 어떤 의미인지 2~3문장으로 요약",
  "themes": ["핵심 주제 키워드 3~5개"],
  "insights": "질문 분포와 대화를 바탕으로 다음 수업 방향 2~3문장",
  "commentInsights": "학생 댓글에서 드러난 이해 수준, 오개념, 상호작용 깊이, 댓글 참여를 높일 방법을 2~3문장",
  "engagementInsights": "좋아요·댓글 참여 양상(어떤 질문에 공감이 몰렸는지, 참여가 활발/저조한지)과 참여를 높일 방법을 2~3문장",
  "relevanceInsights": "주제와 무관하거나 의미 없이 작성한(예: 'ㅎㅎ','질문','왜') 질문·댓글이 있는지, 있다면 무엇이 그런지와 성의 있게 쓰도록 지도할 방법을 2~3문장. 모두 성의 있게 잘 작성했다면 그 점을 짧게 칭찬"
}`;
}

export interface StudentSessionActivity {
  studentName: string;
  subject: string;
  topic: string;
  questions: { content: string; closure: string; cognitive: string; likeCount: number; commentCount: number }[];
  myComments: string[];
  likesGiven: number;
}

/**
 * 한 수업 세션에서 '특정 학생 본인'의 질문·좋아요·댓글 활동을 분석하는 프롬프트(학생 눈높이).
 */
export function buildStudentSessionPrompt(a: StudentSessionActivity): string {
  const qList = a.questions.length > 0
    ? a.questions.map((q, i) =>
        `${i + 1}. [${q.closure === "closed" ? "폐쇄" : "개방"}·${
          q.cognitive === "factual" ? "사실" : q.cognitive === "conceptual" ? "개념" : "논쟁"
        }·❤️${q.likeCount}·💬${q.commentCount}] ${q.content}`,
      ).join("\n")
    : "(이 세션에서 직접 만든 질문 없음)";
  const cList = a.myComments.length > 0
    ? a.myComments.map((c, i) => `  ${i + 1}. ${c}`).join("\n")
    : "(작성한 댓글 없음)";

  return `당신은 초·중학생의 질문 활동을 따뜻하게 격려하고 도와주는 교육 AI입니다. 아래는 한 학생이 '${a.subject} - ${a.topic || "수업"}' 세션에서 한 활동입니다. 학생 본인이 읽을 글이니 쉽고 친근한 말투로, 칭찬과 구체적인 다음 도전 한 가지를 함께 알려주세요.

[학생] ${a.studentName}
[내가 만든 질문] (앞 [ ] 안: 폐쇄/개방·인지수준·받은 좋아요(❤️)·받은 댓글(💬))
${qList}

[내가 쓴 댓글]
${cList}

[내가 누른 좋아요 수] ${a.likesGiven}개

분석 관점:
- 어떤 유형(폐쇄/개방, 사실/개념/논쟁)의 질문을 주로 했는지, 좋은 점은 무엇인지.
- 친구 질문에 좋아요·댓글로 얼마나 참여했는지.
- 더 깊은 질문이나 활발한 참여를 위한 구체적이고 쉬운 다음 도전 한 가지.
- 수업 주제(${a.subject} - ${a.topic || "수업"})와 관련 없거나, "질문"·"궁금함"·"왜"처럼 의미 없는 질문, "ㅎㅎ"·"ㅇㅇ"처럼 성의 없는 댓글이 있는지 보세요. 있으면 혼내지 말고, 주제와 연결해 한 문장이라도 더 구체적으로 쓰는 쉬운 팁을 친근하게 알려주세요.

반드시 아래 JSON 형식으로만 응답하세요 (다른 말 없이):
{
  "summary": "이번 세션에서 내가 한 활동을 2~3문장으로 따뜻하게 정리",
  "insights": "더 좋은 질문·활발한 참여를 위한 쉬운 다음 도전 1~2가지",
  "relevanceInsights": "주제와 동떨어지거나 'ㅎㅎ','왜'처럼 성의 없이 쓴 게 있으면 더 구체적으로 쓰는 팁을 부드럽게 한두 문장. 모두 주제에 맞게 잘 썼다면 그 점을 칭찬"
}`;
}

import { describe, expect, it } from "vitest";
import {
  createBrowserQuestionGameRunStore,
  type BrowserQuestionGameRunActor,
} from "../../e2e/helpers/question-game-run";

const studentA: BrowserQuestionGameRunActor = {
  id: "browser-run-student-a",
  role: "STUDENT",
};
const studentB: BrowserQuestionGameRunActor = {
  id: "browser-run-student-b",
  role: "STUDENT",
};

const ids = Array.from(
  { length: 12 },
  (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

function runId(response: { body: Record<string, unknown> }) {
  return (response.body.run as { id: string }).id;
}

describe("브라우저 질문놀이 실행 전송기", () => {
  it("생성과 학생 질문을 멱등 처리하고 마지막 질문을 같은 동작에서 정산한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const createBody = {
      gameId: "relay",
      mode: "solo",
      requestId: ids[0],
      topic: "우주",
      locale: "ko",
    };
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: createBody,
    });
    const id = runId(created);
    expect(created).toMatchObject({
      status: 201,
      body: {
        replayed: false,
        run: { id, status: "ACTIVE", version: 1, questionCount: 0 },
      },
    });

    const firstBody = {
      action: "relay-submit-question",
      requestId: ids[1],
      expectedVersion: 1,
      question: "우주에는 무엇이 있나요?",
      locale: "ko",
    };
    const first = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: firstBody,
    });
    const firstReplay = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: firstBody,
    });
    expect(first.body.run).toMatchObject({ version: 2, questionCount: 1 });
    expect(firstReplay).toMatchObject({
      status: 200,
      body: { replayed: true, run: { version: 2, questionCount: 1 } },
    });

    const second = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "relay-submit-question",
        requestId: ids[2],
        expectedVersion: 2,
        question: "별은 왜 빛나나요?",
        locale: "ko",
      },
    });
    expect(second.body.run).toMatchObject({ status: "ACTIVE", version: 3 });

    const finalBody = {
      action: "relay-submit-question",
      requestId: ids[3],
      expectedVersion: 3,
      question: "그 빛은 어디까지 가나요?",
      locale: "ko",
    };
    const settled = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: finalBody,
    });
    expect(settled).toMatchObject({
      status: 200,
      body: {
        replayed: false,
        run: { status: "SETTLED", version: 4, questionCount: 3 },
        result: {
          awarded: 5,
          dailyLimit: 30,
          dailyRemaining: 25,
          cappedByLimit: false,
          preview: false,
        },
      },
    });

    const settledReplay = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: finalBody,
    });
    expect(settledReplay).toMatchObject({
      body: {
        replayed: true,
        run: { status: "SETTLED", version: 4 },
        result: { awarded: 5 },
      },
    });
    const lateFirstReplay = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: firstBody,
    });
    expect(lateFirstReplay).toMatchObject({
      body: {
        replayed: true,
        run: { status: "ACTIVE", version: 2, questionCount: 1 },
      },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        ...firstBody,
        question: "같은 요청에 다른 질문인가요?",
      },
    })).toEqual({
      status: 409,
      body: { error: "같은 요청 식별값에 다른 동작이 들어왔습니다" },
    });
    const result = store.dispatch(studentA, {
      method: "GET",
      pathname: `/api/question-games/runs/${id}/result`,
      body: {},
    });
    expect(result.body).toMatchObject({
      run: { status: "SETTLED", version: 4 },
      result: { awarded: 5, alreadySettled: true },
    });
    const legacyComplete = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/complete`,
      body: { requestId: ids[4], expectedVersion: 4 },
    });
    expect(legacyComplete.body).toMatchObject({
      replayed: true,
      run: { version: 4 },
      result: { awarded: 5, alreadySettled: true },
    });

    const creationReplay = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: createBody,
    });
    expect(creationReplay).toMatchObject({
      status: 200,
      body: { replayed: true, run: { id, status: "SETTLED", version: 4 } },
    });
  });

  it("같은 요청 식별값도 사용자별로 분리하고 다른 사용자의 실행을 차단한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const body = {
      gameId: "relay",
      mode: "solo",
      requestId: ids[5],
      topic: "바다",
      locale: "ko",
    };
    const first = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body,
    });
    const second = store.dispatch(studentB, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body,
    });
    expect(runId(first)).not.toBe(runId(second));

    expect(store.dispatch(studentB, {
      method: "GET",
      pathname: `/api/question-games/runs/${runId(first)}/result`,
      body: {},
    })).toEqual({
      status: 403,
      body: { error: "자신의 질문놀이 실행만 이용할 수 있습니다" },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${runId(second)}/actions`,
      body: {
        action: "relay-submit-question",
        requestId: ids[6],
        expectedVersion: 1,
        question: "다른 학생의 질문인가요?",
        locale: "ko",
      },
    }).status).toBe(403);
  });

  it("인공지능 발급과 기록 요청도 재생해 차례를 한 번만 진행한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "relay",
        mode: "ai",
        requestId: ids[7],
        topic: "자연",
        locale: "ko",
      },
    });
    const id = runId(created);
    store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "relay-submit-question",
        requestId: ids[8],
        expectedVersion: 1,
        question: "나무는 어떻게 자라나요?",
        locale: "ko",
      },
    });
    const issueBody = {
      requestId: ids[9],
      expectedVersion: 2,
      topic: "자연",
      previousQuestion: "나무는 어떻게 자라나요?",
      locale: "ko",
    };
    const issued = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/ai-turn`,
      body: issueBody,
    });
    const issueReplay = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/ai-turn`,
      body: issueBody,
    });
    expect(issueReplay).toEqual(issued);

    const issuedBody = issued.body as {
      output: string;
      proof: string;
    };
    const recordBody = {
      action: "relay-record-ai-turn",
      requestId: ids[10],
      generationRequestId: ids[9],
      expectedVersion: 2,
      output: issuedBody.output,
      proof: issuedBody.proof,
    };
    const recorded = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: recordBody,
    });
    const recordReplay = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: recordBody,
    });
    expect(recorded.body.run).toMatchObject({
      version: 3,
      questionCount: 1,
      aiTurnCount: 1,
      awaitingAiTurn: false,
    });
    expect(recordReplay).toMatchObject({
      body: { replayed: true, run: { version: 3, aiTurnCount: 1 } },
    });
  });
});

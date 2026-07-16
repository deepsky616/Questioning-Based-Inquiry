import { describe, expect, it } from "vitest";
import {
  createBrowserQuestionGameRunStore,
  type BrowserQuestionGameRunActor,
} from "../../e2e/helpers/question-game-run";
import { getKabaSentences } from "../lib/question-game-i18n";

const studentA: BrowserQuestionGameRunActor = {
  id: "browser-run-student-a",
  role: "STUDENT",
};
const studentB: BrowserQuestionGameRunActor = {
  id: "browser-run-student-b",
  role: "STUDENT",
};
const teacher: BrowserQuestionGameRunActor = {
  id: "browser-run-teacher",
  role: "TEACHER",
};

const ids = Array.from(
  { length: 360 },
  (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

type PublicMemoryCard = {
  id: string;
  type: "q" | "a";
  state: "HIDDEN" | "REVEALED" | "TAKEN";
  contentKey?: string;
};

type PublicMemoryRun = {
  id: string;
  status: "ACTIVE" | "SETTLED";
  version: number;
  questionCount: number;
  aiTurnCount: number;
  targetCount: number;
  awaitingAiTurn: boolean;
  memoryDifficulty: "easy" | "normal" | "hard";
  memoryNextStep:
    | "STUDENT_QUESTION"
    | "STUDENT_ANSWER"
    | "AI_TURN"
    | "RESOLVE_MISS"
    | "COMPLETE";
  studentMatchCount: number;
  aiMatchCount: number;
  memoryQuestionCards: PublicMemoryCard[];
  memoryAnswerCards: PublicMemoryCard[];
  memoryMissReveal: null | {
    id: string;
    actor: "STUDENT" | "AI";
    result: "MISS";
    resolveAt: number;
  };
  memoryReview: null | Array<{ contentKey: string }>;
};

function memoryRun(response: { body: Record<string, unknown> }) {
  return response.body.run as PublicMemoryRun;
}

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

  it("질문 주사위 혼자 모드의 굴리기와 질문을 세 번 처리하고 마지막 질문에서 정산한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const createBody = {
      gameId: "dice",
      mode: "solo",
      requestId: ids[12],
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
        run: {
          gameId: "dice",
          status: "ACTIVE",
          version: 1,
          nextStep: "STUDENT_ROLL",
          pendingRoll: null,
        },
      },
    });

    let version = 1;
    let finalResponse = created;
    for (let index = 0; index < 3; index += 1) {
      const rollBody = {
        action: "dice-roll",
        requestId: ids[13 + index * 2],
        expectedVersion: version,
        face: 99,
      };
      const rolled = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: rollBody,
      });
      const rolledRun = rolled.body.run as {
        pendingRoll: { actor: string; face: number };
      };
      expect(rolledRun.pendingRoll).toMatchObject({ actor: "STUDENT" });
      expect(rolledRun.pendingRoll.face).toBeGreaterThanOrEqual(1);
      expect(rolledRun.pendingRoll.face).toBeLessThanOrEqual(6);
      if (index === 0) {
        const replay = store.dispatch(studentA, {
          method: "POST",
          pathname: `/api/question-games/runs/${id}/actions`,
          body: rollBody,
        });
        expect(replay).toMatchObject({
          status: 200,
          body: {
            replayed: true,
            run: {
              version: 2,
              pendingRoll: { actor: "STUDENT", face: rolledRun.pendingRoll.face },
            },
          },
        });
      }
      version += 1;

      finalResponse = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "dice-submit-question",
          requestId: ids[14 + index * 2],
          expectedVersion: version,
          question: `주사위 질문 ${index + 1}은 무엇인가요?`,
          locale: "ko",
        },
      });
      version += 1;
    }

    expect(finalResponse).toMatchObject({
      status: 200,
      body: {
        replayed: false,
        run: {
          status: "SETTLED",
          version: 7,
          questionCount: 3,
          nextStep: "COMPLETE",
          pendingRoll: null,
        },
        result: {
          awarded: 5,
          dailyLimit: 30,
          dailyRemaining: 25,
          preview: false,
        },
      },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "dice-submit-question",
        requestId: ids[18],
        expectedVersion: 6,
        question: "주사위 질문 3은 무엇인가요?",
        locale: "ko",
      },
    })).toMatchObject({
      status: 200,
      body: {
        replayed: true,
        run: { status: "SETTLED", version: 7 },
        result: { awarded: 5, dailyRemaining: 25 },
      },
    });
    expect(store.dispatch(studentB, {
      method: "GET",
      pathname: `/api/question-games/runs/${id}/result`,
      body: {},
    })).toEqual({
      status: 403,
      body: { error: "자신의 질문놀이 실행만 이용할 수 있습니다" },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: createBody,
    })).toMatchObject({
      status: 200,
      body: { replayed: true, run: { id, status: "SETTLED", version: 7 } },
    });
  });

  it("질문 주사위 도움 모드에서 학생과 인공지능 차례를 지키고 구 점을 정산한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "dice",
        mode: "ai",
        requestId: ids[20],
        locale: "ko",
      },
    });
    const id = runId(created);
    let version = 1;
    let finalResponse = created;

    for (let index = 0; index < 3; index += 1) {
      const studentRoll = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "dice-roll",
          requestId: ids[21 + index * 5],
          expectedVersion: version,
        },
      });
      expect(studentRoll.body.run).toMatchObject({
        nextStep: "STUDENT_QUESTION",
        pendingRoll: { actor: "STUDENT" },
      });
      version += 1;

      finalResponse = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "dice-submit-question",
          requestId: ids[22 + index * 5],
          expectedVersion: version,
          question: `도움 모드 질문 ${index + 1}은 무엇인가요?`,
          locale: "ko",
        },
      });
      version += 1;
      if (index === 2) break;
      expect(finalResponse.body.run).toMatchObject({
        nextStep: "AI_ROLL",
        pendingRoll: null,
      });

      const aiRoll = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "dice-roll",
          requestId: ids[23 + index * 5],
          expectedVersion: version,
        },
      });
      expect(aiRoll.body.run).toMatchObject({
        nextStep: "AI_QUESTION",
        awaitingAiTurn: true,
        pendingRoll: { actor: "AI" },
      });
      version += 1;

      const issueBody = {
        requestId: ids[24 + index * 5],
        expectedVersion: version,
        locale: "ko",
      };
      const issued = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/ai-turn`,
        body: issueBody,
      });
      expect(store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/ai-turn`,
        body: issueBody,
      })).toEqual(issued);
      const issuedBody = issued.body as { output: string; proof: string };
      const recordBody = {
        action: "dice-record-ai-question",
        requestId: ids[25 + index * 5],
        generationRequestId: issueBody.requestId,
        expectedVersion: version,
        output: issuedBody.output,
        proof: issuedBody.proof,
      };
      const recorded = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: recordBody,
      });
      expect(recorded.body.run).toMatchObject({
        nextStep: "STUDENT_ROLL",
        pendingRoll: null,
        aiTurnCount: index + 1,
        awaitingAiTurn: false,
      });
      expect(store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: recordBody,
      })).toMatchObject({
        body: { replayed: true, run: { aiTurnCount: index + 1 } },
      });
      version += 1;
    }

    expect(finalResponse).toMatchObject({
      status: 200,
      body: {
        run: {
          status: "SETTLED",
          version: 11,
          questionCount: 3,
          aiTurnCount: 2,
          nextStep: "COMPLETE",
        },
        result: {
          awarded: 9,
          dailyLimit: 50,
          dailyRemaining: 41,
          preview: false,
        },
      },
    });
  });

  it("질문 주사위 점수를 같은 학생과 모드의 하루 누계에 합산한다", () => {
    const store = createBrowserQuestionGameRunStore();

    const finishSoloDice = (createIndex: number, actionStart: number) => {
      const created = store.dispatch(studentA, {
        method: "POST",
        pathname: "/api/question-games/runs",
        body: {
          gameId: "dice",
          mode: "solo",
          requestId: ids[createIndex],
          locale: "ko",
        },
      });
      const id = runId(created);
      let version = 1;
      let response = created;
      for (let index = 0; index < 3; index += 1) {
        response = store.dispatch(studentA, {
          method: "POST",
          pathname: `/api/question-games/runs/${id}/actions`,
          body: {
            action: "dice-roll",
            requestId: ids[actionStart + index * 2],
            expectedVersion: version,
          },
        });
        version += 1;
        response = store.dispatch(studentA, {
          method: "POST",
          pathname: `/api/question-games/runs/${id}/actions`,
          body: {
            action: "dice-submit-question",
            requestId: ids[actionStart + index * 2 + 1],
            expectedVersion: version,
            question: `하루 누계 질문 ${index + 1}은 무엇인가요?`,
            locale: "ko",
          },
        });
        version += 1;
      }
      return response;
    };

    expect(finishSoloDice(40, 41).body.result).toMatchObject({
      awarded: 5,
      dailyRemaining: 25,
    });
    expect(finishSoloDice(47, 48).body.result).toMatchObject({
      awarded: 5,
      dailyRemaining: 20,
    });
  });

  it("질문 사다리 주제 네 개와 서버 사다리 세 라운드를 처리하고 마지막 질문에서 정산한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const topics = ["우주", "바다", "날씨", "식물"];
    const createBody = {
      gameId: "ladder",
      mode: "solo",
      requestId: ids[60],
      topics,
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
        run: {
          id,
          gameId: "ladder",
          mode: "SOLO",
          status: "ACTIVE",
          version: 1,
          targetCount: 3,
          questionCount: 0,
          aiTurnCount: 0,
          awaitingAiTurn: false,
          ladderRound: 1,
        },
      },
    });
    const firstGrid = (created.body.run as { ladderGrid: boolean[][] }).ladderGrid;
    expect(firstGrid).toHaveLength(10);
    expect(firstGrid.every((row) => row.length === 3)).toBe(true);
    for (const topic of topics) {
      expect(JSON.stringify(created)).not.toContain(topic);
    }

    const questions = [
      "우주에는 어떤 비밀이 있나요?",
      "바다는 왜 계속 움직이나요?",
      "식물은 빛을 어떻게 이용하나요?",
    ];
    const startColumns = [0, 3, 1];
    let finalResponse = created;
    let finalBody: Record<string, unknown> | null = null;
    for (let index = 0; index < questions.length; index += 1) {
      const actionBody = {
        action: "ladder-submit-question",
        requestId: ids[61 + index],
        expectedVersion: index + 1,
        startColumn: startColumns[index],
        question: questions[index],
        locale: "ko",
      };
      finalResponse = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: actionBody,
      });
      if (index === 0) {
        expect(finalResponse).toMatchObject({
          status: 200,
          body: {
            replayed: false,
            run: {
              status: "ACTIVE",
              version: 2,
              questionCount: 1,
              ladderRound: 2,
            },
          },
        });
        const secondGrid = (finalResponse.body.run as { ladderGrid: boolean[][] }).ladderGrid;
        expect(secondGrid).toHaveLength(10);
        expect(secondGrid).not.toEqual(firstGrid);
        expect(store.dispatch(studentA, {
          method: "POST",
          pathname: `/api/question-games/runs/${id}/actions`,
          body: actionBody,
        })).toMatchObject({
          status: 200,
          body: {
            replayed: true,
            run: { version: 2, questionCount: 1, ladderRound: 2 },
          },
        });
      }
      expect(JSON.stringify(finalResponse)).not.toContain(questions[index]);
      if (index === questions.length - 1) finalBody = actionBody;
    }

    expect(finalResponse).toMatchObject({
      status: 200,
      body: {
        replayed: false,
        run: {
          status: "SETTLED",
          version: 4,
          questionCount: 3,
          aiTurnCount: 0,
          awaitingAiTurn: false,
          ladderRound: null,
          ladderGrid: null,
        },
        result: {
          awarded: 5,
          dailyLimit: 30,
          dailyRemaining: 25,
          cappedByLimit: false,
          preview: false,
        },
      },
    });
    if (!finalBody) throw new Error("마지막 질문 요청이 없습니다");
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: finalBody,
    })).toMatchObject({
      status: 200,
      body: {
        replayed: true,
        run: { status: "SETTLED", version: 4 },
        result: { awarded: 5 },
      },
    });
    expect(store.dispatch(studentA, {
      method: "GET",
      pathname: `/api/question-games/runs/${id}/result`,
      body: {},
    })).toMatchObject({
      status: 200,
      body: {
        run: { status: "SETTLED", version: 4, ladderRound: null },
        result: { awarded: 5, alreadySettled: true },
      },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: createBody,
    })).toMatchObject({
      status: 200,
      body: { replayed: true, run: { id, status: "SETTLED", version: 4 } },
    });
    expect(store.dispatch(studentB, {
      method: "GET",
      pathname: `/api/question-games/runs/${id}/result`,
      body: {},
    })).toEqual({
      status: 403,
      body: { error: "자신의 질문놀이 실행만 이용할 수 있습니다" },
    });
  });

  it("질문 사다리 도움 모드는 주제 두 개를 받고 학생 질문 셋에 구 점을 정산한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const topics = ["도전", "협력"];
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "ladder",
        mode: "ai",
        requestId: ids[65],
        topics,
        locale: "ko",
      },
    });
    const id = runId(created);
    expect(created).toMatchObject({
      status: 201,
      body: {
        run: {
          gameId: "ladder",
          mode: "AI",
          status: "ACTIVE",
          ladderRound: 1,
          aiTurnCount: 0,
          awaitingAiTurn: false,
        },
      },
    });
    const grid = (created.body.run as { ladderGrid: boolean[][] }).ladderGrid;
    expect(grid).toHaveLength(10);
    expect(grid.every((row) => row.length === 1)).toBe(true);
    for (const topic of topics) expect(JSON.stringify(created)).not.toContain(topic);

    let finalResponse = created;
    for (let index = 0; index < 3; index += 1) {
      const question = `도움 사다리 질문 ${index + 1}은 무엇인가요?`;
      finalResponse = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "ladder-submit-question",
          requestId: ids[66 + index],
          expectedVersion: index + 1,
          startColumn: index % 2,
          question,
          locale: "ko",
        },
      });
      expect(JSON.stringify(finalResponse)).not.toContain(question);
    }
    expect(finalResponse).toMatchObject({
      status: 200,
      body: {
        run: {
          status: "SETTLED",
          version: 4,
          questionCount: 3,
          aiTurnCount: 0,
          ladderRound: null,
          ladderGrid: null,
        },
        result: {
          awarded: 9,
          dailyLimit: 50,
          dailyRemaining: 41,
          cappedByLimit: false,
          preview: false,
        },
      },
    });

    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "ladder",
        mode: "solo",
        requestId: ids[70],
        topics: ["하나", "둘"],
        locale: "ko",
      },
    }).status).toBe(400);
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "ladder",
        mode: "ai",
        requestId: ids[71],
        topics: ["하나", "둘", "셋", "넷"],
        locale: "ko",
      },
    }).status).toBe(400);
  });

  it("까바놀이 혼자 모드는 서버 문장 열 개를 차례로 공개하고 서버 판정 결과로 정산한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const createBody = {
      gameId: "kaba",
      mode: "solo",
      requestId: ids[72],
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
        run: {
          id,
          gameId: "kaba",
          mode: "SOLO",
          status: "ACTIVE",
          version: 1,
          questionCount: 0,
          correctCount: 0,
          targetCount: 10,
          currentSentence: getKabaSentences("ko")[0],
          kabaNextStep: "STUDENT_ATTEMPT",
        },
      },
    });
    expect(created.body.run).not.toHaveProperty("kabaSentencePlan");
    expect(JSON.stringify(created)).not.toContain(getKabaSentences("ko")[1]);

    const seenSentences: string[] = [];
    let response = created;
    let firstBody: Record<string, unknown> | null = null;
    for (let index = 0; index < 10; index += 1) {
      const run = response.body.run as { currentSentence: string };
      seenSentences.push(run.currentSentence);
      const correct = index < 6;
      const question = correct
        ? `서버가 판정할 질문 ${index + 1}은 무엇인가요?`
        : `질문이 아닌 답 ${index + 1}`;
      const body = {
        action: "kaba-submit-attempt",
        requestId: ids[73 + index],
        expectedVersion: index + 1,
        locale: "ko",
        question,
        correct: !correct,
        sentence: "사용자가 바꾼 문장",
      };
      response = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body,
      });
      expect(response.body.correct).toBe(correct);
      expect(response.body.run).toMatchObject({
        version: index + 2,
        questionCount: index + 1,
        correctCount: Math.min(index + 1, 6),
      });
      expect(JSON.stringify(response)).not.toContain(question);
      expect(JSON.stringify(response)).not.toContain("사용자가 바꾼 문장");
      if (index === 0) firstBody = body;
    }

    expect(new Set(seenSentences).size).toBe(10);
    const koreanSentences = new Set<string>(getKabaSentences("ko"));
    expect(seenSentences.every((sentence) => koreanSentences.has(sentence))).toBe(true);
    expect(response).toMatchObject({
      status: 200,
      body: {
        replayed: false,
        correct: false,
        run: {
          status: "SETTLED",
          version: 11,
          questionCount: 10,
          correctCount: 6,
          currentSentence: null,
          kabaNextStep: "COMPLETE",
        },
        result: {
          awarded: 8,
          dailyLimit: 30,
          dailyRemaining: 22,
          cappedByLimit: false,
          preview: false,
        },
      },
    });
    if (!firstBody) throw new Error("첫 까바놀이 요청이 없습니다");
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: firstBody,
    })).toMatchObject({
      status: 200,
      body: {
        replayed: true,
        correct: true,
        run: { version: 2, questionCount: 1, correctCount: 1 },
      },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: createBody,
    })).toMatchObject({
      status: 200,
      body: { replayed: true, run: { id, status: "SETTLED", version: 11 } },
    });
    expect(store.dispatch(studentB, {
      method: "GET",
      pathname: `/api/question-games/runs/${id}/result`,
      body: {},
    })).toEqual({
      status: 403,
      body: { error: "자신의 질문놀이 실행만 이용할 수 있습니다" },
    });
  });

  it("까바놀이 도움 모드는 영어 문장과 서버 판정 일곱 개에 십칠 점을 정산한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "kaba",
        mode: "ai",
        requestId: ids[84],
        locale: "en",
      },
    });
    const id = runId(created);
    expect((created.body.run as { currentSentence: string }).currentSentence)
      .toBe(getKabaSentences("en")[0]);

    let response = created;
    for (let index = 0; index < 10; index += 1) {
      response = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "kaba-submit-attempt",
          requestId: ids[85 + index],
          expectedVersion: index + 1,
          locale: "en",
          question: index < 7
            ? `What is server question ${index + 1}?`
            : `Not a question ${index + 1}`,
        },
      });
    }

    expect(response).toMatchObject({
      status: 200,
      body: {
        run: {
          mode: "AI",
          status: "SETTLED",
          questionCount: 10,
          correctCount: 7,
          currentSentence: null,
          kabaNextStep: "COMPLETE",
        },
        result: {
          awarded: 17,
          dailyLimit: 50,
          dailyRemaining: 33,
          cappedByLimit: false,
        },
      },
    });
  });

  it("까바놀이 도움 모드 점수를 학생별 하루 상한까지만 합산한다", () => {
    const store = createBrowserQuestionGameRunStore();

    const finishPerfectRun = (createIndex: number, actionStart: number) => {
      const created = store.dispatch(studentA, {
        method: "POST",
        pathname: "/api/question-games/runs",
        body: {
          gameId: "kaba",
          mode: "ai",
          requestId: ids[createIndex],
          locale: "ko",
        },
      });
      const id = runId(created);
      let response = created;
      for (let index = 0; index < 10; index += 1) {
        response = store.dispatch(studentA, {
          method: "POST",
          pathname: `/api/question-games/runs/${id}/actions`,
          body: {
            action: "kaba-submit-attempt",
            requestId: ids[actionStart + index],
            expectedVersion: index + 1,
            locale: "ko",
            question: `상한 확인 질문 ${createIndex}-${index + 1}은 무엇인가요?`,
          },
        });
      }
      return response;
    };

    expect(finishPerfectRun(96, 97).body.result).toMatchObject({
      awarded: 23,
      dailyRemaining: 27,
      cappedByLimit: false,
    });
    expect(finishPerfectRun(107, 108).body.result).toMatchObject({
      awarded: 23,
      dailyRemaining: 4,
      cappedByLimit: false,
    });
    expect(finishPerfectRun(118, 119).body.result).toMatchObject({
      awarded: 4,
      dailyRemaining: 0,
      cappedByLimit: true,
    });
  });

  it("이야기 주사위 혼자 모드는 굴림과 이야기 뒤 질문과 대답 세 쌍을 재전송해도 한 번만 정산한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const createBody = {
      gameId: "story-dice",
      mode: "solo",
      requestId: ids[140],
      locale: "ko",
    };
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: createBody,
    });
    const id = runId(created);
    const createdRun = created.body.run as {
      storyWordPool: Record<"protagonist" | "place" | "event", string[]>;
    };
    expect(created).toMatchObject({
      status: 201,
      body: {
        replayed: false,
        run: {
          id,
          gameId: "story-dice",
          mode: "SOLO",
          status: "ACTIVE",
          version: 1,
          questionCount: 0,
          aiTurnCount: 0,
          targetCount: 3,
          storyDiceNextStep: "ROLL",
          storyRolledWords: null,
        },
      },
    });
    for (const words of Object.values(createdRun.storyWordPool)) {
      expect(words).toHaveLength(8);
      expect(new Set(words).size).toBe(8);
    }

    const rollBody = {
      action: "story-dice-roll",
      requestId: ids[141],
      expectedVersion: 1,
    };
    const rolled = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: rollBody,
    });
    const rolledWords = (rolled.body.run as {
      storyRolledWords: Record<"protagonist" | "place" | "event", string>;
    }).storyRolledWords;
    expect(rolled).toMatchObject({
      status: 200,
      body: {
        replayed: false,
        run: {
          version: 2,
          storyDiceNextStep: "STORY",
          storyRolledWords: rolledWords,
        },
      },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: rollBody,
    })).toMatchObject({
      status: 200,
      body: { replayed: true, run: { version: 2, storyRolledWords: rolledWords } },
    });

    const story = `${rolledWords.protagonist}은 ${rolledWords.place}에서 ${rolledWords.event}를 발견하고 친구를 도왔다.`;
    const storyBody = {
      action: "story-dice-submit-story",
      requestId: ids[142],
      expectedVersion: 2,
      story,
      locale: "ko",
    };
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: storyBody,
    })).toMatchObject({
      status: 200,
      body: {
        replayed: false,
        run: { version: 3, storyDiceNextStep: "STUDENT_QUESTION" },
      },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: storyBody,
    })).toMatchObject({
      status: 200,
      body: { replayed: true, run: { version: 3 } },
    });

    let finalResponse = created;
    let finalAnswerBody: Record<string, unknown> | null = null;
    for (let index = 0; index < 3; index += 1) {
      const question = `이야기 질문 ${index + 1}은 무엇인가요?`;
      const questionBody = {
        action: "story-dice-submit-question",
        requestId: ids[143 + index * 2],
        expectedVersion: 3 + index * 2,
        question,
        locale: "ko",
      };
      const questioned = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: questionBody,
      });
      expect(questioned.body.run).toMatchObject({
        version: 4 + index * 2,
        questionCount: index,
        storyDiceNextStep: "STUDENT_ANSWER",
      });
      if (index === 0) {
        expect(store.dispatch(studentA, {
          method: "POST",
          pathname: `/api/question-games/runs/${id}/actions`,
          body: questionBody,
        })).toMatchObject({
          status: 200,
          body: { replayed: true, run: { version: 4, questionCount: 0 } },
        });
      }

      const answer = `이야기 대답 ${index + 1}입니다.`;
      const answerBody = {
        action: "story-dice-submit-answer",
        requestId: ids[144 + index * 2],
        expectedVersion: 4 + index * 2,
        answer,
        locale: "ko",
      };
      finalResponse = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: answerBody,
      });
      expect(JSON.stringify(finalResponse)).not.toContain(question);
      expect(JSON.stringify(finalResponse)).not.toContain(answer);
      finalAnswerBody = answerBody;
    }

    expect(finalResponse).toMatchObject({
      status: 200,
      body: {
        replayed: false,
        run: {
          status: "SETTLED",
          version: 9,
          questionCount: 3,
          aiTurnCount: 0,
          storyDiceNextStep: "COMPLETE",
        },
        result: {
          awarded: 5,
          dailyLimit: 30,
          dailyRemaining: 25,
          cappedByLimit: false,
          preview: false,
        },
      },
    });
    if (!finalAnswerBody) throw new Error("마지막 이야기 대답 요청이 없습니다");
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: finalAnswerBody,
    })).toMatchObject({
      status: 200,
      body: {
        replayed: true,
        run: { status: "SETTLED", version: 9 },
        result: { awarded: 5, dailyRemaining: 25 },
      },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: createBody,
    })).toMatchObject({
      status: 200,
      body: {
        replayed: true,
        run: { id, status: "SETTLED", version: 9 },
      },
    });
  });

  it("이야기 주사위 도움 모드는 발급 증명을 기록하고 대답 세 개 뒤 아홉 점을 정산한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "story-dice",
        mode: "ai",
        requestId: ids[150],
        locale: "ko",
      },
    });
    const id = runId(created);
    const rolled = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "story-dice-roll",
        requestId: ids[151],
        expectedVersion: 1,
      },
    });
    const rolledWords = (rolled.body.run as {
      storyRolledWords: Record<"protagonist" | "place" | "event", string>;
    }).storyRolledWords;
    const story = `${rolledWords.protagonist}이 ${rolledWords.place}에서 ${rolledWords.event}를 찾아 모두를 도왔다.`;
    const storySubmitted = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "story-dice-submit-story",
        requestId: ids[152],
        expectedVersion: 2,
        story,
        locale: "ko",
      },
    });
    expect(storySubmitted.body.run).toMatchObject({
      version: 3,
      awaitingAiTurn: true,
      storyDiceNextStep: "AI_QUESTION",
    });

    let previousAnswer = "";
    let finalResponse = storySubmitted;
    for (let index = 0; index < 3; index += 1) {
      const expectedVersion = 3 + index * 2;
      const issueBody = {
        requestId: ids[153 + index * 3],
        expectedVersion,
        story,
        previousAnswer,
        locale: "ko",
      };
      const issued = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/ai-turn`,
        body: issueBody,
      });
      expect(issued).toMatchObject({
        status: 200,
        body: {
          output: expect.stringMatching(/\?$/),
          proof: expect.any(String),
          proofId: expect.any(String),
          expiresAt: expect.any(String),
          runVersion: expectedVersion,
        },
      });
      expect(store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/ai-turn`,
        body: issueBody,
      })).toEqual(issued);

      const issuedBody = issued.body as { output: string; proof: string };
      const recordBody = {
        action: "story-dice-record-ai-question",
        requestId: ids[154 + index * 3],
        generationRequestId: issueBody.requestId,
        expectedVersion,
        output: issuedBody.output,
        proof: issuedBody.proof,
      };
      const recorded = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: recordBody,
      });
      expect(recorded.body.run).toMatchObject({
        version: expectedVersion + 1,
        questionCount: index,
        aiTurnCount: index + 1,
        awaitingAiTurn: false,
        storyDiceNextStep: "STUDENT_ANSWER",
      });
      expect(store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: recordBody,
      })).toMatchObject({
        status: 200,
        body: { replayed: true, run: { aiTurnCount: index + 1 } },
      });

      previousAnswer = `인공지능 질문에 대한 대답 ${index + 1}입니다.`;
      finalResponse = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "story-dice-submit-answer",
          requestId: ids[155 + index * 3],
          expectedVersion: expectedVersion + 1,
          answer: previousAnswer,
          locale: "ko",
        },
      });
    }

    expect(finalResponse).toMatchObject({
      status: 200,
      body: {
        run: {
          status: "SETTLED",
          version: 9,
          questionCount: 3,
          aiTurnCount: 3,
          awaitingAiTurn: false,
          storyDiceNextStep: "COMPLETE",
        },
        result: {
          awarded: 9,
          dailyLimit: 50,
          dailyRemaining: 41,
          cappedByLimit: false,
          preview: false,
        },
      },
    });
  });

  it("다른 화면이 먼저 질문을 기록하면 오래된 이야기 질문을 명시적으로 거절하고 성공으로 바꾸지 않는다", () => {
    const store = createBrowserQuestionGameRunStore();
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "story-dice",
        mode: "solo",
        requestId: ids[165],
        locale: "ko",
      },
    });
    const id = runId(created);
    const rolled = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "story-dice-roll",
        requestId: ids[166],
        expectedVersion: 1,
      },
    });
    const words = (rolled.body.run as {
      storyRolledWords: Record<"protagonist" | "place" | "event", string>;
    }).storyRolledWords;
    const story = `${words.protagonist}은 ${words.place}에서 ${words.event}를 발견했다.`;
    store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "story-dice-submit-story",
        requestId: ids[167],
        expectedVersion: 2,
        story,
        locale: "ko",
      },
    });

    const otherScreen = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "story-dice-submit-question",
        requestId: ids[168],
        expectedVersion: 3,
        question: "먼저 열린 화면의 질문은 무엇인가요?",
        locale: "ko",
      },
    });
    expect(otherScreen.body.run).toMatchObject({
      version: 4,
      questionCount: 0,
      storyDiceNextStep: "STUDENT_ANSWER",
    });

    const staleBody = {
      action: "story-dice-submit-question",
      requestId: ids[169],
      expectedVersion: 3,
      question: "오래된 화면의 질문은 무엇인가요?",
      locale: "ko",
    };
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: staleBody,
    })).toEqual({
      status: 409,
      body: { error: "질문놀이 실행 상태가 바뀌었습니다" },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: staleBody,
    }).status).toBe(409);
    expect(store.dispatch(studentA, {
      method: "GET",
      pathname: `/api/question-games/runs/${id}/result`,
      body: {},
    })).toMatchObject({
      status: 200,
      body: {
        result: null,
        run: {
          status: "ACTIVE",
          version: 4,
          questionCount: 0,
          storyDiceNextStep: "STUDENT_ANSWER",
        },
      },
    });
  });

  it.each([
    ["easy", 18, 6],
    ["normal", 30, 10],
    ["hard", 45, 15],
  ] as const)("카드 짝 찾기 %s 실행은 고정 보드와 최대 시도를 숨김 상태로 만든다", (
    difficulty,
    targetCount,
    pairCount,
  ) => {
    const store = createBrowserQuestionGameRunStore();
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "memory",
        mode: "solo",
        difficulty,
        requestId: ids[170],
        locale: "ko",
      },
    });
    const run = memoryRun(created);

    expect(created.status).toBe(201);
    expect(run).toMatchObject({
      status: "ACTIVE",
      version: 1,
      questionCount: 0,
      aiTurnCount: 0,
      targetCount,
      memoryDifficulty: difficulty,
      memoryNextStep: "STUDENT_QUESTION",
      studentMatchCount: 0,
      aiMatchCount: 0,
      memoryMissReveal: null,
      memoryReview: null,
    });
    expect(run.memoryQuestionCards).toHaveLength(pairCount);
    expect(run.memoryAnswerCards).toHaveLength(pairCount);
    for (const card of [...run.memoryQuestionCards, ...run.memoryAnswerCards]) {
      expect(card).toMatchObject({ state: "HIDDEN" });
      expect(card).not.toHaveProperty("contentKey");
    }
  });

  it("카드 짝 찾기 생성과 카드 뒤집기를 재생하고 다른 입력과 오래된 버전을 거절한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const createBody = {
      gameId: "memory",
      mode: "solo",
      difficulty: "easy",
      requestId: ids[171],
      locale: "ko",
    };
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: createBody,
    });
    const id = runId(created);
    const initial = memoryRun(created);
    const questionBody = {
      action: "memory-flip-card",
      requestId: ids[172],
      expectedVersion: 1,
      cardId: initial.memoryQuestionCards[0].id,
    };
    const questioned = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: questionBody,
    });
    const questionedRun = memoryRun(questioned);

    expect(questionedRun).toMatchObject({
      version: 2,
      questionCount: 0,
      memoryNextStep: "STUDENT_ANSWER",
    });
    expect(questionedRun.memoryQuestionCards[0]).toMatchObject({
      state: "REVEALED",
      contentKey: "memory-pair-01",
    });
    expect(questionedRun.memoryQuestionCards[1]).not.toHaveProperty("contentKey");
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: questionBody,
    })).toMatchObject({
      status: 200,
      body: { replayed: true, run: { version: 2 } },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: { ...questionBody, cardId: initial.memoryQuestionCards[1].id },
    })).toEqual({
      status: 409,
      body: { error: "같은 요청 식별값에 다른 동작이 들어왔습니다" },
    });

    const answered = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "memory-flip-card",
        requestId: ids[173],
        expectedVersion: 2,
        cardId: initial.memoryAnswerCards[0].id,
      },
    });
    const answeredRun = memoryRun(answered);
    expect(answeredRun).toMatchObject({
      status: "ACTIVE",
      version: 3,
      questionCount: 1,
      studentMatchCount: 1,
      memoryNextStep: "STUDENT_QUESTION",
    });
    expect(answeredRun.memoryQuestionCards[0].state).toBe("TAKEN");
    expect(answeredRun.memoryAnswerCards[0].state).toBe("TAKEN");

    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "memory-flip-card",
        requestId: ids[174],
        expectedVersion: 1,
        cardId: initial.memoryQuestionCards[1].id,
      },
    })).toEqual({
      status: 409,
      body: { error: "질문놀이 실행 상태가 바뀌었습니다" },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: { ...createBody, difficulty: "hard" },
    }).status).toBe(409);
  });

  it("학생의 틀린 짝은 공개 뒤 해소하고 혼자 모드는 학생 차례를 유지한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "memory",
        mode: "solo",
        difficulty: "easy",
        requestId: ids[175],
        locale: "ko",
      },
    });
    const id = runId(created);
    const initial = memoryRun(created);
    store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "memory-flip-card",
        requestId: ids[176],
        expectedVersion: 1,
        cardId: initial.memoryQuestionCards[0].id,
      },
    });
    const missed = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "memory-flip-card",
        requestId: ids[177],
        expectedVersion: 2,
        cardId: initial.memoryAnswerCards[1].id,
      },
    });
    const missedRun = memoryRun(missed);
    expect(missedRun).toMatchObject({
      version: 3,
      questionCount: 1,
      memoryNextStep: "RESOLVE_MISS",
      memoryMissReveal: {
        actor: "STUDENT",
        result: "MISS",
        resolveAt: expect.any(Number),
      },
    });
    expect(missedRun.memoryQuestionCards[0].state).toBe("REVEALED");
    expect(missedRun.memoryAnswerCards[1].state).toBe("REVEALED");
    const revealId = missedRun.memoryMissReveal?.id;
    if (!revealId) throw new Error("실패 공개 식별값이 없습니다");

    const resolveBody = {
      action: "memory-resolve-miss",
      requestId: ids[178],
      expectedVersion: 3,
      revealId,
    };
    const resolved = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: resolveBody,
    });
    const resolvedRun = memoryRun(resolved);
    expect(resolvedRun).toMatchObject({
      status: "ACTIVE",
      version: 4,
      memoryNextStep: "STUDENT_QUESTION",
      memoryMissReveal: null,
    });
    expect(resolvedRun.memoryQuestionCards[0]).toMatchObject({ state: "HIDDEN" });
    expect(resolvedRun.memoryQuestionCards[0]).not.toHaveProperty("contentKey");
    expect(resolvedRun.memoryAnswerCards[1]).not.toHaveProperty("contentKey");
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: resolveBody,
    })).toMatchObject({ body: { replayed: true, run: { version: 4 } } });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: { ...resolveBody, revealId: "different-reveal" },
    }).status).toBe(409);
  });

  it("도움 모드의 학생 실패 뒤 인공지능이 서버가 고른 두 카드로 시도하고 학생에게 돌려준다", () => {
    const store = createBrowserQuestionGameRunStore();
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "memory",
        mode: "ai",
        difficulty: "easy",
        requestId: ids[180],
        locale: "ko",
      },
    });
    const id = runId(created);
    const initial = memoryRun(created);
    store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "memory-flip-card",
        requestId: ids[181],
        expectedVersion: 1,
        cardId: initial.memoryQuestionCards[0].id,
      },
    });
    const studentMiss = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "memory-flip-card",
        requestId: ids[182],
        expectedVersion: 2,
        cardId: initial.memoryAnswerCards[1].id,
      },
    });
    const studentReveal = memoryRun(studentMiss).memoryMissReveal;
    if (!studentReveal) throw new Error("학생 실패 공개가 없습니다");
    const aiReady = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "memory-resolve-miss",
        requestId: ids[183],
        expectedVersion: 3,
        revealId: studentReveal.id,
      },
    });
    expect(memoryRun(aiReady)).toMatchObject({
      version: 4,
      awaitingAiTurn: true,
      memoryNextStep: "AI_TURN",
    });

    const aiBody = {
      action: "memory-ai-turn",
      requestId: ids[184],
      expectedVersion: 4,
    };
    const aiPlayed = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: aiBody,
    });
    const aiPlayedRun = memoryRun(aiPlayed);
    expect(aiPlayedRun).toMatchObject({
      version: 5,
      questionCount: 2,
      aiTurnCount: 1,
      awaitingAiTurn: false,
      memoryNextStep: "RESOLVE_MISS",
      memoryMissReveal: { actor: "AI", result: "MISS" },
    });
    expect(store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: aiBody,
    })).toMatchObject({ body: { replayed: true, run: { aiTurnCount: 1 } } });
    const aiReveal = aiPlayedRun.memoryMissReveal;
    if (!aiReveal) throw new Error("인공지능 실패 공개가 없습니다");
    const studentReady = store.dispatch(studentA, {
      method: "POST",
      pathname: `/api/question-games/runs/${id}/actions`,
      body: {
        action: "memory-resolve-miss",
        requestId: ids[185],
        expectedVersion: 5,
        revealId: aiReveal.id,
      },
    });
    expect(memoryRun(studentReady)).toMatchObject({
      version: 6,
      awaitingAiTurn: false,
      memoryNextStep: "STUDENT_QUESTION",
    });
  });

  it.each([
    ["혼자", "solo", studentA, 8, 30, false],
    ["도움", "ai", studentA, 15, 50, false],
    ["교사 미리보기", "solo", teacher, 0, 30, true],
  ] as const)("카드 짝 찾기 %s 실행은 모든 짝을 일찍 찾으면 활동 결과를 한 번 정산한다", (
    _case,
    mode,
    actor,
    awarded,
    dailyLimit,
    preview,
  ) => {
    const store = createBrowserQuestionGameRunStore();
    const created = store.dispatch(actor, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "memory",
        mode,
        difficulty: "easy",
        requestId: ids[200],
        locale: "ko",
      },
    });
    const id = runId(created);
    const initial = memoryRun(created);
    let version = 1;
    let final = created;
    for (let index = 0; index < 6; index += 1) {
      store.dispatch(actor, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "memory-flip-card",
          requestId: ids[201 + index * 2],
          expectedVersion: version,
          cardId: initial.memoryQuestionCards[index].id,
        },
      });
      version += 1;
      final = store.dispatch(actor, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "memory-flip-card",
          requestId: ids[202 + index * 2],
          expectedVersion: version,
          cardId: initial.memoryAnswerCards[index].id,
        },
      });
      version += 1;
    }
    expect(final).toMatchObject({
      status: 200,
      body: {
        run: {
          status: "SETTLED",
          version: 13,
          questionCount: 6,
          aiTurnCount: 0,
          studentMatchCount: 6,
          aiMatchCount: 0,
          memoryNextStep: "COMPLETE",
          memoryReview: expect.arrayContaining([
            { contentKey: "memory-pair-01" },
            { contentKey: "memory-pair-06" },
          ]),
        },
        result: {
          awarded,
          dailyLimit,
          dailyRemaining: dailyLimit - awarded,
          cappedByLimit: false,
          preview,
        },
      },
    });
    expect(memoryRun(final).memoryReview).toHaveLength(6);
  });

  it("마지막 허용 실패는 공개를 해소할 때 혼자 모드 완료 점수를 정산한다", () => {
    const store = createBrowserQuestionGameRunStore();
    const created = store.dispatch(studentA, {
      method: "POST",
      pathname: "/api/question-games/runs",
      body: {
        gameId: "memory",
        mode: "solo",
        difficulty: "easy",
        requestId: ids[260],
        locale: "ko",
      },
    });
    const id = runId(created);
    const initial = memoryRun(created);
    let version = 1;
    let final = created;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "memory-flip-card",
          requestId: ids[261 + attempt * 3],
          expectedVersion: version,
          cardId: initial.memoryQuestionCards[0].id,
        },
      });
      version += 1;
      const missed = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "memory-flip-card",
          requestId: ids[262 + attempt * 3],
          expectedVersion: version,
          cardId: initial.memoryAnswerCards[1].id,
        },
      });
      version += 1;
      const reveal = memoryRun(missed).memoryMissReveal;
      if (!reveal) throw new Error("최대 시도 실패 공개가 없습니다");
      expect(memoryRun(missed).memoryNextStep).toBe("RESOLVE_MISS");
      final = store.dispatch(studentA, {
        method: "POST",
        pathname: `/api/question-games/runs/${id}/actions`,
        body: {
          action: "memory-resolve-miss",
          requestId: ids[263 + attempt * 3],
          expectedVersion: version,
          revealId: reveal.id,
        },
      });
      version += 1;
    }
    expect(final).toMatchObject({
      status: 200,
      body: {
        run: {
          status: "SETTLED",
          version: 55,
          questionCount: 18,
          studentMatchCount: 0,
          memoryNextStep: "COMPLETE",
          memoryMissReveal: null,
        },
        result: {
          awarded: 2,
          dailyLimit: 30,
          dailyRemaining: 28,
        },
      },
    });
    const finalRun = memoryRun(final);
    for (const card of [...finalRun.memoryQuestionCards, ...finalRun.memoryAnswerCards]) {
      expect(card.state).toBe("REVEALED");
      expect(card.contentKey).toMatch(/^memory-pair-/);
    }
    expect(finalRun.memoryReview).toHaveLength(6);
  });
});

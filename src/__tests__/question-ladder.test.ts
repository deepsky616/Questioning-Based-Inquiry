import { describe, expect, it } from "vitest";
import {
  LADDER_ROW_COUNT,
  assignLadderTopics,
  buildLadderPathSegments,
  generateLadderGrid,
  traceLadderColumns,
  type LadderGrid,
} from "@/lib/question-ladder";

const FIXED_GRID = [
  [true, false, true],
  [false, true, false],
  [true, false, false],
  [false, false, false],
  [false, false, false],
  [false, false, false],
  [false, false, false],
  [false, false, false],
  [false, false, false],
  [false, false, false],
] as const satisfies LadderGrid;

function createEmptyGrid(columnCount: number): boolean[][] {
  return Array.from(
    { length: LADDER_ROW_COUNT },
    () => Array.from({ length: columnCount - 1 }, () => false),
  );
}

function malformedGridCases(): Array<{ name: string; grid: unknown }> {
  const unevenRows = createEmptyGrid(2);
  unevenRows[4] = [false, false];

  const adjacentRungs = createEmptyGrid(3);
  adjacentRungs[4] = [true, true];

  const invalidRung: unknown[][] = createEmptyGrid(3);
  invalidRung[4][1] = 1;

  return [
    { name: "빈 배열", grid: [] },
    { name: "서로 다른 행 너비", grid: unevenRows },
    { name: "맞닿은 발판", grid: adjacentRungs },
    { name: "범위를 넘은 열 수", grid: createEmptyGrid(9) },
    { name: "참이나 거짓이 아닌 발판", grid: invalidRung },
  ];
}

function expectGridConsumersToReject(grid: LadderGrid): void {
  const firstRow = grid[0];
  const topicCount = Array.isArray(firstRow) ? firstRow.length + 1 : 2;
  const topics = Array.from({ length: topicCount }, (_, index) => `주제 ${index}`);

  expect(() => traceLadderColumns(0, grid)).toThrow();
  expect(() => buildLadderPathSegments(0, grid)).toThrow();
  expect(() => assignLadderTopics(topics, grid)).toThrow();
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("질문 사다리 생성", () => {
  it.each([2, 3, 4, 5, 6, 7, 8])(
    "%i열 사다리는 열 줄이고 맞닿은 발판이 없다",
    (columnCount) => {
      const grid = generateLadderGrid(columnCount, seededRandom(17));

      expect(grid).toHaveLength(LADDER_ROW_COUNT);
      expect(grid.every((row) => row.length === columnCount - 1)).toBe(true);
      expect(grid.every((row) => row.every(
        (rung, index) => !rung || row[index + 1] !== true,
      ))).toBe(true);
    },
  );

  it("같은 난수 공급자는 같은 사다리를 만든다", () => {
    expect(generateLadderGrid(8, seededRandom(31))).toEqual(
      generateLadderGrid(8, seededRandom(31)),
    );
  });

  it.each([0, 1, 9, -2, 2.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "잘못된 열 수 %s를 거절한다",
    (columnCount) => {
      expect(() => generateLadderGrid(columnCount, () => 0.5)).toThrow();
    },
  );

  it.each([-0.01, 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "범위를 벗어난 난수 %s를 거절한다",
    (randomValue) => {
      expect(() => generateLadderGrid(4, () => randomValue)).toThrow();
    },
  );
});

describe("질문 사다리 추적", () => {
  it.each([
    [0, [0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2]],
    [1, [1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1]],
    [2, [2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]],
    [3, [3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0]],
  ] as const)("%i번 시작점의 행별 열을 추적한다", (startColumn, expected) => {
    expect(traceLadderColumns(startColumn, FIXED_GRID)).toEqual(expected);
  });

  it.each([2, 3, 4, 5, 6, 7, 8])(
    "%i열 사다리의 마지막 열은 일대일 순열이다",
    (columnCount) => {
      const grid = generateLadderGrid(columnCount, seededRandom(47));
      const destinations = Array.from({ length: columnCount }, (_, start) =>
        traceLadderColumns(start, grid).at(-1),
      );

      expect(new Set(destinations).size).toBe(columnCount);
      expect([...destinations].sort((left, right) => left! - right!)).toEqual(
        Array.from({ length: columnCount }, (_, index) => index),
      );
    },
  );

  it.each([-1, 4, 1.5])("범위를 벗어난 시작 열 %s를 거절한다", (startColumn) => {
    expect(() => traceLadderColumns(startColumn, FIXED_GRID)).toThrow();
  });

  it.each([1, 9, 11])("%i개 행인 사다리를 모든 소비 함수가 거절한다", (rowCount) => {
    const grid = Array.from({ length: rowCount }, () => [false]) as LadderGrid;

    expectGridConsumersToReject(grid);
  });

  it("바깥 배열의 비어 있는 칸을 모든 소비 함수가 거절한다", () => {
    const grid = new Array<boolean[]>(LADDER_ROW_COUNT);
    for (let index = 0; index < grid.length; index += 1) {
      if (index !== 4) grid[index] = [false];
    }

    expectGridConsumersToReject(grid);
  });

  it("안쪽 행의 비어 있는 칸을 모든 소비 함수가 거절한다", () => {
    const grid = createEmptyGrid(3);
    const sparseRow = new Array<boolean>(2);
    sparseRow[0] = false;
    grid[4] = sparseRow;

    expectGridConsumersToReject(grid);
  });

  it.each(malformedGridCases())("$name 자료를 거절한다", ({ grid }) => {
    expect(() => traceLadderColumns(0, grid as unknown as LadderGrid)).toThrow();
  });
});

describe("질문 사다리 경로 선분", () => {
  it("고정 사다리에서 세로선과 실제 발판만 연속해서 지난다", () => {
    expect(buildLadderPathSegments(0, FIXED_GRID)).toEqual([
      {
        axis: "vertical",
        from: { column: 0, level: 0 },
        to: { column: 0, level: 0.5 },
      },
      {
        axis: "horizontal",
        from: { column: 0, level: 0.5 },
        to: { column: 1, level: 0.5 },
      },
      {
        axis: "vertical",
        from: { column: 1, level: 0.5 },
        to: { column: 1, level: 1.5 },
      },
      {
        axis: "horizontal",
        from: { column: 1, level: 1.5 },
        to: { column: 2, level: 1.5 },
      },
      {
        axis: "vertical",
        from: { column: 2, level: 1.5 },
        to: { column: 2, level: 2.5 },
      },
      {
        axis: "vertical",
        from: { column: 2, level: 2.5 },
        to: { column: 2, level: 3.5 },
      },
      {
        axis: "vertical",
        from: { column: 2, level: 3.5 },
        to: { column: 2, level: 4.5 },
      },
      {
        axis: "vertical",
        from: { column: 2, level: 4.5 },
        to: { column: 2, level: 5.5 },
      },
      {
        axis: "vertical",
        from: { column: 2, level: 5.5 },
        to: { column: 2, level: 6.5 },
      },
      {
        axis: "vertical",
        from: { column: 2, level: 6.5 },
        to: { column: 2, level: 7.5 },
      },
      {
        axis: "vertical",
        from: { column: 2, level: 7.5 },
        to: { column: 2, level: 8.5 },
      },
      {
        axis: "vertical",
        from: { column: 2, level: 8.5 },
        to: { column: 2, level: 9.5 },
      },
      {
        axis: "vertical",
        from: { column: 2, level: 9.5 },
        to: { column: 2, level: 10 },
      },
    ]);
  });

  it.each([0, 1, 2, 3])(
    "%i번 경로는 끊김과 대각선 없이 추적 도착점에서 끝난다",
    (startColumn) => {
      const segments = buildLadderPathSegments(startColumn, FIXED_GRID);
      const traced = traceLadderColumns(startColumn, FIXED_GRID);

      expect(segments[0]?.from).toEqual({ column: startColumn, level: 0 });
      expect(segments.at(-1)?.to).toEqual({
        column: traced.at(-1),
        level: FIXED_GRID.length,
      });

      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        expect(segment.axis === "vertical"
          ? segment.from.column === segment.to.column
          : segment.from.level === segment.to.level).toBe(true);
        if (index > 0) expect(segment.from).toEqual(segments[index - 1].to);
      }
    },
  );

  it("가로 선분은 해당 높이의 실제 발판만 지난다", () => {
    const segments = buildLadderPathSegments(3, FIXED_GRID);
    const horizontal = segments.filter(({ axis }) => axis === "horizontal");

    expect(horizontal).not.toHaveLength(0);
    for (const segment of horizontal) {
      const row = Math.floor(segment.from.level);
      const leftColumn = Math.min(segment.from.column, segment.to.column);
      expect(segment.from.level).toBe(row + 0.5);
      expect(FIXED_GRID[row][leftColumn]).toBe(true);
    }
  });

  it("옆 열로 옮긴 뒤 이전 시작 열 아래에 여분 선을 만들지 않는다", () => {
    const segments = buildLadderPathSegments(0, FIXED_GRID);

    expect(segments.some((segment) =>
      segment.axis === "vertical"
      && segment.from.column === 0
      && segment.from.level >= 0.5,
    )).toBe(false);
  });
});

describe("질문 사다리 주제 배정", () => {
  it("도착 열의 주제를 각 시작 열에 정확히 배정한다", () => {
    const topics = ["공기", "물", "흙", "빛"] as const;

    expect(assignLadderTopics(topics, FIXED_GRID)).toEqual([
      { startColumn: 0, destinationColumn: 2, topic: "흙" },
      { startColumn: 1, destinationColumn: 1, topic: "물" },
      { startColumn: 2, destinationColumn: 3, topic: "빛" },
      { startColumn: 3, destinationColumn: 0, topic: "공기" },
    ]);
    expect(topics).toEqual(["공기", "물", "흙", "빛"]);
    expect(FIXED_GRID).toEqual([
      [true, false, true],
      [false, true, false],
      [true, false, false],
      [false, false, false],
      [false, false, false],
      [false, false, false],
      [false, false, false],
      [false, false, false],
      [false, false, false],
      [false, false, false],
    ]);
  });

  it.each([
    { name: "모자란", topics: ["공기", "물", "흙"] },
    { name: "넘치는", topics: ["공기", "물", "흙", "빛", "생명"] },
    { name: "문자열이 아닌", topics: ["공기", "물", 3, "빛"] },
  ])("$name 주제 자료를 거절한다", ({ topics }) => {
    expect(() => assignLadderTopics(
      topics as unknown as readonly string[],
      FIXED_GRID,
    )).toThrow();
  });

  it("비어 있는 칸이 있는 주제 배열을 거절한다", () => {
    const topics = new Array<string>(4);
    topics[0] = "공기";
    topics[2] = "흙";

    expect(() => assignLadderTopics(topics, FIXED_GRID)).toThrow();
  });
});

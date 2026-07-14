export const LADDER_ROW_COUNT = 10;

const MIN_COLUMN_COUNT = 2;
const MAX_COLUMN_COUNT = 8;
const RUNG_PROBABILITY = 0.35;

export type LadderGrid = readonly (readonly boolean[])[];

export interface LadderPathPoint {
  column: number;
  level: number;
}

export interface LadderPathSegment {
  axis: "vertical" | "horizontal";
  from: LadderPathPoint;
  to: LadderPathPoint;
}

export interface LadderTopicAssignment {
  startColumn: number;
  destinationColumn: number;
  topic: string;
}

function assertColumnCount(columnCount: number): void {
  if (
    !Number.isInteger(columnCount)
    || columnCount < MIN_COLUMN_COUNT
    || columnCount > MAX_COLUMN_COUNT
  ) {
    throw new Error("사다리 열 수는 이 이상 팔 이하여야 합니다");
  }
}

function readColumnCount(grid: LadderGrid): number {
  if (!Array.isArray(grid) || grid.length === 0) {
    throw new Error("사다리 발판은 한 행 이상이어야 합니다");
  }

  const firstRow = grid[0];
  if (!Array.isArray(firstRow)) {
    throw new Error("사다리의 각 행은 발판 배열이어야 합니다");
  }

  const columnCount = firstRow.length + 1;
  assertColumnCount(columnCount);

  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== columnCount - 1) {
      throw new Error("모든 사다리 행의 너비가 같아야 합니다");
    }

    for (let index = 0; index < row.length; index += 1) {
      if (typeof row[index] !== "boolean") {
        throw new Error("사다리 발판은 참 또는 거짓이어야 합니다");
      }
      if (row[index] && row[index + 1]) {
        throw new Error("한 행에서 발판이 서로 맞닿을 수 없습니다");
      }
    }
  }

  return columnCount;
}

function assertStartColumn(startColumn: number, columnCount: number): void {
  if (
    !Number.isInteger(startColumn)
    || startColumn < 0
    || startColumn >= columnCount
  ) {
    throw new Error("시작 열이 사다리 범위를 벗어났습니다");
  }
}

function nextColumn(column: number, row: readonly boolean[]): number {
  if (row[column] === true) return column + 1;
  if (column > 0 && row[column - 1] === true) return column - 1;
  return column;
}

export function generateLadderGrid(
  columnCount: number,
  random: () => number,
): boolean[][] {
  assertColumnCount(columnCount);
  if (typeof random !== "function") {
    throw new Error("사다리 난수 공급자가 필요합니다");
  }

  return Array.from({ length: LADDER_ROW_COUNT }, () => {
    const row: boolean[] = [];
    for (let index = 0; index < columnCount - 1; index += 1) {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) {
        throw new Error("사다리 난수는 영 이상 일 미만이어야 합니다");
      }
      row.push(row[index - 1] !== true && value < RUNG_PROBABILITY);
    }
    return row;
  });
}

export function traceLadderColumns(
  startColumn: number,
  grid: LadderGrid,
): number[] {
  const columnCount = readColumnCount(grid);
  assertStartColumn(startColumn, columnCount);

  const columns = [startColumn];
  let currentColumn = startColumn;
  for (const row of grid) {
    currentColumn = nextColumn(currentColumn, row);
    columns.push(currentColumn);
  }
  return columns;
}

export function buildLadderPathSegments(
  startColumn: number,
  grid: LadderGrid,
): LadderPathSegment[] {
  const columnCount = readColumnCount(grid);
  assertStartColumn(startColumn, columnCount);

  const segments: LadderPathSegment[] = [];
  let currentColumn = startColumn;
  let currentLevel = 0;

  for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
    const rungLevel = rowIndex + 0.5;
    segments.push({
      axis: "vertical",
      from: { column: currentColumn, level: currentLevel },
      to: { column: currentColumn, level: rungLevel },
    });

    const destinationColumn = nextColumn(currentColumn, grid[rowIndex]);
    if (destinationColumn !== currentColumn) {
      segments.push({
        axis: "horizontal",
        from: { column: currentColumn, level: rungLevel },
        to: { column: destinationColumn, level: rungLevel },
      });
      currentColumn = destinationColumn;
    }
    currentLevel = rungLevel;
  }

  segments.push({
    axis: "vertical",
    from: { column: currentColumn, level: currentLevel },
    to: { column: currentColumn, level: grid.length },
  });
  return segments;
}

export function assignLadderTopics(
  topics: readonly string[],
  grid: LadderGrid,
): LadderTopicAssignment[] {
  const columnCount = readColumnCount(grid);
  if (
    !Array.isArray(topics)
    || topics.length !== columnCount
    || Array.from(
      { length: topics.length },
      (_, index) => topics[index],
    ).some((topic) => typeof topic !== "string")
  ) {
    throw new Error("주제 수와 사다리 열 수가 같아야 합니다");
  }

  return topics.map((_, startColumn) => {
    const path = traceLadderColumns(startColumn, grid);
    const destinationColumn = path[path.length - 1];
    return {
      startColumn,
      destinationColumn,
      topic: topics[destinationColumn],
    };
  });
}

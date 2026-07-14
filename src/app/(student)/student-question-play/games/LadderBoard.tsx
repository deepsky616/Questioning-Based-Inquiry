"use client";

import {
  buildLadderPathSegments,
  type LadderGrid,
  type LadderPathPoint,
} from "@/lib/question-ladder";
import { getQuestionGameText } from "@/lib/question-game-i18n";

export interface LadderBoardAssignment {
  playerName: string;
  startColumn: number;
  destinationColumn: number;
  topic: string;
}

interface LadderBoardProps {
  locale: string;
  grid: LadderGrid;
  assignments: readonly LadderBoardAssignment[];
  selectedStartColumn?: number | null;
}

const COLUMN_GAP = 96;
const SIDE_PADDING = 48;
const SVG_HEIGHT = 400;
const LADDER_TOP = 60;
const LADDER_BOTTOM = 330;

function columnLetter(column: number): string {
  return String.fromCharCode(65 + column);
}

export default function LadderBoard({
  locale,
  grid,
  assignments,
  selectedStartColumn = null,
}: LadderBoardProps) {
  const text = getQuestionGameText(locale);
  const columnCount = grid[0]?.length === undefined
    ? assignments.length
    : grid[0].length + 1;
  const width = SIDE_PADDING * 2 + Math.max(columnCount - 1, 0) * COLUMN_GAP;
  const columnX = (column: number) => SIDE_PADDING + column * COLUMN_GAP;
  const levelY = (level: number) =>
    LADDER_TOP + (level / grid.length) * (LADDER_BOTTOM - LADDER_TOP);

  const selectedAssignment = selectedStartColumn === null
    ? undefined
    : assignments.find(
      (assignment) => assignment.startColumn === selectedStartColumn,
    );
  const pathSegments = selectedStartColumn === null
    ? []
    : buildLadderPathSegments(selectedStartColumn, grid);
  const pathEnd = pathSegments.at(-1)?.to.column;
  const accessibleName = selectedAssignment && pathEnd !== undefined
    ? text.ladderPathLabel(
      selectedAssignment.startColumn + 1,
      columnLetter(pathEnd),
      selectedAssignment.topic,
    )
    : text.ladderBoardLabel;

  function pointCoordinates(point: LadderPathPoint) {
    return {
      x: columnX(point.column),
      y: levelY(point.level),
    };
  }

  return (
    <section
      aria-label={text.ladderBoardLabel}
      className="space-y-4 text-foreground"
    >
      <div className="w-full overflow-x-auto rounded-lg border border-border bg-card px-2 py-3 text-card-foreground">
        <svg
          aria-label={accessibleName}
          className="mx-auto block"
          height={SVG_HEIGHT}
          role="img"
          viewBox={`0 0 ${width} ${SVG_HEIGHT}`}
          width={width}
        >
          <title>{accessibleName}</title>

          <g className="fill-current text-foreground">
            {Array.from({ length: columnCount }, (_, column) => (
              <g key={`start-label-${column}`}>
                <text
                  fontSize="13"
                  fontWeight="700"
                  textAnchor="middle"
                  x={columnX(column)}
                  y="20"
                >
                  {column + 1}
                </text>
                <text
                  fontSize="13"
                  fontWeight="700"
                  textAnchor="middle"
                  x={columnX(column)}
                  y="388"
                >
                  {columnLetter(column)}
                </text>
              </g>
            ))}
          </g>

          <g className="text-slate-600 dark:text-slate-300">
            {Array.from({ length: columnCount }, (_, column) => (
              <line
                data-testid="ladder-base-vertical"
                key={`vertical-${column}`}
                stroke="currentColor"
                strokeWidth="2"
                x1={columnX(column)}
                x2={columnX(column)}
                y1={LADDER_TOP}
                y2={LADDER_BOTTOM}
              />
            ))}
            {grid.flatMap((row, rowIndex) =>
              row.flatMap((hasRung, column) => {
                if (!hasRung) return [];
                const y = levelY(rowIndex + 0.5);
                return [
                  <line
                    data-testid="ladder-base-rung"
                    key={`rung-${rowIndex}-${column}`}
                    stroke="currentColor"
                    strokeWidth="2"
                    x1={columnX(column)}
                    x2={columnX(column + 1)}
                    y1={y}
                    y2={y}
                  />,
                ];
              }),
            )}
          </g>

          {selectedStartColumn !== null && pathEnd !== undefined && (
            <g className="text-violet-700 dark:text-violet-300">
              {pathSegments.map((segment, index) => {
                const from = pointCoordinates(segment.from);
                const to = pointCoordinates(segment.to);
                return (
                  <line
                    data-axis={segment.axis}
                    data-from-column={segment.from.column}
                    data-from-level={segment.from.level}
                    data-testid="ladder-path-segment"
                    data-to-column={segment.to.column}
                    data-to-level={segment.to.level}
                    key={`path-${index}`}
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="5"
                    x1={from.x}
                    x2={to.x}
                    y1={from.y}
                    y2={to.y}
                  />
                );
              })}

              <g
                aria-label={text.ladderStartMarker(selectedStartColumn + 1)}
                data-testid="ladder-start-marker"
                role="img"
                transform={`translate(${columnX(selectedStartColumn)} 43)`}
              >
                <circle fill="currentColor" r="12" />
                <text
                  className="fill-card dark:fill-slate-950"
                  dominantBaseline="central"
                  fontSize="10"
                  fontWeight="900"
                  textAnchor="middle"
                >
                  S
                </text>
              </g>
              <g
                aria-label={text.ladderEndMarker(columnLetter(pathEnd))}
                data-testid="ladder-end-marker"
                role="img"
                transform={`translate(${columnX(pathEnd)} 351)`}
              >
                <path d="M 0 -13 L 13 0 L 0 13 L -13 0 Z" fill="currentColor" />
                <text
                  className="fill-card dark:fill-slate-950"
                  dominantBaseline="central"
                  fontSize="10"
                  fontWeight="900"
                  textAnchor="middle"
                >
                  E
                </text>
              </g>
            </g>
          )}
        </svg>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-black text-foreground">
          {text.ladderAssignmentsLabel}
        </h3>
        <ol
          aria-label={text.ladderAssignmentsLabel}
          className="divide-y divide-border border-y border-border"
        >
          {[...assignments]
            .sort((left, right) => left.startColumn - right.startColumn)
            .map((assignment) => (
              <li
                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 py-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]"
                key={`${assignment.startColumn}-${assignment.playerName}`}
              >
                <span className="font-black text-violet-700 dark:text-violet-300">
                  {assignment.startColumn + 1}
                </span>
                <span className="break-words font-bold text-foreground">
                  {assignment.playerName}
                </span>
                <span className="font-black text-emerald-700 dark:text-emerald-300">
                  {columnLetter(assignment.destinationColumn)}
                </span>
                <span className="break-words text-foreground">
                  {assignment.topic}
                </span>
              </li>
            ))}
        </ol>
      </div>
    </section>
  );
}

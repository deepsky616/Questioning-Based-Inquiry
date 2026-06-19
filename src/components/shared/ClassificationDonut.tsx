"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export interface DonutSlice {
  name: string;
  value: number;
  /** 조각 색(hex). 대시보드 카드 색 매핑과 동일하게 맞춘다. */
  fill: string;
}

// 조각 호버 시 이름·개수·비율 표시 (테마 토큰 적용)
function DonutTooltip({ active, payload, total }: {
  active?: boolean;
  payload?: Array<{ payload: DonutSlice }>;
  total?: number;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const pct = total ? Math.round((d.value / total) * 100) : 0;
  return (
    <div className="relative z-50 whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-lg">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.fill }} />
        <span className="font-semibold text-foreground">{d.name}</span>
        <span className="text-muted-foreground">{d.value}개 ({pct}%)</span>
      </span>
    </div>
  );
}

/**
 * 분류1/분류2 분포 도넛 차트 (교사·학생 대시보드 공용).
 * 기존 숫자·막대는 그대로 두고 분포를 한눈에 보여주는 보조 시각화 역할만 한다.
 * 가운데에 총 개수를 표시한다. 데이터가 0이면 옅은 트랙만 그린다.
 */
export function ClassificationDonut({
  slices,
  size = 132,
}: {
  slices: DonutSlice[];
  size?: number;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const hasData = total > 0;

  // 값이 모두 0이면 recharts가 빈 차트를 그리므로, 옅은 트랙용 더미 데이터를 쓴다.
  const data = hasData ? slices : [{ name: "없음", value: 1, fill: "transparent" }];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="62%"
            outerRadius="100%"
            paddingAngle={hasData ? 2 : 0}
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={hasData ? d.fill : "hsl(var(--muted))"} />
            ))}
          </Pie>
          {hasData && (
            <Tooltip
              content={<DonutTooltip total={total} />}
              wrapperStyle={{ zIndex: 50, outline: "none" }}
              allowEscapeViewBox={{ x: true, y: true }}
              offset={12}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
      {/* 가운데 총계 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-xl font-bold text-foreground leading-none">{total}</span>
        <span className="text-[11px] text-muted-foreground mt-0.5">총 질문</span>
      </div>
    </div>
  );
}

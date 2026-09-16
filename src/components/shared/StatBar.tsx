export function StatBar({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="min-w-10 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

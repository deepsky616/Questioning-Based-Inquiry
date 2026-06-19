// 라우트 전환 중 기본 로딩 표시
export default function Loading() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <span className="text-sm">불러오는 중...</span>
      </div>
    </div>
  );
}

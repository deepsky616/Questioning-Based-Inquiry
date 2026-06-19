import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// 대시보드 로딩 자리표시 — 요약 카드 + 분류 카드 형태를 미리 보여준다.
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-24" />
        </CardContent>
      </Card>
      {[0, 1].map((i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <Skeleton className="h-[120px] w-[120px] rounded-full" />
              <div className="grid grid-cols-2 gap-6 flex-1 w-full">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-2 w-full" />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

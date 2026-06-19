import { cn } from "@/lib/utils";

// 로딩 중 자리표시 — 콘텐츠 형태를 미리 보여줘 체감 속도를 높인다.
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

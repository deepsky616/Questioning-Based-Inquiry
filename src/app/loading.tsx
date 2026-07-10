import { RouteLoading } from "@/components/shared/RouteLoading";

// 라우트 전환 중 기본 로딩 표시 (그룹 밖 라우트용 — 그룹 내 이동은 각 그룹의 loading.tsx가 담당)
export default function Loading() {
  return <RouteLoading />;
}

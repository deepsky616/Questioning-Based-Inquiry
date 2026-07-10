import { RouteLoading } from "@/components/shared/RouteLoading";

// 그룹 내 메뉴 이동 시 즉시 표시되는 로딩 경계 — 내비는 유지되고 본문만 스피너로 바뀐다
export default function Loading() {
  return <RouteLoading />;
}

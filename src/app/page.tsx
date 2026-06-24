import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getRedirectPath } from "@/lib/route-access";
import type { UserRole } from "@/types/user";

// 루트 진입은 서버에서 즉시 적절한 곳으로 보낸다(로그인 사용자는 대시보드, 아니면 로그인).
// 클라이언트 스플래시 후 하이드레이션을 기다렸다 리다이렉트하던 홉·깜빡임을 제거한다.
export default async function Home() {
  const session = await auth();
  const role = (session?.user as { role?: UserRole } | undefined)?.role;
  redirect(getRedirectPath(role ?? null));
}

import { auth } from "@/lib/auth-edge";
import { NextResponse } from "next/server";
import { isPublicRoute, canAccess, getRedirectPath } from "@/lib/route-access";
import type { UserRole } from "@/types/user";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const role = req.auth?.user?.role as UserRole | undefined;

  // Resolve entry before rendering a page or loading server credential dependencies.
  if (pathname === "/") {
    return NextResponse.redirect(new URL(getRedirectPath(role ?? null), req.url));
  }

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  if (!canAccess(role ?? null, pathname)) {
    const redirectTo = role ? getRedirectPath(role) : "/login";
    return NextResponse.redirect(new URL(redirectTo, req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

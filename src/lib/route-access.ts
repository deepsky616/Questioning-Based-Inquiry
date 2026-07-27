import type { UserRole } from "@/types/user";

const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/demo/launch",
  "/api/",
];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function getRequiredRole(pathname: string): UserRole | null {
  if (pathname.startsWith("/teacher")) return "TEACHER";
  if (pathname.startsWith("/student")) return "STUDENT";
  return null;
}

export function canAccess(role: UserRole | null | undefined, pathname: string): boolean {
  const required = getRequiredRole(pathname);
  if (!required) return true;
  return role === required;
}

export function getRedirectPath(role: UserRole | null | undefined): string {
  if (role === "TEACHER") return "/teacher-dashboard";
  if (role === "STUDENT") return "/student-dashboard";
  return "/login";
}

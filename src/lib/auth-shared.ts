import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/types/user";

export const authCallbacks = {
  jwt: ({ token, user }) => {
    if (user) {
      token.id = user.id;
      token.role = user.role;
      token.school = user.school;
      token.grade = user.grade;
      token.className = user.className;
      token.studentNumber = user.studentNumber;
    }
    return token;
  },
  session: ({ session, token }) => {
    session.user.id = token.id as string;
    session.user.role = token.role as UserRole;
    session.user.school = (token.school as string | null) ?? null;
    session.user.grade = (token.grade as string | null) ?? null;
    session.user.className = (token.className as string | null) ?? null;
    session.user.studentNumber = (token.studentNumber as string | null) ?? null;
    return session;
  },
} satisfies NextAuthConfig["callbacks"];

export const authPages = {
  signIn: "/login",
  error: "/login",
} satisfies NextAuthConfig["pages"];

export const authSession = {
  strategy: "jwt",
} satisfies NextAuthConfig["session"];

export const edgeAuthConfig = {
  providers: [],
  callbacks: authCallbacks,
  pages: authPages,
  session: authSession,
} satisfies NextAuthConfig;
